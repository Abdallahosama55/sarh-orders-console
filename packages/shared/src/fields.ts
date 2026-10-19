import { z } from 'zod';

/** Trimmed, lower-cased email. Used for customer emails and login. */
export const emailAddressSchema = z
  .string({ error: 'Enter an email address' })
  .trim()
  .toLowerCase()
  .max(254, 'Email is too long (max 254 characters)')
  .pipe(z.email('Enter a valid email address'));
