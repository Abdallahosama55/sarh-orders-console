import Database from 'better-sqlite3';
import type { ApiErrorBody, ApiErrorCode } from '@orders/shared';
import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from '../logger';

/** Throw anywhere in a handler; serialised in one place by `createErrorHandler`. */
export class HttpError extends Error {
  override name = 'HttpError';

  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export const unknownApiRoute: RequestHandler = (req) => {
  throw new HttpError(404, 'not_found', `No route for ${req.method} ${req.baseUrl}${req.path}`);
};

/**
 * Express 5 forwards rejected promises here, so an async handler can no longer crash the
 * process the way the inherited `await db.orders.delete(...)` could (SEC-11).
 * Unexpected errors are logged and answered with a generic 500: no stack traces leak.
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const httpError = toHttpError(error);
    if (httpError.status >= 500) {
      logger.error(`${req.method} ${req.baseUrl}${req.path} failed`, { error: describe(error) });
    }
    if (httpError.status === 503) res.setHeader('Retry-After', '1');
    const body: ApiErrorBody = {
      error: { code: httpError.code, message: httpError.message, details: httpError.details },
    };
    res.status(httpError.status).json(body);
  };
}

function toHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) return error;
  if (isBodyParserError(error)) {
    if (error.type === 'entity.too.large') {
      return new HttpError(413, 'payload_too_large', 'The request body is too large.');
    }
    if (error.type === 'entity.parse.failed') {
      return new HttpError(400, 'invalid_json', 'The request body is not valid JSON.');
    }
  }
  if (error instanceof Database.SqliteError && error.code.startsWith('SQLITE_BUSY')) {
    // Another process held the write lock for longer than the busy timeout. Retrying with the
    // same Idempotency-Key is safe, so tell the client to do exactly that.
    return new HttpError(503, 'database_busy', 'The database is busy. Please retry.');
  }
  return new HttpError(500, 'internal_error', 'Something went wrong. Please try again.');
}

function isBodyParserError(error: unknown): error is { type: string } {
  return (
    typeof error === 'object' && error !== null && 'type' in error && typeof error.type === 'string'
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? (error.stack ?? error.message) : String(error);
}
