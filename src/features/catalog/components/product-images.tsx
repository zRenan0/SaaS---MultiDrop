"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ImagePlus, Loader2, ShieldCheck, Star, Trash2, TriangleAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ActionForm } from "@/components/forms/action-form";
import { cn } from "@/lib/utils";
import {
  attachProductImageAction,
  removeProductImageAction,
  requestProductImageUploadAction,
  updateProductImagesAction,
} from "@/features/catalog/image-actions";
import { PRODUCT_IMAGE_MAX_BYTES, PRODUCT_IMAGE_MAX_COUNT, PRODUCT_IMAGE_TYPES, type ProductImage } from "@/features/catalog/images";

const MIN_SIDE = 500;

type UploadItem = { name: string; status: "sending" | "done" | "error"; note?: string };

/** Envia o arquivo direto ao Storage pela URL assinada (mesmo formato usado pelo supabase-js). */
async function uploadToSignedUrl(signedUrl: string, file: File) {
  const body = new FormData();
  body.append("cacheControl", "31536000");
  body.append("", file);
  const response = await fetch(signedUrl, { method: "PUT", body, headers: { "x-upsert": "false" } });
  if (!response.ok) throw new Error(`upload ${response.status}`);
}

async function smallestSide(file: File): Promise<number | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const side = Math.min(bitmap.width, bitmap.height);
    bitmap.close();
    return side;
  } catch {
    // Formato que o navegador não decodifica: o Storage e o Mercado Livre fazem a validação final.
    return null;
  }
}

function ImageButton({ action, productId, url, operation, children }: { action: (fd: FormData) => Promise<import("@/server/errors").ActionResult<unknown>>; productId: string; url: string; operation?: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <ActionForm action={action} onSuccess={() => router.refresh()}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="url" value={url} />
      {operation ? <input type="hidden" name="operation" value={operation} /> : null}
      {children}
    </ActionForm>
  );
}

/**
 * Fotos do produto usadas nos anúncios: envio por arrastar/clicar, capa, confirmação de uso e remoção.
 * Usado na página do produto e no rascunho do anúncio (o rascunho sempre usa as fotos atuais do produto).
 */
