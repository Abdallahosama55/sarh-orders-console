/** Single-currency system (assumption A-1). Amounts are integer halalas ("cents"), never floats. */
export const CURRENCY = 'SAR';

const AMOUNT_INPUT = /^(\d{1,9})(?:\.(\d{1,2}))?$/;
/** Arabic-Indic (U+0660–0669) and Eastern Arabic/Persian (U+06F0–06F9) digits. */
const NON_ASCII_DIGIT = /[٠-٩۰-۹]/g;
const ARABIC_DECIMAL_SEPARATOR = /٫/g;

function toAsciiDigit(digit: string): string {
  const code = digit.codePointAt(0) ?? 0;
  return String(code - (code >= 0x06f0 ? 0x06f0 : 0x0660));
}

/**
 * Parses a typed amount such as "12", "12.5" or "12.50" into halalas using string
 * arithmetic only, so float rounding can never reach a price.
 * Arabic-Indic digits are accepted because agents may type on an Arabic keyboard.
 * Returns null when the input is not a plain amount with at most two decimals.
 */
export function parseMoneyToCents(input: string): number | null {
  const normalised = input
    .trim()
    .replace(NON_ASCII_DIGIT, toAsciiDigit)
    .replace(ARABIC_DECIMAL_SEPARATOR, '.');
  const match = AMOUNT_INPUT.exec(normalised);
  if (!match) return null;
  const [, whole = '0', fraction = ''] = match;
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

const moneyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY });

/** "SAR 1,234.50" — Intl joins code and amount with a no-break space so they never wrap apart. */
export function formatMoney(cents: number): string {
  return moneyFormatter.format(cents / 100);
}

/** The one place an order total is computed: used by the form preview and by the server. */
export function computeTotalCents(
  items: ReadonlyArray<{ quantity: number; unitPriceCents: number }>,
): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
}
