export const DRAFT_STATUS = {
  draft: ["Rascunho", "neutral"],
  validated: ["Validado", "success"],
  invalid: ["Com problemas", "warning"],
  publishing: ["Publicando", "info"],
  published: ["Publicado", "success"],
  failed: ["Falhou", "danger"],
} as const;

export const LISTING_STATUS: Record<string, [string, "success" | "warning" | "danger" | "neutral" | "info"]> = {
  active: ["Ativo", "success"],
  paused: ["Pausado", "warning"],
  closed: ["Encerrado", "neutral"],
  under_review: ["Em revisão", "info"],
  inactive: ["Inativo", "neutral"],
};
