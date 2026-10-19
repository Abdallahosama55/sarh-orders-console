import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor, type ListCursor } from './list-cursor';

describe('list cursor', () => {
  it('round-trips a position', () => {
    const cursor: ListCursor = { sort: 'total', dir: 'asc', value: 12_345, id: 42 };
    expect(decodeCursor(encodeCursor(cursor))).toEqual(cursor);
  });

  it.each([
    ['not base64 JSON', 'not-a-cursor'],
    ['wrong shape', Buffer.from(JSON.stringify({ id: 1 })).toString('base64url')],
    ['unknown sort', Buffer.from(JSON.stringify(['name', 'asc', 1, 1])).toString('base64url')],
    [
      'non-integer value',
      Buffer.from(JSON.stringify(['total', 'asc', 1.5, 1])).toString('base64url'),
    ],
    ['non-positive id', Buffer.from(JSON.stringify(['total', 'asc', 1, 0])).toString('base64url')],
  ])('rejects %s', (_label, raw) => {
    expect(decodeCursor(raw)).toBeNull();
  });
});
