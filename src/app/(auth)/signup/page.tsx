import type { Metadata } from "next";
import { SignUpForm } from "@/features/auth/components/auth-forms";

export const metadata: Metadata = { title: "Criar conta" };

export default function SignUpPage() {
  return <SignUpForm />;
}
