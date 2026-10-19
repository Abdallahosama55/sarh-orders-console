import { z } from 'zod';
import { emailAddressSchema } from './fields';

export const USER_ROLES = ['admin', 'agent'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface SessionUser {
  id: number;
  email: string;
  name: string;
  role: UserRole;
}

/**
 * Strict and string-typed on purpose: the inherited login passed `req.body` straight into
 * the query, so `{"email":{"not":""}}` could match the first user (operator injection, SEC-8).
 */
export const loginInputSchema = z.strictObject({
  email: emailAddressSchema,
  password: z
    .string({ error: 'Enter your password' })
    .min(1, 'Enter your password')
    .max(200, 'Password is too long'),
});
export type LoginInput = z.output<typeof loginInputSchema>;
