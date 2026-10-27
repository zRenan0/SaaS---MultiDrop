import { requireUser } from "@/server/session";

export default async function AppRootLayout({ children }: LayoutProps<"/app">) {
  await requireUser();
  return children;
}
