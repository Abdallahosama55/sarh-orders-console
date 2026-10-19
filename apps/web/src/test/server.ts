import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { agentUser, makeOrders, makePage } from './fixtures';

/** Default API: a signed-in agent and one page of orders. Tests override per case with server.use(). */
export const server = setupServer(
  http.get('/api/auth/me', () => HttpResponse.json({ user: agentUser })),
  http.get('/api/orders', () => HttpResponse.json(makePage(makeOrders(20)))),
);
