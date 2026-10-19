import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { server } from './server';

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  window.sessionStorage.clear();
  window.localStorage.clear();
});
afterAll(() => server.close());

// jsdom has no layout engine: every element measures 0×0, so the virtualised table would
// render no rows. TanStack Virtual sizes its viewport from the scroll element's clientHeight;
// give elements an 800 px tall box (≈ 14 rows of 56 px, plus overscan).
Object.defineProperties(HTMLElement.prototype, {
  clientHeight: { configurable: true, get: () => 800 },
  clientWidth: { configurable: true, get: () => 1200 },
});
