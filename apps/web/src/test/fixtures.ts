import type {
  ListOrdersResponse,
  OrderDetail,
  OrderStats,
  OrderStatus,
  OrderSummary,
  SessionUser,
} from '@orders/shared';

export const agentUser: SessionUser = {
  id: 2,
  email: 'agent@sarh.test',
  name: 'Omar Haddad',
  role: 'agent',
};
export const adminUser: SessionUser = {
  id: 1,
  email: 'admin@sarh.test',
  name: 'Mona Al-Rashid',
  role: 'admin',
};

export function makeOrder(overrides: Partial<OrderSummary> = {}): OrderSummary {
  const id = overrides.id ?? 1000;
  return {
    id,
    customerName: `Customer ${id}`,
    customerEmail: `customer${id}@example.com`,
    status: 'paid',
    totalCents: 12_345,
    itemCount: 2,
    createdAt: '2026-10-19T09:00:00.000Z',
    ...overrides,
  };
}

/** `count` orders with the given status, ids counting down from `firstId`. */
export function makeOrders(
  count: number,
  status: OrderStatus = 'paid',
  firstId = 50_000,
): OrderSummary[] {
  return Array.from({ length: count }, (_, index) => makeOrder({ id: firstId - index, status }));
}

export function makePage(
  items: OrderSummary[],
  {
    nextCursor = null,
    total = { count: items.length, capped: false },
  }: Partial<ListOrdersResponse> = {},
): ListOrdersResponse {
  return { items, nextCursor, total };
}

export function makeOrderDetail(overrides: Partial<OrderDetail> = {}): OrderDetail {
  return {
    id: 50_001,
    customerName: 'Huda Al-Qahtani',
    customerEmail: 'huda.q@example.com',
    status: 'pending',
    totalCents: 31_000,
    createdAt: '2026-10-19T09:00:00.000Z',
    createdBy: { id: agentUser.id, name: agentUser.name },
    items: [
      {
        id: 1,
        productName: 'Sukkari Dates Gift Box',
        quantity: 2,
        unitPriceCents: 9_500,
        lineTotalCents: 19_000,
      },
      {
        id: 2,
        productName: 'Arabic Coffee Dallah',
        quantity: 1,
        unitPriceCents: 12_000,
        lineTotalCents: 12_000,
      },
    ],
    ...overrides,
  };
}

export function makeStats(): OrderStats {
  return {
    byStatus: [
      { status: 'pending', count: 306, totalCents: 20_185_500 },
      { status: 'paid', count: 618, totalCents: 45_010_100 },
      { status: 'shipped', count: 1_927, totalCents: 139_053_400 },
      { status: 'delivered', count: 42_108, totalCents: 3_031_776_000 },
      { status: 'cancelled', count: 5_041, totalCents: 370_513_500 },
    ],
    revenueToday: {
      totalCents: 4_250_000,
      orderCount: 212,
      since: '2026-10-18T21:00:00.000Z',
      timeZone: 'Asia/Riyadh',
    },
    generatedAt: '2026-10-19T09:00:05.000Z',
  };
}
