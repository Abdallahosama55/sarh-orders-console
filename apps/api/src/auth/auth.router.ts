import { loginInputSchema } from '@orders/shared';
import { Router, type RequestHandler } from 'express';
import type { AppConfig } from '../config';
import { HttpError } from '../http/errors';
import { parseOrThrow } from '../http/validation';
import { currentUser } from './auth.middleware';
import { createLoginRateLimit } from './login-rate-limit';
import { hashForUnknownUser, verifyPassword } from './password';
import {
  SESSION_COOKIE,
  sessionCookieOptions,
  signSessionToken,
  verifySessionToken,
} from './session-token';
import { toSessionUser, type UsersRepository } from './users.repository';

interface AuthRouterDeps {
  users: UsersRepository;
  config: AppConfig;
  requireAuth: RequestHandler;
}

export function createAuthRouter({ users, config, requireAuth }: AuthRouterDeps): Router {
  const router = Router();

  router.post('/login', createLoginRateLimit(), async (req, res) => {
    // Typed validation first: the inherited code passed req.body straight into the query (SEC-8).
    const { email, password } = parseOrThrow(loginInputSchema, req.body);
    const user = users.findByEmail(email);
    const passwordMatches = await verifyPassword(
      password,
      user?.passwordHash ?? (await hashForUnknownUser()),
    );
    if (!user || !passwordMatches) {
      // One message for both cases: the response must not reveal whether the email exists.
      throw new HttpError(401, 'invalid_credentials', 'Wrong email or password.');
    }
    const token = signSessionToken(
      { userId: user.id, tokenVersion: user.tokenVersion },
      config.jwtSecret,
    );
    res.cookie(SESSION_COOKIE, token, sessionCookieOptions(config));
    res.json({ user: toSessionUser(user) });
  });

  /** Revokes every session of the user (token_version + 1) and clears the cookie. Always 204. */
  router.post('/logout', (req, res) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token === 'string') {
      const result = verifySessionToken(token, config.jwtSecret);
      if (result.ok) users.revokeSessions(result.claims.userId);
    }
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions(config));
    res.status(204).end();
  });

  router.get('/me', requireAuth, (req, res) => {
    res.json({ user: currentUser(req) });
  });

  return router;
}
