"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/forms/field";
import { FormStatus, fieldError } from "@/components/forms/form-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { ServerForm } from "@/components/forms/server-form";
import {
  forgotPasswordAction,
  resetPasswordAction,
  signInAction,
  signUpAction,
} from "@/features/auth/actions";

export function SignInForm({ next, notice }: { next?: string; notice?: string }) {
  const [state, action, pending] = useActionState(signInAction, null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>Acesse o painel da sua empresa.</CardDescription>
      </CardHeader>
      <ServerForm action={action} pending={pending} noValidate>
        <CardContent className="grid gap-4">
          {notice ? <p className="text-sm text-destructive" role="alert">{notice}</p> : null}
          <FormStatus state={state} />
          <input type="hidden" name="next" value={next ?? ""} />
          <Field label="E-mail" htmlFor="email" error={fieldError(state, "email")}>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field label="Senha" htmlFor="password" error={fieldError(state, "password")}>
            <Input id="password" name="password" type="password" autoComplete="current-password" required />
          </Field>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 pt-4">
          <SubmitButton className="w-full" pendingText="Entrando…">Entrar</SubmitButton>
          <div className="flex w-full justify-between text-sm">
            <Link href="/forgot-password" className="text-muted-foreground underline-offset-4 hover:underline">
              Esqueci a senha
            </Link>
            <Link href="/signup" className="text-primary underline-offset-4 hover:underline">
              Criar conta
            </Link>
          </div>
        </CardFooter>
      </ServerForm>
    </Card>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar conta</CardTitle>
        <CardDescription>Depois do cadastro você cria ou entra em uma empresa.</CardDescription>
      </CardHeader>
      <ServerForm action={action} pending={pending} noValidate>
        <CardContent className="grid gap-4">
          <FormStatus state={state} />
          <Field label="Nome" htmlFor="fullName" error={fieldError(state, "fullName")}>
            <Input id="fullName" name="fullName" autoComplete="name" required />
          </Field>
          <Field label="E-mail" htmlFor="email" error={fieldError(state, "email")}>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
          <Field
            label="Senha"
            htmlFor="password"
            error={fieldError(state, "password")}
            hint="Mínimo de 10 caracteres, com letras e números."
          >
            <Input id="password" name="password" type="password" autoComplete="new-password" required />
          </Field>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 pt-4">
          <SubmitButton className="w-full" pendingText="Criando…">Criar conta</SubmitButton>
          <p className="text-sm text-muted-foreground">
            Já tem conta?{" "}
            <Link href="/login" className="text-primary underline-offset-4 hover:underline">
              Entrar
            </Link>
          </p>
          <p className="text-xs text-muted-foreground">
            Ao criar a conta você concorda com os <Link href="/legal/termos" className="underline">Termos de uso</Link> e a{" "}
            <Link href="/legal/privacidade" className="underline">Política de privacidade</Link>.
          </p>
        </CardFooter>
      </ServerForm>
    </Card>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(forgotPasswordAction, null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar senha</CardTitle>
        <CardDescription>Enviaremos um link para redefinir sua senha.</CardDescription>
      </CardHeader>
      <ServerForm action={action} pending={pending} noValidate>
        <CardContent className="grid gap-4">
          <FormStatus state={state} />
          <Field label="E-mail" htmlFor="email" error={fieldError(state, "email")}>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </Field>
        </CardContent>
        <CardFooter className="flex flex-col gap-3 pt-4">
          <SubmitButton className="w-full" pendingText="Enviando…">Enviar link</SubmitButton>
          <Link href="/login" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
            Voltar ao login
          </Link>
        </CardFooter>
      </ServerForm>
    </Card>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(resetPasswordAction, null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova senha</CardTitle>
        <CardDescription>Defina uma nova senha para sua conta.</CardDescription>
      </CardHeader>
      <ServerForm action={action} pending={pending} noValidate>
        <CardContent className="grid gap-4">
          <FormStatus state={state} />
          <Field label="Nova senha" htmlFor="password" error={fieldError(state, "password")}>
            <Input id="password" name="password" type="password" autoComplete="new-password" required />
          </Field>
          <Field label="Confirme a senha" htmlFor="confirm" error={fieldError(state, "confirm")}>
            <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
          </Field>
        </CardContent>
        <CardFooter className="pt-4">
          <SubmitButton className="w-full">Salvar senha</SubmitButton>
        </CardFooter>
      </ServerForm>
    </Card>
  );
}
