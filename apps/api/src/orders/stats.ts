import type { OrderStats } from '@orders/shared';
import { setTimeout as sleep } from 'node:timers/promises';
import type { OrdersRepository } from './orders.repository';

/**
 * O1 asks for a deliberately slow endpoint. The wait stands in for an expensive upstream
 * report. It is abortable: if the agent navigates away, the queries never run.
 */
export async function waitForSlowReport(
  delayMs: number,
  signal: AbortSignal,
): Promise<'ready' | 'cancelled'> {
  try {
    await sleep(delayMs, undefined, { signal });
    return 'ready';
  } catch (error) {
    if (signal.aborted) return 'cancelled';
    throw error;
  }
}

export function buildOrderStats(orders: OrdersRepository, timeZone: string, now: Date): OrderStats {
  const since = startOfDayInTimeZone(now, timeZone);
  const revenue = orders.revenueSince(since.getTime());
  return {
    byStatus: orders.statusTotals(),
    revenueToday: {
      totalCents: revenue.totalCents,
      orderCount: revenue.count,
      since: since.toISOString(),
      timeZone,
    },
    generatedAt: now.toISOString(),
  };
}

/**
 * The UTC instant of local midnight in `timeZone` for the calendar day containing `now`.
 * "Today" is a business-time-zone question, not a server-clock one (assumption A-5).
 */
export function startOfDayInTimeZone(now: Date, timeZone: string): Date {
  const { year, month, day } = wallClock(now, timeZone);
  const midnightAsIfUtc = Date.UTC(year, month - 1, day);
  // The zone's offset at the guessed instant; repeated once to settle around DST changes.
  let instant = midnightAsIfUtc - offsetMs(new Date(midnightAsIfUtc), timeZone);
  instant = midnightAsIfUtc - offsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

function offsetMs(date: Date, timeZone: string): number {
  const t = wallClock(date, timeZone);
  const wallAsUtc = Date.UTC(t.year, t.month - 1, t.day, t.hour, t.minute, t.second);
  return wallAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function wallClock(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
    second: part('second'),
  };
}
