import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
  type CreateOrderInput,
} from '@orders/shared';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../db/database';
import { seedDatabase } from '../db/seed';
import { SEED_USERS } from '../db/seed-data';

/**
 * R2-9 proof. Two independent API *processes* share one fresh SQLite file, and identical create
 * requests (same Idempotency-Key) are fired at both in parallel. Each process has its own
 * memory and event loop, so only the database's unique constraint can keep the count at one.
 * Results are read straight from the database file, not from the API.
 */

const SERVER_ENTRY = fileURLToPath(new URL('../server.ts', import.meta.url));
const API_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export interface ScenarioResult {
  title: string;
  responses: Array<{
    server: 'A' | 'B';
    status: number;
    orderId?: number;
    replayed: boolean;
    code?: string;
  }>;
  ordersWithKey: number;
  passed: boolean;
}

export interface ProofResult {
  databasePath: string;
  scenarios: ScenarioResult[];
  totalOrders: number;
  passed: boolean;
}

const DRAFT: CreateOrderInput = {
  customer: { name: 'Proof Customer', email: 'proof@example.com' },
  items: [
    { productName: 'Sukkari Dates Gift Box', quantity: 2, unitPriceCents: 9_500 },
    { productName: 'Arabic Coffee Dallah', quantity: 1, unitPriceCents: 12_000 },
  ],
};

