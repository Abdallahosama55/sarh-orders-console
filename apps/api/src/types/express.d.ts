import type { SessionUser } from '@orders/shared';

declare global {
  namespace Express {
    interface Request {
      /** Set by `requireAuth` from the users table, never from token claims. */
      user?: SessionUser;
    }
  }
}

export {};
