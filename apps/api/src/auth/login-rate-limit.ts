import type { RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { HttpError } from '../http/errors';

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILED_ATTEMPTS = 10;

/**
 * Brute-force protection for /login (SEC-9). Keyed by IP *and* email: an operations team
 * usually shares one office IP, so an IP-only limit would let one typo-prone agent lock out
 * everybody. Successful logins do not count. In-memory: fine for one instance (see SCALE.md).
 */
export function createLoginRateLimit(): RequestHandler {
  return rateLimit({
    windowMs: WINDOW_MS,
    limit: MAX_FAILED_ATTEMPTS,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => `${ipKeyGenerator(req.ip ?? 'unknown')}|${emailOf(req.body)}`,
    handler: (_req, _res, next) => {
      next(
        new HttpError(
          429,
          'rate_limited',
          'Too many failed sign-in attempts. Try again in 15 minutes.',
        ),
      );
    },
  });
}

function emailOf(body: unknown): string {
  if (typeof body !== 'object' || body === null || !('email' in body)) return '';
  return typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
}
