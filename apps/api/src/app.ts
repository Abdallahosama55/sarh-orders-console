import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { createRequireAuth } from './auth/auth.middleware';
import { createAuthRouter } from './auth/auth.router';
import { createUsersRepository } from './auth/users.repository';
import type { AppConfig } from './config';
import type { Db } from './db/database';
import { devLatency } from './http/dev-latency';
import { createErrorHandler, unknownApiRoute } from './http/errors';
import { rejectUntrustedOrigins } from './http/origin-check';
import { requestLogger } from './http/request-logger';
import type { Logger } from './logger';
import { createOrdersRepository } from './orders/orders.repository';
import { createOrdersRouter } from './orders/orders.router';

export interface AppDeps {
  db: Db;
  config: AppConfig;
  logger: Logger;
}

/** Builds the Express app without listening, so tests can drive it in-process. */
export function createApp({ db, config, logger }: AppDeps): Express {
  const users = createUsersRepository(db);
  const orders = createOrdersRepository(db);
  const requireAuth = createRequireAuth(users, config);

  const app = express();
  app.use(helmet());
  app.use(requestLogger(logger));
  app.use(express.json({ limit: '32kb' }));
  app.use(cookieParser());
  app.use('/api', rejectUntrustedOrigins(config.allowedOrigins));
  if (config.devSimulation) app.use('/api', devLatency());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', createAuthRouter({ users, config, requireAuth }));
  app.use('/api/orders', createOrdersRouter({ orders, config, logger, requireAuth }));
  app.use('/api', unknownApiRoute);
  app.use(createErrorHandler(logger));
  return app;
}