export async function runDuplicateProof(
  log: (line: string) => void = () => {},
): Promise<ProofResult> {
  const workDir = mkdtempSync(path.join(os.tmpdir(), 'orders-proof-'));
  const databasePath = path.join(workDir, 'orders.db');
  await seedDatabase({ databasePath, orderCount: 0 }); // users only: the orders table starts empty

  const secret = randomBytes(32).toString('hex');
  const servers: ChildProcess[] = [];
  try {
    const [urlA, urlB] = await Promise.all([
      startServer(databasePath, secret, servers),
      startServer(databasePath, secret, servers),
    ]);
    log(`database  ${databasePath} (fresh: 0 orders)`);
    log(`servers   A ${urlA} (pid ${servers[0]?.pid}) · B ${urlB} (pid ${servers[1]?.pid})`);

    const agent = SEED_USERS.find((user) => user.role === 'agent')!;
    const cookie = await signIn(urlA, agent);
    const db = openDatabase(databasePath, { readonly: true });
    const ordersWithKey = (key: string) =>
      (
        db.prepare('SELECT COUNT(*) AS n FROM orders WHERE idempotency_key = ?').get(key) as {
          n: number;
        }
      ).n;
    const create = async (server: 'A' | 'B', key: string, body: CreateOrderInput) => {
      const response = await fetch(`${server === 'A' ? urlA : urlB}/api/orders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie, [IDEMPOTENCY_KEY_HEADER]: key },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        id?: number;
        error?: { code: string; details?: { orderId?: number } };
      };
      return {
        server,
        status: response.status,
        orderId: payload.id ?? payload.error?.details?.orderId,
        replayed: response.headers.get(IDEMPOTENT_REPLAYED_HEADER) === 'true',
        code: payload.error?.code,
      };
    };

    try {
      const scenarios: ScenarioResult[] = [];

      // 1. The brief's proof: the same request twice, in parallel (a double click, a resend).
      const doubleKey = randomUUID();
      const double = await Promise.all([
        create('A', doubleKey, DRAFT),
        create('B', doubleKey, DRAFT),
      ]);
      scenarios.push({
        title: 'Same request twice in parallel, one to each process',
        responses: double,
        ordersWithKey: ordersWithKey(doubleKey),
        passed:
          ordersWithKey(doubleKey) === 1 &&
          double.every((r) => r.status === 201) &&
          new Set(double.map((r) => r.orderId)).size === 1 &&
          double.filter((r) => r.replayed).length === 1,
      });

      // 2. A retry storm: a flaky mobile network resending the same request many times.
      const stormKey = randomUUID();
      const storm = await Promise.all(
        Array.from({ length: 20 }, (_, i) => create(i % 2 === 0 ? 'A' : 'B', stormKey, DRAFT)),
      );
      scenarios.push({
        title: 'Retry storm: 20 identical requests split across both processes',
        responses: storm,
        ordersWithKey: ordersWithKey(stormKey),
        passed:
          ordersWithKey(stormKey) === 1 &&
          storm.every((r) => r.status === 201) &&
          new Set(storm.map((r) => r.orderId)).size === 1,
      });

      // 3. The same draft key with an edited body must not create a second order either.
      const edited = {
        ...DRAFT,
        items: [{ productName: 'Tea Set', quantity: 3, unitPriceCents: 15_500 }],
      };
      const conflict = [await create('B', doubleKey, edited)];
      scenarios.push({
        title: 'Same key, edited items (agent changed the draft after an unknown outcome)',
        responses: conflict,
        ordersWithKey: ordersWithKey(doubleKey),
        passed: ordersWithKey(doubleKey) === 1 && conflict[0]?.status === 422,
      });

      const totalOrders = (db.prepare('SELECT COUNT(*) AS n FROM orders').get() as { n: number }).n;
      for (const [index, scenario] of scenarios.entries()) logScenario(log, index + 1, scenario);
      const passed = scenarios.every((scenario) => scenario.passed) && totalOrders === 2;
      log(
        `orders table: ${totalOrders} rows for 2 distinct keys  ${totalOrders === 2 ? '✔' : '✘'}`,
      );
      return { databasePath, scenarios, totalOrders, passed };
    } finally {
      db.close();
    }
  } finally {
    for (const server of servers) server.kill('SIGTERM');
    await Promise.all(
      servers.map((server) => new Promise((resolve) => server.once('exit', resolve))),
    );
    rmSync(workDir, { recursive: true, force: true });
  }
}

function logScenario(log: (line: string) => void, index: number, scenario: ScenarioResult): void {
  log('');
  log(`${index}) ${scenario.title}`);
  const shown =
    scenario.responses.length > 4 ? summarise(scenario) : scenario.responses.map(describe);
  for (const line of shown) log(`   ${line}`);
  log(
    `   orders with this key in the database: ${scenario.ordersWithKey}  ${scenario.passed ? '✔' : '✘'}`,
  );
}

function describe(response: ScenarioResult['responses'][number]): string {
  const outcome = response.code ? `${response.status} ${response.code}` : `${response.status}`;
  const replay = response.replayed ? '  (Idempotent-Replayed: true)' : '';
  return `${response.server} → ${outcome}  order #${response.orderId ?? '?'}${replay}`;
}

function summarise(scenario: ScenarioResult): string[] {
  const statuses = [...new Set(scenario.responses.map((r) => r.status))].join(', ');
  const ids = [...new Set(scenario.responses.map((r) => r.orderId))];
  const replays = scenario.responses.filter((r) => r.replayed).length;
  return [
    `${scenario.responses.length} responses · status ${statuses} · distinct order ids: ${ids.length} (#${ids.join(', #')}) · replays: ${replays}`,
  ];
}

async function startServer(
  databasePath: string,
  secret: string,
  servers: ChildProcess[],
): Promise<string> {
  const port = await freePort();
  const child = spawn(process.execPath, ['--import', 'tsx', SERVER_ENTRY], {
    cwd: API_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      DATABASE_PATH: databasePath,
      JWT_SECRET: secret,
      NODE_ENV: 'production',
      COOKIE_SECURE: 'false',
      LOG_LEVEL: 'warn',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  servers.push(child);
  const url = `http://127.0.0.1:${port}`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (child.exitCode !== null)
      throw new Error(`API process exited early with code ${child.exitCode}`);
    try {
      if ((await fetch(`${url}/api/health`)).ok) return url;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`API process on port ${port} did not become ready`);
}

async function signIn(baseUrl: string, user: { email: string; password: string }): Promise<string> {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: user.email, password: user.password }),
  });
  const cookie = response.headers.getSetCookie().find((value) => value.startsWith('session='));
  if (!response.ok || !cookie) throw new Error(`Sign-in failed with ${response.status}`);
  return cookie.split(';')[0]!;
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address();
      probe.close(() =>
        typeof address === 'object' && address
          ? resolve(address.port)
          : reject(new Error('no port')),
      );
    });
  });
}
