import {
  DEBUG_FAIL_HEADER,
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
  createOrderInputSchema,
  idempotencyKeySchema,
  listOrdersQuerySchema,
  parseOrderId,
  type ListOrdersQuery,
  type ListOrdersResponse,
} from '@orders/shared';
import { Router, type RequestHandler } from 'express';
import { randomInt } from 'node:crypto';
import { currentUser, requireRole } from '../auth/auth.middleware';
import type { AppConfig } from '../config';
import { abortSignalFor } from '../http/abort';
import { HttpError } from '../http/errors';
import { parseOrThrow } from '../http/validation';
import type { Logger } from '../logger';
import { createOrderIdempotently } from './create-order';
import { decodeCursor, encodeCursor } from './list-cursor';
import type { OrdersRepository } from './orders.repository';
import { buildOrderStats, waitForSlowReport } from './stats';

interface OrdersRouterDeps {
  orders: OrdersRepository;
  config: AppConfig;
  logger: Logger;
  requireAuth: RequestHandler;
}

export function createOrdersRouter({
  orders,
  config,
  logger,
  requireAuth,
}: OrdersRouterDeps): Router {
  const router = Router();
  router.use(requireAuth); // every /api/orders route requires a session (SEC-10)

  router.get('/', (req, res) => {
    const query = parseOrThrow(listOrdersQuerySchema, req.query);
    const after = query.cursor === undefined ? undefined : cursorPosition(query);
    const page = orders.listPage({ ...query, after });
    const body: ListOrdersResponse = {
      items: page.items,
      nextCursor: page.next && encodeCursor({ sort: query.sort, dir: query.dir, ...page.next }),
      total: after ? null : orders.countMatching(query),
    };
    res.json(body);
  });

  // Registered before '/:id' so "stats" is never parsed as an order id.
  router.get('/stats', async (req, res) => {
    const startedAt = Date.now();
    const delayMs = randomInt(config.statsDelayMs.min, config.statsDelayMs.max + 1);
    if ((await waitForSlowReport(delayMs, abortSignalFor(res))) === 'cancelled') {
      logger.info(`stats report skipped: client left after ${Date.now() - startedAt}ms`);
      return;
    }
    if (config.devSimulation && req.get(DEBUG_FAIL_HEADER) === '1') {
      throw new HttpError(
        503,
        'simulated_failure',
        'The stats service is unavailable (simulated failure).',
      );
    }
    res.json(buildOrderStats(orders, config.businessTimeZone, new Date()));
  });

  router.get('/:id', (req, res) => {
    const id = requireOrderId(req.params.id);
    const order = orders.getOrderDetail(id);
    if (!order) throw new HttpError(404, 'not_found', `Order #${id} was not found.`);
    res.json(order);
  });

  router.post('/', (req, res) => {
    // Both checks run before the transaction, so a rejected request never consumes its key (R2-7).
    const idempotencyKey = parseIdempotencyKey(req.get(IDEMPOTENCY_KEY_HEADER));
    const input = parseOrThrow(createOrderInputSchema, req.body);
    const { order, replayed } = createOrderIdempotently(orders, {
      input,
      userId: currentUser(req).id,
      idempotencyKey,
      now: new Date(),
    });
    if (replayed) res.setHeader(IDEMPOTENT_REPLAYED_HEADER, 'true');
    res.status(201).location(`/api/orders/${order.id}`).json(order);
  });

  // Admin-only, enforced here and not in the UI (SEC-6). Soft delete keeps the financial record.
  router.delete('/:id', requireRole('admin'), (req, res) => {
    const id = requireOrderId(req.params.id);
    if (!orders.softDeleteOrder(id, currentUser(req).id, Date.now())) {
      throw new HttpError(404, 'not_found', `Order #${id} was not found.`);
    }
    res.status(204).end();
  });

  return router;
}

function cursorPosition(query: ListOrdersQuery): { value: number; id: number } {
  const cursor = query.cursor === undefined ? null : decodeCursor(query.cursor);
  if (!cursor || cursor.sort !== query.sort || cursor.dir !== query.dir) {
    throw new HttpError(
      400,
      'invalid_cursor',
      'The cursor is invalid or belongs to a different sort order.',
    );
  }
  return { value: cursor.value, id: cursor.id };
}

function requireOrderId(raw: unknown): number {
  const id = typeof raw === 'string' ? parseOrderId(raw) : null;
  if (id === null) {
    throw new HttpError(400, 'validation_failed', 'Order id must be a positive integer.', {
      fields: { id: 'Order id must be a positive integer.' },
    });
  }
  return id;
}

function parseIdempotencyKey(raw: string | undefined): string {
  if (raw === undefined || raw.trim() === '') {
    throw new HttpError(
      400,
      'idempotency_key_missing',
      `Send an ${IDEMPOTENCY_KEY_HEADER} header (a UUID) with every create request.`,
    );
  }
  const parsed = idempotencyKeySchema.safeParse(raw.trim());
  if (!parsed.success) {
    const message = `${IDEMPOTENCY_KEY_HEADER} must be a UUID.`;
    throw new HttpError(400, 'validation_failed', message, {
      fields: { [IDEMPOTENCY_KEY_HEADER]: message },
    });
  }
  return parsed.data.toLowerCase();
}
