import type { Json } from "@/types/database";

/**
 * Valores decimais são enviados ao PostgREST como string para preservar a precisão exata
 * (o Postgres converte para numeric). Os tipos gerados declaram `number`, por isso a conversão de tipo.
 */
export function numeric(value: string): number {
  if (!/^-?\d+(\.\d+)?$/.test(value)) throw new Error(`Valor decimal inválido: ${value}`);
  return value as unknown as number;
}

/** Converte um valor serializável em JSON para o tipo aceito pelas colunas jsonb. */
export function asJson<T>(value: T): NonNullable<Json> {
  return JSON.parse(JSON.stringify(value)) as NonNullable<Json>;
}
