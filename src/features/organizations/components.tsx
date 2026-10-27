"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field } from "@/components/forms/field";
import { FormStatus, fieldError } from "@/components/forms/form-status";
import { SubmitButton } from "@/components/forms/submit-button";
import { ServerForm } from "@/components/forms/server-form";
import { acceptInvitationAction, createOrganizationAction } from "@/features/organizations/actions";
import { slugify } from "@/features/organizations/schemas";

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState(createOrganizationAction, null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Criar empresa</CardTitle>
        <CardDescription>Cada empresa tem dados, integrações e plano próprios.</CardDescription>
      </CardHeader>
      <ServerForm action={action} pending={pending} noValidate>
        <CardContent className="grid gap-4">
          <FormStatus state={state} />
          <Field label="Nome da empresa" htmlFor="name" error={fieldError(state, "name")}>
            <Input
              id="name"
              name="name"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (!slugTouched) setSlug(slugify(e.target.value));
              }}
            />
          </Field>
          <Field label="Identificador" htmlFor="slug" error={fieldError(state, "slug")} hint="Usado internamente. Letras minúsculas, números e hífen.">
            <Input
              id="slug"
              name="slug"
              required
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(e.target.value);
              }}
            />
          </Field>
        </CardContent>
        <CardFooter className="pt-4">
          <SubmitButton pendingText="Criando…">Criar empresa</SubmitButton>
        </CardFooter>
      </ServerForm>
    </Card>
  );
}

export function AcceptInvitationForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInvitationAction, null);
  return (
    <ServerForm action={action} pending={pending} className="grid gap-4">
      <FormStatus state={state} />
      <input type="hidden" name="token" value={token} />
      <SubmitButton pendingText="Entrando…">Aceitar convite</SubmitButton>
    </ServerForm>
  );
}
