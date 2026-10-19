import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  // Same .env as the API, so changing PORT there keeps the proxy pointed at it.
  const env = loadEnv(mode, repoRoot, '');
  const apiTarget = process.env.API_URL ?? `http://localhost:${env.PORT || 3001}`;
  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Fail loudly instead of drifting to another port: the API only accepts writes from
      // the configured APP_ORIGIN (CSRF check), so a silent port change would break POSTs.
      strictPort: true,
      proxy: { '/api': { target: apiTarget } },
    },
    test: {
      name: 'web',
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: false,
    },
  };
});
