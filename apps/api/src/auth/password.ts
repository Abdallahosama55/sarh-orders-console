import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';

// scrypt is built into Node, so there is no native bcrypt/argon2 addon to compile.
// N = 2^15 costs ~32 MB and tens of milliseconds per hash: expensive for an attacker, cheap
// for a login. The parameters are stored inside each hash so they can be raised later.
const COST = { N: 2 ** 15, r: 8, p: 1 } as const;
const MAX_MEMORY = 64 * 1024 * 1024;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function derive(password: string, salt: Buffer, keyLength: number, options: ScryptOptions) {
  return new Promise<Buffer>((resolve, reject) => {
    // NFKC so the same password typed on different keyboards/IMEs hashes the same way.
    scrypt(
      password.normalize('NFKC'),
      salt,
      keyLength,
      { ...options, maxmem: MAX_MEMORY },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

/** Returns `scrypt$N$r$p$<salt base64>$<hash base64>`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const hash = await derive(password, salt, KEY_LENGTH, COST);
  return ['scrypt', COST.N, COST.r, COST.p, salt.toString('base64'), hash.toString('base64')].join(
    '$',
  );
}

/** Constant-time comparison; a malformed stored hash simply fails verification. */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = storedHash.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await derive(password, Buffer.from(salt, 'base64'), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

let dummyHash: Promise<string> | undefined;

/**
 * Hash checked when the email is unknown, so "no such user" costs the same scrypt work as
 * "wrong password" and response time does not reveal which accounts exist (SEC-7).
 */
export function hashForUnknownUser(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  return dummyHash;
}