export function ProductImages({ productId, images, canWrite }: { productId: string; images: ProductImage[]; canWrite: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [, startTransition] = useTransition();
  const remaining = PRODUCT_IMAGE_MAX_COUNT - images.length;
  const pendingAuth = images.filter((i) => !i.authorized).length;
  const busy = uploads.some((u) => u.status === "sending");

  function patch(index: number, item: Partial<UploadItem>) {
    setUploads((list) => list.map((u, i) => (i === index ? { ...u, ...item } : u)));
  }

  async function handleFiles(files: FileList | File[] | null) {
    if (!files || !canWrite || busy) return;
    const all = Array.from(files);
    if (!all.length) return;
    if (!confirmed) {
      toast.error("Marque a confirmação de uso das fotos antes de enviar.");
      return;
    }
    if (all.length > remaining) toast.warning(`Cabem só mais ${remaining} foto(s) neste produto; as demais foram ignoradas.`);
    const list = all.slice(0, remaining);
    setUploads(list.map((f) => ({ name: f.name, status: "sending" })));
    let added = 0;
    for (const [index, file] of list.entries()) {
      if (!(file.type in PRODUCT_IMAGE_TYPES)) {
        patch(index, { status: "error", note: "Formato não aceito. Use JPG, PNG ou WEBP." });
        continue;
      }
      if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
        patch(index, { status: "error", note: "Arquivo maior que 10 MB." });
        continue;
      }
      const side = await smallestSide(file);
      const request = await requestProductImageUploadAction({ productId, contentType: file.type as keyof typeof PRODUCT_IMAGE_TYPES, size: file.size });
      if (!request.ok || !request.data) {
        patch(index, { status: "error", note: request.ok ? "Falha ao preparar o envio." : request.error });
        continue;
      }
      try {
        await uploadToSignedUrl(request.data.signedUrl, file);
      } catch {
        patch(index, { status: "error", note: "O envio falhou. Tente de novo." });
        continue;
      }
      const attached = await attachProductImageAction({ productId, path: request.data.path, authorized: true });
      if (!attached.ok) {
        patch(index, { status: "error", note: attached.error });
        continue;
      }
      added += 1;
      patch(index, {
        status: "done",
        note: side !== null && side < MIN_SIDE ? `Enviada, mas pequena (${side} px). O Mercado Livre recomenda pelo menos ${MIN_SIDE}×${MIN_SIDE} px.` : undefined,
      });
    }
    if (inputRef.current) inputRef.current.value = "";
    if (added > 0) {
      toast.success(added === 1 ? "Foto adicionada." : `${added} fotos adicionadas.`);
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="grid gap-4">
      {pendingAuth > 0 ? (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">
            {pendingAuth === 1 ? "1 foto aguarda" : `${pendingAuth} fotos aguardam`} sua confirmação de uso. O anúncio só é validado com fotos que você pode usar (suas ou
            autorizadas pelo fornecedor).
          </p>
          {canWrite ? (
            <ActionForm action={updateProductImagesAction} onSuccess={() => router.refresh()}>
              <input type="hidden" name="productId" value={productId} />
              <input type="hidden" name="operation" value="authorize_all" />
              <Button type="submit" size="sm">
                <ShieldCheck aria-hidden /> Confirmar uso de todas
              </Button>
            </ActionForm>
          ) : null}
        </div>
      ) : null}

      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Fotos do produto">
          {images.map((img, index) => (
            <li key={img.url} className={cn("grid content-start gap-2 rounded-lg border p-2", !img.authorized && "border-warning/60")}>
              <div className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element -- URLs de origens variadas; otimização de imagem não se aplica. */}
                <img src={img.url} alt={`Foto ${index + 1} do produto`} className="aspect-square w-full rounded-md bg-muted object-contain" loading="lazy" />
                {index === 0 ? (
                  <span className="absolute top-1 left-1 inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">
                    <Star className="size-3" aria-hidden /> Capa
                  </span>
                ) : null}
              </div>
              <p className={cn("flex items-center gap-1 text-xs", img.authorized ? "text-muted-foreground" : "text-warning-foreground")}>
                {img.authorized ? <CheckCircle2 className="size-3 text-success" aria-hidden /> : <TriangleAlert className="size-3" aria-hidden />}
                {img.authorized ? "Uso confirmado" : "Confirmação pendente"}
              </p>
              {canWrite ? (
                <div className="grid gap-1">
                  {!img.authorized ? (
                    <ImageButton action={updateProductImagesAction} productId={productId} url={img.url} operation="authorize">
                      <Button type="submit" variant="outline" size="sm" className="w-full">Confirmar uso</Button>
                    </ImageButton>
                  ) : null}
                  {index > 0 ? (
                    <ImageButton action={updateProductImagesAction} productId={productId} url={img.url} operation="cover">
                      <Button type="submit" variant="ghost" size="sm" className="w-full">Usar como capa</Button>
                    </ImageButton>
                  ) : null}
                  <ImageButton action={removeProductImageAction} productId={productId} url={img.url}>
                    <Button type="submit" variant="ghost" size="sm" className="w-full text-destructive">
                      <Trash2 aria-hidden /> Remover
                    </Button>
                  </ImageButton>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {canWrite && remaining > 0 ? (
        <div className="grid gap-3">
          <div className="flex items-start gap-2">
            <Checkbox id={`confirm-${productId}`} checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
            <Label htmlFor={`confirm-${productId}`} className="font-normal leading-snug">
              As fotos que vou enviar são minhas ou o fornecedor autorizou o uso nos anúncios.
            </Label>
          </div>
          <label
            htmlFor={`file-${productId}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              void handleFiles(e.dataTransfer.files);
            }}
            className={cn(
              "grid cursor-pointer place-items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center text-sm transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/60 hover:bg-muted/40",
              (!confirmed || busy) && "cursor-not-allowed opacity-60",
            )}
          >
            {busy ? <Loader2 className="size-6 animate-spin text-muted-foreground" aria-hidden /> : <ImagePlus className="size-6 text-muted-foreground" aria-hidden />}
            <span className="font-medium">{busy ? "Enviando fotos…" : confirmed ? "Arraste as fotos para cá ou clique para escolher" : "Marque a confirmação acima para enviar fotos"}</span>
            <span className="text-xs text-muted-foreground">
              JPG, PNG ou WEBP, até 10 MB cada. Dica: fundo branco, produto inteiro e sem textos ou logotipos. Faltam {remaining} de {PRODUCT_IMAGE_MAX_COUNT}.
            </span>
            <input
              ref={inputRef}
              id={`file-${productId}`}
              type="file"
              accept={Object.keys(PRODUCT_IMAGE_TYPES).join(",")}
              multiple
              disabled={!confirmed || busy}
              className="sr-only"
              aria-label="Escolher fotos do produto"
              onChange={(event) => void handleFiles(event.target.files)}
            />
          </label>
          {uploads.length > 0 ? (
            <ul className="grid gap-1 text-sm" aria-label="Envio das fotos">
              {uploads.map((u, i) => (
                <li key={`${u.name}-${i}`} className="flex items-start gap-2">
                  {u.status === "sending" ? (
                    <Loader2 className="mt-0.5 size-4 shrink-0 animate-spin" aria-hidden />
                  ) : u.status === "done" ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
                  ) : (
                    <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                  )}
                  <span className="min-w-0 break-all">
                    {u.name}
                    {u.note ? <span className="block text-xs text-muted-foreground">{u.note}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {canWrite && remaining <= 0 ? <p className="text-xs text-muted-foreground">Limite de {PRODUCT_IMAGE_MAX_COUNT} fotos atingido. Remova uma para enviar outra.</p> : null}
      {images.length === 0 && !canWrite ? <p className="text-sm text-muted-foreground">Sem fotos.</p> : null}
    </div>
  );
}
