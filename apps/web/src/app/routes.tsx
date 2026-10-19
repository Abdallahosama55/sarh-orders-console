import { Navigate, type RouteObject } from 'react-router';
import { LoginPage } from '../auth/LoginPage';
import { RequireAuth } from '../auth/RequireAuth';
import { CreateOrderPage } from '../create-order/CreateOrderPage';
import { OrderDrawer } from '../orders/OrderDrawer';
import { OrdersPage } from '../orders/OrdersPage';
import { StatsPage } from '../stats/StatsPage';
import { AppLayout } from './AppLayout';
import { NotFound, RouteError } from './fallbacks';

export const routes: RouteObject[] = [
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    errorElement: <RouteError />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { index: true, element: <Navigate to="/orders" replace /> },
          {
            path: 'orders',
            element: <OrdersPage />,
            children: [{ path: ':orderId', element: <OrderDrawer /> }],
          },
          { path: 'orders/new', element: <CreateOrderPage /> },
          { path: 'stats', element: <StatsPage /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
];
