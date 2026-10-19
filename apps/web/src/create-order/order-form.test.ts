import { describe, expect, it } from 'vitest';
import { lineTotalCents, orderFormSchema, toCreateOrderInput, toFormField } from './order-form';

describe('orderFormSchema', () => {
  it('turns typed prices into integer halalas and produces the API contract', () => {
    const parsed = orderFormSchema.parse({
      customerName: ' Huda ',
      customerEmail: 'HUDA@EXAMPLE.COM',
      items: [{ productName: 'Tea Set', quantity: 3, unitPrice: '155.5' }],
    });
    expect(toCreateOrderInput(parsed)).toEqual({
      customer: { name: 'Huda', email: 'huda@example.com' },
      items: [{ productName: 'Tea Set', quantity: 3, unitPriceCents: 15_550 }],
    });
  });

  it.each([
    ['12.345', 'Enter a price like 12.50'],
    ['abc', 'Enter a price like 12.50'],
    ['0', 'Price must be greater than 0'],
    ['', 'Enter a price'],
  ])('rejects the price %j with %j', (unitPrice, message) => {
    const result = orderFormSchema.safeParse({
      customerName: 'Huda',
      customerEmail: 'huda@example.com',
      items: [{ productName: 'Tea Set', quantity: 1, unitPrice }],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe(message);
  });
});

describe('lineTotalCents', () => {
  it('previews valid lines and counts unfinished ones as zero', () => {
    expect(lineTotalCents({ productName: 'x', quantity: 2, unitPrice: '9.99' })).toBe(1_998);
    expect(lineTotalCents({ productName: 'x', quantity: Number.NaN, unitPrice: '9.99' })).toBe(0);
    expect(lineTotalCents({ productName: 'x', quantity: 2, unitPrice: '9.9.9' })).toBe(0);
    expect(lineTotalCents(undefined)).toBe(0);
  });
});

describe('toFormField', () => {
  it.each([
    ['customer.name', 'customerName'],
    ['customer.email', 'customerEmail'],
    ['items', 'items'],
    ['items.2.productName', 'items.2.productName'],
    ['items.0.quantity', 'items.0.quantity'],
    ['items.1.unitPriceCents', 'items.1.unitPrice'],
    ['_root', null],
    ['items.x.quantity', null],
  ])('maps the API path %s to %s', (apiPath, formField) => {
    expect(toFormField(apiPath)).toBe(formField);
  });
});
