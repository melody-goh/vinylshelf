import { z } from 'zod';

/** ADR 0004: Discogs data may not be shown more than 6 hours after it was fetched. */
export const MAX_DISCOGS_TTL_SECONDS = 6 * 60 * 60;

const base64Key = z
  .string()
  .min(1, 'is required')
  .transform((value, ctx) => {
    const key = Buffer.from(value, 'base64');
    if (key.length !== 32) {
      ctx.addIssue({ code: 'custom', message: 'must be 32 random bytes, base64-encoded' });
      return z.NEVER;
    }
    return key;
  });

const required = z.string().trim().min(1, 'is required');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    WEB_ORIGIN: z.url().transform((url) => new URL(url).origin),
    DATABASE_URL: z.url(),

    TOKEN_ENCRYPTION_KEY: base64Key,

    DISCOGS_CONSUMER_KEY: required,
    DISCOGS_CONSUMER_SECRET: required,
    DISCOGS_CALLBACK_URL: z.url(),
    DISCOGS_USER_AGENT: required,

    DISCOGS_CACHE_TTL_SECONDS: z.coerce
      .number()
      .int()
      .min(1)
      .max(MAX_DISCOGS_TTL_SECONDS, 'must not exceed 6 hours (ADR 0004)')
      .default(MAX_DISCOGS_TTL_SECONDS),
    DISCOGS_REFRESH_AFTER_SECONDS: z.coerce
      .number()
      .int()
      .min(0)
      .default(5 * 60 * 60),
    REFRESH_COOLDOWN_MINUTES: z.coerce.number().int().min(0).default(15),

    QUEUE_POLLING_INTERVAL_SECONDS: z.coerce.number().min(0.5).default(2),
    CACHE_PURGE_CRON: z.string().trim().min(1).default('*/15 * * * *'),
  })
  .refine((env) => env.DISCOGS_REFRESH_AFTER_SECONDS < env.DISCOGS_CACHE_TTL_SECONDS, {
    path: ['DISCOGS_REFRESH_AFTER_SECONDS'],
    message: 'must be shorter than DISCOGS_CACHE_TTL_SECONDS, or data expires before it refreshes',
  });

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  logLevel: string;
  webOrigin: string;
  databaseUrl: string;
  tokenEncryptionKey: Buffer;
  discogs: {
    consumerKey: string;
    consumerSecret: string;
    callbackUrl: string;
    userAgent: string;
    cacheTtlSeconds: number;
    refreshAfterSeconds: number;
  };
  refreshCooldownMinutes: number;
  queue: {
    pollingIntervalSeconds: number;
    cachePurgeCron: string;
  };
}

export class ConfigError extends Error {
  override name = 'ConfigError';
}

/**
 * Validates the environment once, at startup, so a misconfigured deploy fails
 * immediately with every problem listed, instead of at the first request that happens
 * to need the missing value. Values are never echoed, because some are secrets.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((issue) => `  ${issue.path.join('.')}: ${issue.message}`);
    throw new ConfigError(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    logLevel: e.LOG_LEVEL,
    webOrigin: e.WEB_ORIGIN,
    databaseUrl: e.DATABASE_URL,
    tokenEncryptionKey: e.TOKEN_ENCRYPTION_KEY,
    discogs: {
      consumerKey: e.DISCOGS_CONSUMER_KEY,
      consumerSecret: e.DISCOGS_CONSUMER_SECRET,
      callbackUrl: e.DISCOGS_CALLBACK_URL,
      userAgent: e.DISCOGS_USER_AGENT,
      cacheTtlSeconds: e.DISCOGS_CACHE_TTL_SECONDS,
      refreshAfterSeconds: e.DISCOGS_REFRESH_AFTER_SECONDS,
    },
    refreshCooldownMinutes: e.REFRESH_COOLDOWN_MINUTES,
    queue: {
      pollingIntervalSeconds: e.QUEUE_POLLING_INTERVAL_SECONDS,
      cachePurgeCron: e.CACHE_PURGE_CRON,
    },
  };
}
