import {
  computeTotalCents,
  type CreateOrderInput,
  type ExistingOrderDetails,
  type OrderDetail,
} from '@orders/shared';
import { createHash } from 'node:crypto';
import { HttpError } from '../http/errors';
import type { OrdersRepository } from './orders.repository';

export interface CreateOrderCommand {
  /** Already validated and normalised by the shared schema (trimmed, lower-cased email). */
  input: CreateOrderInput;
  userId: number;
  idempotencyKey: string;
  now: Date;
}

/**
 * Identifies "the same request" for replay. Computed from the *validated* input, so cosmetic
 * differences (whitespace, email case) do not count as a different order.
 */
export function fingerprintOf(input: CreateOrderInput): string {
  return createHash('sha256').update(JSON.stringify(input)).digest('hex');
}

/** R2: create the order once per (user, key); a repeat of the same request replays it. */
export function createOrderIdempotently(
  orders: OrdersRepository,
  { input, userId, idempotencyKey, now }: CreateOrderCommand,
): { order: OrderDetail; replayed: boolean } {
  const result = orders.insertOrderOnce({
    customerName: input.customer.name,
    customerEmail: input.customer.email,
    items: input.items,
    totalCents: computeTotalCents(input.items), // never trusted from the client (A-2)
    createdBy: userId,
    idempotencyKey,
    fingerprint: fingerprintOf(input),
    createdAt: now.getTime(),
  });

  if (result.kind === 'conflict') {
    const details: ExistingOrderDetails = { orderId: result.orderId };
    throw new HttpError(
      422,
      'idempotency_key_reused',
      `This draft was already submitted as order #${result.orderId} with different details.`,
      details,
    );
  }

  const order = orders.getOrderDetail(result.orderId);
  if (!order) {
    // Replay of an order an admin has since deleted: report it, never re-create it.
    const details: ExistingOrderDetails = { orderId: result.orderId };
    throw new HttpError(
      409,
      'order_deleted',
      `This request already created order #${result.orderId}, which has since been deleted.`,
      details,
    );
  }
  return { order, replayed: result.kind === 'replayed' };
}
