import Link from "next/link";
import { Boxes } from "lucide-react";
import { appConfig } from "@/lib/app-config";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center bg-muted/40 px-4 py-10">
      <Link href="/" className="mb-6 flex items-center gap-2 font-semibold">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
          <Boxes className="size-4" aria-hidden />
        </span>
        {appConfig.name}
      </Link>
      <main className="w-full max-w-sm">{children}</main>
    </div>
  );
}
