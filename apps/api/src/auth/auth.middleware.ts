import type { SessionUser, UserRole } from '@orders/shared';
import type { Request, RequestHandler } from 'express';
import type { AppConfig } from '../config';
import { HttpError } from '../http/errors';
import { SESSION_COOKIE, verifySessionToken } from './session-token';
import { toSessionUser, type UsersRepository } from './users.repository';

/**
 * Replaces the inherited requireAuth. Differences, all from the code review:
 * - the token is read from the httpOnly cookie only; `?token=` is ignored because query
 *   strings end up in logs, browser history and Referer headers (SEC-3);
 * - it is verified, not decoded (SEC-1);
 * - the user and role come from the database, and a bumped token_version revokes the token
 *   (SEC-4, SEC-5).
 */
export function createRequireAuth(users: UsersRepository, config: AppConfig): RequestHandler {
  return (req, _res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token === '') {
      throw new HttpError(401, 'unauthenticated', 'Please sign in.');
    }
    const result = verifySessionToken(token, config.jwtSecret);
    if (!result.ok) {
      throw result.reason === 'expired'
        ? new HttpError(401, 'session_expired', 'Your session has expired. Please sign in again.')
        : new HttpError(401, 'unauthenticated', 'Please sign in.');
    }
    const user = users.findById(result.claims.userId);
    if (!user || user.tokenVersion !== result.claims.tokenVersion) {
      throw new HttpError(401, 'unauthenticated', 'Your session has ended. Please sign in again.');
    }
    req.user = toSessionUser(user);
    next();
  };
}

/**
 * Server-side authorisation. The inherited delete route relied on a React `AdminOnly`
 * component, which any agent could bypass with curl (SEC-6). Hiding a button is UX, not security.
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!roles.includes(currentUser(req).role)) {
      throw new HttpError(403, 'forbidden', 'You do not have permission to do that.');
    }
    next();
  };
}

/** The authenticated user. Only valid behind `requireAuth`. */
export function currentUser(req: Request): SessionUser {
  if (!req.user) throw new HttpError(401, 'unauthenticated', 'Please sign in.');
  return req.user;
}
