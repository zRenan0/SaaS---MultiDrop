"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { ActionForm } from "@/components/forms/action-form";
import { attachProductImageAction, removeProductImageAction, requestProductImageUploadAction } from "@/features/catalog/image-actions";
import { PRODUCT_IMAGE_MAX_BYTES, PRODUCT_IMAGE_MAX_COUNT, PRODUCT_IMAGE_TYPES, type ProductImage } from "@/features/catalog/images";

/** Envia o arquivo direto ao Storage pela URL assinada (mesmo formato usado pelo supabase-js). */
async function uploadToSignedUrl(signedUrl: string, file: File) {
  const body = new FormData();
  body.append("cacheControl", "31536000");
  body.append("", file);
  const response = await fetch(signedUrl, { method: "PUT", body, headers: { "x-upsert": "false" } });
  if (!response.ok) throw new Error(`upload ${response.status}`);
}

export function ProductImages({ productId, images, canWrite }: { productId: string; images: ProductImage[]; canWrite: boolean }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [authorized, setAuthorized] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const remaining = PRODUCT_IMAGE_MAX_COUNT - images.length;

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    const list = Array.from(files).slice(0, remaining);
    if (files.length > remaining) toast.warning(`Só cabem mais ${remaining} imagens neste produto.`);
    let added = 0;
    for (const [index, file] of list.entries()) {
      setProgress(`Enviando ${index + 1} de ${list.length}…`);
      if (!(file.type in PRODUCT_IMAGE_TYPES)) {
        toast.error(`${file.name}: use JPG, PNG ou WEBP.`);
        continue;
      }
      if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
        toast.error(`${file.name}: máximo de 10 MB.`);
        continue;
      }
      const request = await requestProductImageUploadAction({ productId, contentType: file.type as keyof typeof PRODUCT_IMAGE_TYPES, size: file.size });
      if (!request.ok || !request.data) {
        toast.error(request.ok ? "Falha ao preparar o envio." : request.error);
        break;
      }
      try {
        await uploadToSignedUrl(request.data.signedUrl, file);
      } catch {
        toast.error(`${file.name}: o envio falhou. Tente de novo.`);
        continue;
      }
      const attached = await attachProductImageAction({ productId, path: request.data.path, authorized });
      if (attached.ok) added += 1;
      else toast.error(attached.error);
    }
    setProgress(null);
    if (inputRef.current) inputRef.current.value = "";
    if (added > 0) {
      toast.success(added === 1 ? "Imagem adicionada." : `${added} imagens adicionadas.`);
      startTransition(() => router.refresh());
    }
  }

  return (
    <div className="grid gap-3">
      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {images.map((img) => (
            <li key={img.url} className="grid gap-1 rounded-lg border p-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- URLs externas variadas; otimização de imagem não se aplica aqui. */}
              <img src={img.url} alt="Imagem do produto" className="aspect-square w-full rounded-md bg-muted object-contain" loading="lazy" />
              {img.authorized ? <StatusBadge tone="success">Autorizada</StatusBadge> : <StatusBadge tone="warning">Autorização não confirmada</StatusBadge>}
              {canWrite ? (
                <ActionForm action={removeProductImageAction} onSuccess={() => router.refresh()}>
                  <input type="hidden" name="productId" value={productId} />
                  <input type="hidden" name="url" value={img.url} />
                  <Button type="submit" variant="ghost" size="sm" className="w-full">
                    <Trash2 aria-hidden /> Remover
                  </Button>
                </ActionForm>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground">Sem imagens. Anúncios exigem pelo menos uma imagem autorizada.</p>
      )}
      {canWrite && remaining > 0 ? (
        <div className="grid gap-2 rounded-lg border border-dashed p-3">
          <div className="flex items-start gap-2">
            <Checkbox id="upload-authorized" checked={authorized} onCheckedChange={(v) => setAuthorized(v === true)} />
            <Label htmlFor="upload-authorized" className="font-normal">Tenho autorização para usar estas imagens em anúncios.</Label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={inputRef}
              id="product-image-input"
              type="file"
              accept={Object.keys(PRODUCT_IMAGE_TYPES).join(",")}
              multiple
              className="sr-only"
              aria-label="Escolher imagens do produto"
              onChange={(event) => void handleFiles(event.target.files)}
            />
            <Button type="button" variant="outline" size="sm" disabled={progress !== null} onClick={() => inputRef.current?.click()}>
              <ImagePlus aria-hidden /> {progress ?? "Enviar imagens"}
            </Button>
            <span className="text-xs text-muted-foreground">JPG, PNG ou WEBP, até 10 MB cada. Faltam {remaining} de {PRODUCT_IMAGE_MAX_COUNT}.</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
