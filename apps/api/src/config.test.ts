import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from './config';

const SECRET = 'x'.repeat(32);

describe('loadConfig', () => {
  it('refuses to start without a JWT secret, or with a short one (SEC-2)', () => {
    expect(() => loadConfig({})).toThrow(ConfigError);
    expect(() => loadConfig({ JWT_SECRET: 'sarh-secret-2026' })).toThrow(/at least 32 characters/);
  });

  it('applies safe defaults for local development', () => {
    const config = loadConfig({ JWT_SECRET: SECRET });
    expect(config).toMatchObject({
      nodeEnv: 'development',
      port: 3001,
      allowedOrigins: ['http://localhost:5173'],
      cookieSecure: false,
      businessTimeZone: 'Asia/Riyadh',
      statsDelayMs: { min: 3000, max: 6000 },
      devSimulation: true,
    });
    expect(config.databasePath).toMatch(/data[/\\]orders\.db$/);
  });

  it('turns off dev simulation and turns on Secure cookies in production', () => {
    expect(loadConfig({ JWT_SECRET: SECRET, NODE_ENV: 'production' })).toMatchObject({
      devSimulation: false,
      cookieSecure: true,
    });
  });

  it('rejects invalid origins, time zones and delay ranges', () => {
    expect(() => loadConfig({ JWT_SECRET: SECRET, APP_ORIGIN: 'not a url' })).toThrow(ConfigError);
    expect(() => loadConfig({ JWT_SECRET: SECRET, BUSINESS_TIME_ZONE: 'Mars/Olympus' })).toThrow(
      ConfigError,
    );
    expect(() => loadConfig({ JWT_SECRET: SECRET, STATS_DELAY_MS: '6000-3000' })).toThrow(
      ConfigError,
    );
  });
});
