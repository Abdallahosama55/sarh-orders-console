import {
  MAX_ITEMS_PER_ORDER,
  computeTotalCents,
  customerNameSchema,
  emailAddressSchema,
  parseMoneyToCents,
  productNameSchema,
  quantitySchema,
  unitPriceCentsSchema,
  type CreateOrderInput,
} from '@orders/shared';
import type { FieldPath } from 'react-hook-form';
import { z } from 'zod';

/**
 * Built from the same field schemas the server uses (R2-2). The only difference is the price:
 * agents type "12.50", which is parsed to integer halalas before the shared rule applies.
 */
export const orderFormSchema = z.object({
  customerName: customerNameSchema,
  customerEmail: emailAddressSchema,
  items: z
    .array(
      z.object({
        productName: productNameSchema,
        quantity: quantitySchema,
        unitPrice: z
          .string()
          .trim()
          .min(1, 'Enter a price')
          .transform((value, context) => {
            const cents = parseMoneyToCents(value);
            if (cents === null) {
              context.addIssue({ code: 'custom', message: 'Enter a price like 12.50' });
              return z.NEVER;
            }
            return cents;
          })
          .pipe(unitPriceCentsSchema),
      }),
    )
    .min(1, 'Add at least one item')
    .max(MAX_ITEMS_PER_ORDER, `At most ${MAX_ITEMS_PER_ORDER} items per order`),
});

export type OrderFormValues = z.input<typeof orderFormSchema>;
export type ValidOrderForm = z.output<typeof orderFormSchema>;
export type OrderItemValues = OrderFormValues['items'][number];

export const emptyItem = (): OrderItemValues => ({ productName: '', quantity: 1, unitPrice: '' });
export const emptyOrderForm = (): OrderFormValues => ({
  customerName: '',
  customerEmail: '',
  items: [emptyItem()],
});

export function toCreateOrderInput(values: ValidOrderForm): CreateOrderInput {
  return {
    customer: { name: values.customerName, email: values.customerEmail },
    items: values.items.map((item) => ({
      productName: item.productName,
      quantity: item.quantity,
      unitPriceCents: item.unitPrice,
    })),
  };
}

/** Running total for the preview. Lines that are not valid yet count as zero. */
export function lineTotalCents(item: Partial<OrderItemValues> | undefined): number {
  const unitPriceCents = parseMoneyToCents(item?.unitPrice ?? '') ?? 0;
  const quantity = Number.isInteger(item?.quantity) ? (item?.quantity ?? 0) : 0;
  return computeTotalCents([{ quantity, unitPriceCents }]);
}

/** Maps a server validation path (`customer.email`, `items.0.unitPriceCents`) onto a form field. */
export function toFormField(apiPath: string): FieldPath<OrderFormValues> | null {
  if (apiPath === 'customer.name') return 'customerName';
  if (apiPath === 'customer.email') return 'customerEmail';
  if (apiPath === 'items') return 'items';
  const item = /^items\.(\d+)\.(productName|quantity|unitPriceCents)$/.exec(apiPath);
  if (!item) return null;
  const field =
    item[2] === 'unitPriceCents' ? 'unitPrice' : (item[2] as 'productName' | 'quantity');
  return `items.${Number(item[1])}.${field}`;
}
