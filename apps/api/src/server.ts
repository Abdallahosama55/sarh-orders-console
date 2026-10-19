import { createApp } from './app';
import { ConfigError, loadConfig, loadDotEnv, type AppConfig } from './config';
import { migrate, openDatabase, type Db } from './db/database';
import { createLogger, type Logger } from './logger';

function main(): void {
  loadDotEnv();
  const config = loadConfigOrExit();
  const logger = createLogger(config.logLevel);
  const db = openDatabase(config.databasePath);
  migrate(db);
  warnIfNotSeeded(db, logger);

  const server = createApp({ db, config, logger }).listen(config.port, () => {
    logger.info(`API ready on http://localhost:${config.port} (${config.nodeEnv})`);
  });
  server.on('error', (error: NodeJS.ErrnoException) => {
    logger.error(
      error.code === 'EADDRINUSE'
        ? `Port ${config.port} is already in use. Stop the other process or set PORT in .env.`
        : `Server failed: ${error.message}`,
    );
    process.exit(1);
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
    server.closeAllConnections();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

function loadConfigOrExit(): AppConfig {
  try {
    return loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
}

function warnIfNotSeeded(db: Db, logger: Logger): void {
  const { users } = db.prepare('SELECT COUNT(*) AS users FROM users').get() as { users: number };
  if (users === 0) logger.warn('The database has no users yet. Run `npm run setup` first.');
}

main();
