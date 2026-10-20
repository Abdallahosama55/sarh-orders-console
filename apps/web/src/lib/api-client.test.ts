import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { server } from '../test/server';
import { ApiError, NetworkError, apiRequest, isRetryableError } from './api-client';

describe('apiRequest', () => {
  it('turns the API error envelope into an ApiError with code and details', async () => {
    server.use(
      http.get('/api/thing', () =>
        HttpResponse.json(
          {
            error: {
              code: 'forbidden',
              message: 'You do not have permission to do that.',
              details: { a: 1 },
            },
          },
          { status: 403 },
        ),
      ),
    );
    await expect(apiRequest('/thing')).rejects.toMatchObject({
      name: 'ApiError',
      status: 403,
      code: 'forbidden',
      message: 'You do not have permission to do that.',
      details: { a: 1 },
    });
  });

  it('copes with error responses that are not JSON (e.g. a proxy error page)', async () => {
    server.use(
      http.get('/api/thing', () => new HttpResponse('<html>Bad gateway</html>', { status: 502 })),
    );
    const error = await apiRequest('/thing').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 502, code: 'unknown' });
    expect(isRetryableError(error)).toBe(true);
  });

  it('reports a dropped connection as a retryable NetworkError', async () => {
    server.use(http.get('/api/thing', () => HttpResponse.error()));
    const error = await apiRequest('/thing').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NetworkError);
    expect(isRetryableError(error)).toBe(true);
  });

  it('reports a connection that drops while the body arrives as a retryable NetworkError', async () => {
    server.use(
      http.get(
        '/api/thing',
        () =>
          new HttpResponse(
            new ReadableStream({ start: (stream) => stream.error(new TypeError('terminated')) }),
            { status: 201, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
    const error = await apiRequest('/thing').catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(NetworkError);
    expect(isRetryableError(error)).toBe(true); // a create retries with the same key
  });

  it('reports its own timeout as a NetworkError', async () => {
    server.use(
      http.get('/api/thing', async () => {
        await delay(500);
        return HttpResponse.json({});
      }),
    );
    await expect(apiRequest('/thing', { timeoutMs: 50 })).rejects.toThrow(
      'The server took too long to answer.',
    );
  });

  it('passes a caller cancellation through untouched (it is not a failure)', async () => {
    server.use(
      http.get('/api/thing', async () => {
        await delay(500);
        return HttpResponse.json({});
      }),
    );
    const controller = new AbortController();
    const pending = apiRequest('/thing', { signal: controller.signal });
    controller.abort();
    const error = await pending.catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(NetworkError);
    expect((error as Error).name).toBe('AbortError');
  });

  it('does not treat client errors as retryable', () => {
    expect(isRetryableError(new ApiError(422, 'idempotency_key_reused', 'x'))).toBe(false);
    expect(isRetryableError(new ApiError(503, 'database_busy', 'x'))).toBe(true);
  });
});
