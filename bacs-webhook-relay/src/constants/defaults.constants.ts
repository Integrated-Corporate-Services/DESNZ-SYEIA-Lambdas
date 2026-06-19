export const RETRY_DEFAULTS = {
  ATTEMPTS: 3,
  BASE_DELAY_MS: 250,
  MAX_DELAY_MS: 2_000,
} as const;

export const CACHE_TTL_DEFAULTS = {
  SECRET_MS: 5 * 60_000,
  SSM_MS: 5 * 60_000,
} as const;

export const BATCH_SIZE = {
  DEFAULT: 25,
  MAX: 100,
} as const;
