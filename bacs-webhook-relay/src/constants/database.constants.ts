export const TABLES = {
  PAYMENT_WEBHOOKS: 'payment_webhooks',
} as const;

export const POSTGRES_INVALID_AUTH_CODES: ReadonlySet<string> = new Set<string>([
  '28P01',
  '28000',
]);

export const DB_DEFAULTS = {
  POOL_MAX: 5,
  IDLE_TIMEOUT_MS: 30_000,
  CONNECTION_TIMEOUT_MS: 5_000,
  STATEMENT_TIMEOUT_MS: 10_000,
} as const;
