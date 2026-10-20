// Entry point of the Vercel demo deployment, bundled by scripts/vercel-build.mjs.
// Vercel functions have no persistent disk, so each serverless instance seeds its own SQLite
// file in /tmp on cold start. Data added there lasts as long as that instance. It is a demo,
// not a production topology; SCALE.md describes what production would need.
import type { Express } from 'express';
import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createApp } from './app';
import { loadConfig } from './config';
import { migrate, openDatabase } from './db/database';
import { DEFAULT_ORDER_COUNT, seedDatabase } from './db/seed';
import { createLogger } from './logger';

let app: Promise<Express> | undefined;

async function createVercelApp(): Promise<Express> {
  process.env.DATABASE_PATH ??= '/tmp/orders.db';
  const origins = vercelOrigins();
  if (!process.env.APP_ORIGIN && origins) process.env.APP_ORIGIN = origins;

  const config = loadConfig();
  if (!existsSync(config.databasePath)) {
    const orderCount = Number(process.env.SEED_ORDERS ?? DEFAULT_ORDER_COUNT);
    await seedDatabase({ databasePath: config.databasePath, orderCount });
  }
  const db = openDatabase(config.databasePath);
  migrate(db);

  const vercelApp = createApp({ db, config, logger: createLogger(config.logLevel) });
  // Requests reach the function through exactly one proxy (Vercel's edge). Trusting that hop
  // gives the rate limiter the client's IP, without trusting anything the client sends.
  vercelApp.set('trust proxy', 1);
  return vercelApp;
}

/** This deployment's own https origins, so the CSRF origin check accepts them. */
function vercelOrigins(): string | undefined {
  const hosts = [
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_BRANCH_URL,
    process.env.VERCEL_URL,
  ].filter((host): host is string => Boolean(host));
  return hosts.length > 0 ? hosts.map((host) => `https://${host}`).join(',') : undefined;
}

export default async function handler(req: IncomingMessage, res: ServerResponse): Promise<void> {
  app ??= createVercelApp(); // once per instance, shared by concurrent requests
  (await app)(req, res);
}
