import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

/** React and the packages only it (or the router) depends on; everything else is "vendor". */
const REACT_PACKAGES = new Set([
  'react',
  'react-dom',
  'scheduler',
  'react-router',
  'cookie',
  'set-cookie-parser',
]);
const PACKAGE_NAME = /[\\/]node_modules[\\/]((?:@[^\\/]+[\\/])?[^\\/]+)/;

/**
 * Libraries change far less often than the app, so they get their own long-cached chunks.
 * Chunks are assigned by file path, not by listing entry names: a list misses sub-entries
 * such as react/jsx-runtime, which then land in another chunk and create a circular import
 * between chunks. That only broke the production build ("reading 'createContext'").
 */
function vendorChunk(id: string): string | undefined {
  const name = PACKAGE_NAME.exec(id)?.[1]?.replace('\\', '/');
  if (!name) return undefined;
  return REACT_PACKAGES.has(name) ? 'react' : 'vendor';
}

export default defineConfig(({ mode }) => {
  // Same .env as the API, so changing PORT there keeps the proxy pointed at it.
  const env = loadEnv(mode, repoRoot, '');
  const apiTarget = process.env.API_URL ?? `http://localhost:${env.PORT || 3001}`;
  return {
    plugins: [react()],
    build: {
      rollupOptions: { output: { manualChunks: vendorChunk } },
    },
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
