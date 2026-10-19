import type { CreateOrderInput } from '@orders/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { isRetryableError } from '../lib/api-client';
import { createOrder } from '../orders/orders-api';
import { orderKeys } from '../orders/query-keys';

export const MAX_AUTOMATIC_RETRIES = 2;

export interface CreateOrderVariables {
  input: CreateOrderInput;
  idempotencyKey: string;
}

/**
 * Because every attempt carries the same Idempotency-Key, retrying is always safe: if the
 * "failed" attempt actually created the order, the server replays it instead of creating
 * another. So network errors, timeouts and 5xx are retried automatically.
 */
export function useCreateOrder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ input, idempotencyKey }: CreateOrderVariables) =>
      createOrder(input, idempotencyKey),
    retry: (failureCount, error) => failureCount < MAX_AUTOMATIC_RETRIES && isRetryableError(error),
    retryDelay: (attempt) => Math.min(500 * 2 ** attempt, 4_000),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: orderKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: orderKeys.stats() });
    },
  });
}
