import { expect, test as base, type Page } from '@playwright/test';

export const ADMIN = { email: 'admin@sarh.test', password: 'Admin#2026' };
export const AGENT = { email: 'agent@sarh.test', password: 'Agent#2026' };

// Expected HTTP failures show up as console "Failed to load resource" lines: the session probe
// while signed out (401) and deliberately failed stats requests (503). Anything else, such as a
// React error or an uncaught exception, fails the test.
const EXPECTED_CONSOLE_ERRORS =
  /Failed to load resource: the server responded with a status of (401|503)/;

export const test = base.extend<{ consoleErrors: string[]; allowConsoleErrors: RegExp[] }>({
  /** Extra console errors a test causes on purpose, e.g. a simulated connection reset. */
  allowConsoleErrors: [[], { option: true }],
  consoleErrors: [
    async ({ page, allowConsoleErrors }, use) => {
      const errors: string[] = [];
      page.on('console', (message) => {
        const text = message.text();
        const expected =
          EXPECTED_CONSOLE_ERRORS.test(text) ||
          allowConsoleErrors.some((pattern) => pattern.test(text));
        if (message.type() === 'error' && !expected) errors.push(text);
      });
      page.on('pageerror', (error) => errors.push(`Uncaught: ${error.message}`));
      await use(errors);
      expect(errors, 'unexpected browser console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Opens `path` signed out, signs in on the login page and lands back on `path`. */
export async function signIn(
  page: Page,
  user: { email: string; password: string },
  path = '/orders',
) {
  await page.goto(path);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
}

/** Status cells of the rendered (virtualised) rows. */
export function statusCells(page: Page) {
  return page.locator('.orders-table__body [role="row"] > [role="cell"]:nth-child(3)');
}

/** Orders the API returns for an exact email search, read with the page's own session cookie. */
export async function ordersFor(page: Page, email: string) {
  const response = await page.request.get(`/api/orders?q=${encodeURIComponent(email)}`);
  expect(response.ok()).toBe(true);
  return ((await response.json()) as { items: Array<{ id: number; customerEmail: string }> }).items;
}
