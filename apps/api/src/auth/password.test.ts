import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  it('stores parameters, salt and hash, and verifies only the right password', async () => {
    const hash = await hashPassword('Agent#2026');
    expect(hash).toMatch(/^scrypt\$32768\$8\$1\$/);
    expect(await verifyPassword('Agent#2026', hash)).toBe(true);
    expect(await verifyPassword('agent#2026', hash)).toBe(false);
  });

  it('salts every hash, so equal passwords never produce equal hashes', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('fails closed on a malformed stored hash', async () => {
    expect(await verifyPassword('anything', 'plaintext-password')).toBe(false);
    expect(await verifyPassword('anything', 'scrypt$1$2')).toBe(false);
  });
});
