import { describe, expect, it } from 'vitest';
import { startOfDayInTimeZone } from './stats';

describe('startOfDayInTimeZone', () => {
  it.each([
    // Riyadh is UTC+3 all year: local midnight is 21:00 UTC the previous day.
    ['Asia/Riyadh', '2026-10-19T09:00:00.000Z', '2026-10-18T21:00:00.000Z'],
    ['Asia/Riyadh', '2026-10-18T21:00:00.000Z', '2026-10-18T21:00:00.000Z'],
    ['Asia/Riyadh', '2026-10-18T20:59:59.999Z', '2026-10-17T21:00:00.000Z'],
    ['Africa/Cairo', '2026-10-19T09:00:00.000Z', '2026-10-18T21:00:00.000Z'],
    ['UTC', '2026-10-19T23:59:59.000Z', '2026-10-19T00:00:00.000Z'],
    // New York on both DST transition days (midnight itself is never skipped there).
    ['America/New_York', '2026-03-08T15:00:00.000Z', '2026-03-08T05:00:00.000Z'],
    ['America/New_York', '2026-11-01T15:00:00.000Z', '2026-11-01T04:00:00.000Z'],
  ])('%s at %s starts at %s', (timeZone, now, expected) => {
    expect(startOfDayInTimeZone(new Date(now), timeZone).toISOString()).toBe(expected);
  });
});
