import type { Express } from 'express';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app';
import type { AppConfig } from '../src/config';
import { openDatabase, type Db } from '../src/db/database';
import { seedDatabase } from '../src/db/seed';
import { SEED_USERS } from '../src/db/seed-data';
import { createLogger, type Logger } from '../src/logger';

export const TEST_SECRET = 'test-only-secret-at-least-32-characters-long';
/** 12:00 in Riyadh. Seeded order dates are relative to this instant. */
export const FIXED_NOW = Date.parse('2026-10-19T09:00:00.000Z');
export const APP_ORIGIN = 'http://localhost:5173';

const [admin, agent, secondAgent] = SEED_USERS;
export const ADMIN = admin!;
export const AGENT = agent!;
export const SECOND_AGENT = secondAgent!;

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    databasePath: '',
    jwtSecret: TEST_SECRET,
    allowedOrigins: [APP_ORIGIN],
    cookieSecure: false,
    businessTimeZone: 'Asia/Riyadh',
    statsDelayMs: { min: 0, max: 0 },
    devSimulation: true,
    logLevel: 'silent',
    ...overrides,
  };
}

export interface TestContext {
  app: Express;
  db: Db;
  config: AppConfig;
  close(): void;
}

/** A real SQLite file per suite (WAL, triggers, FTS — exactly what production runs). */
export async function createTestContext(
  options: { orders?: number; config?: Partial<AppConfig>; logger?: Logger } = {},
): Promise<TestContext> {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'orders-api-test-'));
  const databasePath = path.join(directory, 'orders.db');
  await seedDatabase({ databasePath, orderCount: options.orders ?? 0, now: FIXED_NOW });
  const db = openDatabase(databasePath);
  const config = testConfig({ databasePath, ...options.config });
  const app = createApp({ db, config, logger: options.logger ?? createLogger('silent') });
  return {
    app,
    db,
    config,
    close() {
      db.close();
      rmSync(directory, { recursive: true, force: true });
    },
  };
}

/** A supertest agent that keeps the session cookie between requests. */
export async function signIn(app: Express, user: { email: string; password: string }) {
  const client = request.agent(app);
  await client
    .post('/api/auth/login')
    .send({ email: user.email, password: user.password })
    .expect(200);
  return client;
}

/**
 * A real listening server, for tests that need truly concurrent connections or a client that
 * hangs up mid-request (supertest cannot abort).
 */
export async function listen(app: Express): Promise<{ baseUrl: string; close(): Promise<void> }> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

/** Signs in over real HTTP and returns the `Cookie` header value. */
export async function sessionCookieFor(
  baseUrl: string,
  user: { email: string; password: string },
): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith('session='));
  if (!response.ok || !cookie) throw new Error(`Sign-in failed with ${response.status}`);
  return cookie.split(';')[0]!;
}

/** A logger that records lines, for asserting what the server did after a client left. */
export function recordingLogger(): Logger & { lines: string[] } {
  const lines: string[] = [];
  const record = (message: string) => {
    lines.push(message);
  };
  return { lines, debug: record, info: record, warn: record, error: record };
}
