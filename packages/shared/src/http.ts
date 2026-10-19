/** Header names shared by client and server. */
export const IDEMPOTENCY_KEY_HEADER = 'Idempotency-Key';
export const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed';
/** Dev-only simulation headers; ignored when NODE_ENV=production. */
export const DEBUG_LATENCY_HEADER = 'X-Debug-Latency';
export const DEBUG_FAIL_HEADER = 'X-Debug-Fail';

export type ApiErrorCode =
  | 'validation_failed'
  | 'invalid_json'
  | 'payload_too_large'
  | 'invalid_cursor'
  | 'unauthenticated'
  | 'session_expired'
  | 'invalid_credentials'
  | 'forbidden'
  | 'bad_origin'
  | 'rate_limited'
  | 'not_found'
  | 'idempotency_key_missing'
  | 'idempotency_key_reused'
  | 'order_deleted'
  | 'database_busy'
  | 'simulated_failure'
  | 'internal_error';

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

/** `details` of a 400 validation_failed response: dotted field path → message. */
export interface ValidationErrorDetails {
  fields: Record<string, string>;
}

/** `details` of a 422 idempotency_key_reused / 409 order_deleted response. */
export interface ExistingOrderDetails {
  orderId: number;
}
