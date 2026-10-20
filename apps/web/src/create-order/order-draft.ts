import { useCallback, useRef, useState } from 'react';
import { z } from 'zod';
import { readStored, removeStored, writeStored } from '../lib/storage';
import { emptyOrderForm, type OrderFormValues } from './order-form';

/**
 * The Idempotency-Key belongs to the *draft*, not to a click or a request (design §6.2).
 * Retries, double-clicks and resends reuse it, and it is persisted with the form values so a
 * page reload in the middle of a submit cannot mint a new key and create a second order.
 * A new key is issued only when the agent starts the next order after a confirmed success.
 */
export interface OrderDraft {
  idempotencyKey: string;
  values: OrderFormValues;
}

const STORAGE_KEY = 'create-order-draft';

const storedDraftSchema = z.object({
  idempotencyKey: z.uuid(),
  values: z.object({
    customerName: z.string(),
    customerEmail: z.string(),
    items: z
      .array(
        z.object({
          productName: z.string(),
          quantity: z.number().catch(1), // an emptied number input is stored as null
          unitPrice: z.string(),
        }),
      )
      .min(1),
  }),
});

export function newIdempotencyKey(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // crypto.randomUUID only exists in secure contexts (https, localhost). Opened over plain
  // http on a LAN address, build an RFC 4122 v4 UUID from getRandomValues instead.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function readDraft(): OrderDraft | null {
  const raw = readStored('session', STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = storedDraftSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

const freshDraft = (): OrderDraft => ({
  idempotencyKey: newIdempotencyKey(),
  values: emptyOrderForm(),
});

export function useOrderDraft() {
  const [initial] = useState(() => readDraft() ?? freshDraft());
  // The current key is a ref, not state. "Create another order" swaps the key and resets the
  // form in one event, and reset() saves the emptied form synchronously, before React
  // re-renders. A key read from state at that moment would still be the spent one, and a
  // reload would bring it back: the next order would then replay the previous one.
  const key = useRef(initial.idempotencyKey);

  const save = useCallback(
    (values: OrderFormValues) =>
      writeStored('session', STORAGE_KEY, JSON.stringify({ idempotencyKey: key.current, values })),
    [],
  );

  /** The key to send. Read it when submitting, not during render. */
  const currentKey = useCallback(() => key.current, []);

  /** After a confirmed success: nothing left to retry. */
  const discard = useCallback(() => removeStored('session', STORAGE_KEY), []);

  /** "Create another order": a fresh draft with a fresh key. */
  const startNew = useCallback((): OrderDraft => {
    const next = freshDraft();
    key.current = next.idempotencyKey;
    removeStored('session', STORAGE_KEY);
    return next;
  }, []);

  return { initialValues: initial.values, currentKey, save, discard, startNew };
}
