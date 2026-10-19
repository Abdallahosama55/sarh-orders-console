import { describe, expect, it } from 'vitest';
import { computeTotalCents, formatMoney, parseMoneyToCents } from './money';

describe('parseMoneyToCents', () => {
  it.each([
    ['12', 1200],
    ['12.5', 1250],
    ['12.50', 1250],
    ['0.01', 1],
    ['  7.05 ', 705],
    ['0.1', 10],
    ['999999999.99', 99_999_999_999],
  ])('parses %j as %i halalas', (input, cents) => {
    expect(parseMoneyToCents(input)).toBe(cents);
  });

  it('accepts Arabic-Indic and Persian digits and the Arabic decimal separator', () => {
    expect(parseMoneyToCents('١٢٫٥٠')).toBe(1250);
    expect(parseMoneyToCents('۱۲.۵')).toBe(1250);
  });

  it.each(['', '.5', '12.', '12.345', '-1', '1e3', '12,50', '1,000.00', 'abc', '١٢٫٣٤٥'])(
    'rejects %j',
    (input) => {
      expect(parseMoneyToCents(input)).toBeNull();
    },
  );
});

describe('formatMoney', () => {
  it('formats halalas as SAR with two decimals, joined by a no-break space', () => {
    expect(formatMoney(123_450)).toBe('SAR 1,234.50');
    expect(formatMoney(0)).toBe('SAR 0.00');
  });
});

describe('computeTotalCents', () => {
  it('sums quantity × unit price in integer arithmetic', () => {
    expect(
      computeTotalCents([
        { quantity: 3, unitPriceCents: 10 },
        { quantity: 1, unitPriceCents: 20 },
      ]),
    ).toBe(50);
    expect(computeTotalCents([])).toBe(0);
  });
});
