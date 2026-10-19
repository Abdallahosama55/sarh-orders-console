import type { RequestHandler } from 'express';
import { HttpError } from './errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence in depth for the cookie session (SEC-3). SameSite=Strict already stops other
 * *sites*; this also stops other *origins* on the same site (e.g. a compromised sibling
 * sub-domain), which SameSite cannot. Requests without an Origin header come from non-browser
 * clients (scripts, curl): they cannot ride a victim's cookie, so they are allowed.
 */
export function rejectUntrustedOrigins(allowedOrigins: readonly string[]): RequestHandler {
  return (req, _res, next) => {
    const origin = req.get('origin');
    if (SAFE_METHODS.has(req.method) || origin === undefined || allowedOrigins.includes(origin)) {
      next();
      return;
    }
    throw new HttpError(403, 'bad_origin', 'Cross-origin request rejected.');
  };
}
