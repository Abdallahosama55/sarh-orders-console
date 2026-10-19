import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** `.env` and relative DATABASE_PATH values resolve from the repository root, whatever the cwd. */
export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export const LOG_LEVELS = ['debug', 'info', 'warn', 'error', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export interface AppConfig {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databasePath: string;
  jwtSecret: string;
  /** Origins allowed to send state-changing requests (CSRF defence in depth, SEC-3). */
  allowedOrigins: string[];
  cookieSecure: boolean;
  businessTimeZone: string;
  statsDelayMs: { min: number; max: number };
  /** Honour the X-Debug-* simulation headers. Never true in production. */
  devSimulation: boolean;
  logLevel: LogLevel;
}

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  DATABASE_PATH: z.string().min(1).default('data/orders.db'),
  // The inherited code hard-coded "sarh-secret-2026": committed to git and guessable offline
  // from any issued token. Now it must come from the environment and be long (SEC-2).
  JWT_SECRET: z
    .string({
      error: 'JWT_SECRET is not set. Run `npm run setup` to create .env with a random secret.',
    })
    .min(32, 'JWT_SECRET must be at least 32 characters. Run `npm run setup` to generate one.'),
  APP_ORIGIN: z
    .string()
    .default('http://localhost:5173')
    .refine(
      (value) => value.split(',').every((origin) => URL.canParse(origin.trim())),
      'APP_ORIGIN must be a comma-separated list of origins such as http://localhost:5173',
    ),
  COOKIE_SECURE: z.enum(['true', 'false']).optional(),
  BUSINESS_TIME_ZONE: z
    .string()
    .default('Asia/Riyadh')
    .refine(isValidTimeZone, 'BUSINESS_TIME_ZONE must be an IANA time zone such as Asia/Riyadh'),
  STATS_DELAY_MS: z
    .string()
    .regex(/^\d+-\d+$/, 'STATS_DELAY_MS must look like "3000-6000"')
    .default('3000-6000'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
});

export class ConfigError extends Error {
  override name = 'ConfigError';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const result = envSchema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(`Invalid configuration:\n${z.prettifyError(result.error)}`);
  }
  const values = result.data;
  const [min = 0, max = 0] = values.STATS_DELAY_MS.split('-').map(Number);
  if (min > max) throw new ConfigError('STATS_DELAY_MS: the minimum must not exceed the maximum');

  return {
    nodeEnv: values.NODE_ENV,
    port: values.PORT,
    databasePath: resolveDatabasePath(values.DATABASE_PATH),
    jwtSecret: values.JWT_SECRET,
    allowedOrigins: values.APP_ORIGIN.split(',').map((origin) => new URL(origin.trim()).origin),
    cookieSecure: values.COOKIE_SECURE
      ? values.COOKIE_SECURE === 'true'
      : values.NODE_ENV === 'production',
    businessTimeZone: values.BUSINESS_TIME_ZONE,
    statsDelayMs: { min, max },
    devSimulation: values.NODE_ENV !== 'production',
    logLevel: values.LOG_LEVEL,
  };
}

export function resolveDatabasePath(value = process.env.DATABASE_PATH ?? 'data/orders.db'): string {
  return path.resolve(REPO_ROOT, value);
}

/** Loads `<repo>/.env` when present. Variables already set in the environment take precedence. */
export function loadDotEnv(): void {
  const file = path.join(REPO_ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
}
