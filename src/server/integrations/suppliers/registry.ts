import type { SupplierAdapter } from "@/server/integrations/suppliers/types";
import { fileImportAdapter, genericRestAdapter, manualAdapter } from "@/server/integrations/suppliers/adapters";

const adapters = new Map<string, SupplierAdapter>(
  [manualAdapter, fileImportAdapter, genericRestAdapter].map((adapter) => [adapter.key, adapter]),
);

export function getSupplierAdapter(key: string): SupplierAdapter | null {
  return adapters.get(key) ?? null;
}

export function listSupplierAdapters(): SupplierAdapter[] {
  return [...adapters.values()];
}
