import { SORT_DIRECTIONS, SORT_FIELDS, type SortDirection, type SortField } from '@orders/shared';
import { z } from 'zod';

/** Position of the last row of a page: its sort value plus the id tie-breaker. */
export interface ListCursor {
  sort: SortField;
  dir: SortDirection;
  value: number;
  id: number;
}

const cursorTuple = z.tuple([
  z.enum(SORT_FIELDS),
  z.enum(SORT_DIRECTIONS),
  z.number().int(),
  z.number().int().positive(),
]);

/** Opaque to clients: base64url of `[sort, dir, value, id]`. */
export function encodeCursor(cursor: ListCursor): string {
  const tuple = [cursor.sort, cursor.dir, cursor.value, cursor.id];
  return Buffer.from(JSON.stringify(tuple)).toString('base64url');
}

/** Returns null for anything that is not a cursor this API produced. */
export function decodeCursor(raw: string): ListCursor | null {
  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  const parsed = cursorTuple.safeParse(decoded);
  if (!parsed.success) return null;
  const [sort, dir, value, id] = parsed.data;
  return { sort, dir, value, id };
}
