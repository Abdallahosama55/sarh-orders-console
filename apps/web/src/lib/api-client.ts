import type { ApiErrorBody, ApiErrorCode } from '@orders/shared';

/** The server answered with an error status. */
export class ApiError extends Error {
  override name = 'ApiError';

  constructor(
    readonly status: number,
    readonly code: ApiErrorCode | 'unknown',
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** No usable answer: offline, connection dropped, or our own timeout. The outcome is unknown. */
export class NetworkError extends Error {
  override name = 'NetworkError';
}

export interface ApiResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Cancellation from the caller (React Query passes one per query). */
  signal?: AbortSignal | undefined;
  /** Give up after this long and report a NetworkError. */
  timeoutMs?: number;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<ApiResponse<T>> {
  const { method = 'GET', body, headers, signal, timeoutMs } = options;
  const timeout = timeoutMs === undefined ? undefined : AbortSignal.timeout(timeoutMs);
  const signals = [signal, timeout].filter(
    (candidate): candidate is AbortSignal => candidate !== undefined,
  );

  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin', // the httpOnly session cookie; JS never sees the token
      headers: {
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signals.length > 1 ? AbortSignal.any(signals) : signals[0],
    });
  } catch (error) {
    // Cancelled by the caller (filters changed, page left): rethrow the AbortError untouched so
    // React Query treats it as a cancellation rather than a failure.
    if (signal?.aborted) throw error;
    throw new NetworkError(
      timeout?.aborted ? 'The server took too long to answer.' : 'Could not reach the server.',
      { cause: error },
    );
  }

  const payload = await readJson(response);
  if (!response.ok) throw toApiError(response.status, payload);
  return { data: payload as T, status: response.status, headers: response.headers };
}

/** Safe to retry: the request may not have arrived, or failed on the server side. */
export function isRetryableError(error: unknown): boolean {
  return error instanceof NetworkError || (error instanceof ApiError && error.status >= 500);
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError || error instanceof NetworkError) return error.message;
  return 'Something went wrong. Please try again.';
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function toApiError(status: number, payload: unknown): ApiError {
  if (isApiErrorBody(payload)) {
    const { code, message, details } = payload.error;
    return new ApiError(status, code, message, details);
  }
  return new ApiError(status, 'unknown', `The server answered with an error (${status}).`);
}

function isApiErrorBody(payload: unknown): payload is ApiErrorBody {
  if (typeof payload !== 'object' || payload === null || !('error' in payload)) return false;
  const { error } = payload;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'message' in error &&
    typeof error.message === 'string'
  );
}
