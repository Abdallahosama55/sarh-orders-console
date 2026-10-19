import type { CookieOptions } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import type { AppConfig } from '../config';

export const SESSION_COOKIE = 'session';
const SESSION_TTL_SECONDS = 8 * 60 * 60; // one working shift
export const SESSION_ISSUER = 'orders-console-api';
export const SESSION_AUDIENCE = 'orders-console-web';

export interface SessionClaims {
  userId: number;
  /** Must equal users.token_version, otherwise the session has been revoked (SEC-4). */
  tokenVersion: number;
}

// Deliberately no role in the token: the role is re-read from the database on every request,
// so a demotion takes effect immediately instead of when the token expires (SEC-5).
const claimsSchema = z.object({
  sub: z.string().regex(/^[1-9]\d*$/),
  ver: z.number().int().nonnegative(),
});

export function signSessionToken(claims: SessionClaims, secret: string): string {
  return jwt.sign({ ver: claims.tokenVersion }, secret, {
    algorithm: 'HS256',
    expiresIn: SESSION_TTL_SECONDS,
    subject: String(claims.userId),
    issuer: SESSION_ISSUER,
    audience: SESSION_AUDIENCE,
  });
}

export type VerifyResult =
  { ok: true; claims: SessionClaims } | { ok: false; reason: 'expired' | 'invalid' };

/**
 * The inherited middleware used `jwt.decode`, which checks nothing: anyone could hand-write
 * `{"sub":1,"role":"admin"}`. `jwt.verify` checks the signature and expiry, and pinning
 * `algorithms` rejects `alg: none` and algorithm-confusion tokens (SEC-1).
 */
export function verifySessionToken(token: string, secret: string): VerifyResult {
  let payload: unknown;
  try {
    payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer: SESSION_ISSUER,
      audience: SESSION_AUDIENCE,
    });
  } catch (error) {
    return { ok: false, reason: error instanceof jwt.TokenExpiredError ? 'expired' : 'invalid' };
  }
  const parsed = claimsSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  return { ok: true, claims: { userId: Number(parsed.data.sub), tokenVersion: parsed.data.ver } };
}

/**
 * httpOnly: page scripts cannot read the token, so XSS cannot exfiltrate it.
 * SameSite=Strict: the browser never attaches it to cross-site requests (CSRF).
 * Path=/api: it is only sent to the API. Secure: HTTPS only, in production.
 */
export function sessionCookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    secure: config.cookieSecure,
    path: '/api',
    maxAge: SESSION_TTL_SECONDS * 1000,
  };
}
