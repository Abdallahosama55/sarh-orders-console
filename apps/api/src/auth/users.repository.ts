import type { SessionUser, UserRole } from '@orders/shared';
import type { Db } from '../db/database';

export interface UserRecord extends SessionUser {
  passwordHash: string;
  tokenVersion: number;
}

export interface NewUser {
  email: string;
  name: string;
  role: UserRole;
  passwordHash: string;
  createdAt: number;
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  password_hash: string;
  token_version: number;
}

export type UsersRepository = ReturnType<typeof createUsersRepository>;

export function createUsersRepository(db: Db) {
  const columns = 'id, email, name, role, password_hash, token_version';
  const byEmail = db.prepare<[string], UserRow>(`SELECT ${columns} FROM users WHERE email = ?`);
  const byId = db.prepare<[number], UserRow>(`SELECT ${columns} FROM users WHERE id = ?`);
  const bumpTokenVersion = db.prepare<[number]>(
    'UPDATE users SET token_version = token_version + 1 WHERE id = ?',
  );
  const insert = db.prepare<[NewUser]>(
    `INSERT INTO users (email, name, role, password_hash, created_at)
     VALUES (@email, @name, @role, @passwordHash, @createdAt)`,
  );

  return {
    findByEmail: (email: string) => toUser(byEmail.get(email.toLowerCase())),
    findById: (id: number) => toUser(byId.get(id)),
    /** Invalidates every session issued so far for this user (logout, SEC-4). */
    revokeSessions: (id: number) => {
      bumpTokenVersion.run(id);
    },
    insert: (user: NewUser) => Number(insert.run(user).lastInsertRowid),
  };
}

export function toSessionUser({ id, email, name, role }: SessionUser): SessionUser {
  return { id, email, name, role };
}

function toUser(row: UserRow | undefined): UserRecord | undefined {
  if (!row) return undefined;
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    passwordHash: row.password_hash,
    tokenVersion: row.token_version,
  };
}
