export const IMPORT_LIMITS = {
  maxFileBytes: 5 * 1024 * 1024,
  maxRows: 5000,
  maxColumns: 60,
  maxCellLength: 50_000,
  maxStoredErrors: 500,
} as const;
