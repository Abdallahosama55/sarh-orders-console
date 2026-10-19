import { QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createQueryClient } from './app/query-client';
import { routes } from './app/routes';
import './styles.css';

const queryClient = createQueryClient();
const router = createBrowserRouter(routes);
// RouterProvider from 'react-router/dom' (not 'react-router') wires in ReactDOM.flushSync,
// which the toolbar needs so fast typing in the URL-backed search box never drops characters.

// No <StrictMode>, deliberately. Its development-only double mount makes React Query abort and
// re-issue every query's first request, because a query that loses its last observer is
// cancelled. That would put phantom cancellations in the network panel and the API log,
// exactly where reviewers check the behaviour under test (R1-8 latest-wins, O1-3 cancel on
// leave). The react-hooks lint rules cover the purity checks StrictMode would add.
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={queryClient}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
