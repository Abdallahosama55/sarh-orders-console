import type { ValidationErrorDetails } from '@orders/shared';
import type { z } from 'zod';
import { HttpError } from './errors';

/** Parses untrusted input or throws a 400 whose details map field paths to messages. */
export function parseOrThrow<Schema extends z.ZodType>(
  schema: Schema,
  input: unknown,
): z.output<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const details: ValidationErrorDetails = { fields: toFieldErrors(result.error) };
    throw new HttpError(400, 'validation_failed', 'Some fields are invalid.', details);
  }
  return result.data;
}

/** `items.0.quantity` → first message for that path. Root-level issues use `_root`. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '_root';
    fields[key] ??= issue.message;
  }
  return fields;
}
