// SEC: sessions and roles as an agent and an admin actually experience them.
import { randomUUID } from 'node:crypto';
import { ADMIN, AGENT, expect, signIn, test } from './fixtures';

test.describe('authentication and roles', () => {
  test('a signed-out visitor is sent to sign in, then back to the page they asked for', async ({
    page,
  }) => {
    await page.goto('/orders?status=paid');
    await expect(page).toHaveURL(/\/login\?next=%2Forders%3Fstatus%3Dpaid$/);
    await page.getByLabel('Email').fill(AGENT.email);
    await page.getByLabel('Password').fill('wrong password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toHaveText('Wrong email or password.');

    await page.getByLabel('Password').fill(AGENT.password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/orders\?status=paid$/);
    await expect(page.getByRole('radio', { name: 'Paid' })).toBeChecked();
  });

  test('the session cookie is httpOnly and SameSite=Strict, invisible to page scripts', async ({
    page,
    context,
  }) => {
    await signIn(page, AGENT);
    const session = (await context.cookies()).find((cookie) => cookie.name === 'session');
    expect(session).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/api' });
    expect(await page.evaluate(() => document.cookie)).not.toContain('session=');
  });

  test('agents see no delete control, and the API refuses them anyway (403)', async ({ page }) => {
    await signIn(page, AGENT, '/orders/100');
    await expect(page.getByRole('dialog', { name: 'Order #100' })).toContainText('Line total');
    await expect(page.getByRole('button', { name: 'Delete order' })).toHaveCount(0);

    const response = await page.request.delete('/api/orders/100');
    expect(response.status()).toBe(403);
  });

  test('a cross-origin form post is rejected even with a valid session (CSRF)', async ({
    page,
  }) => {
    await signIn(page, ADMIN);
    const response = await page.request.delete('/api/orders/101', {
      headers: { Origin: 'https://evil.example' },
    });
    expect(response.status()).toBe(403);
    expect((await response.json()).error.code).toBe('bad_origin');
  });

  test('admins can delete after confirming; the order disappears from the console', async ({
    page,
  }) => {
    await signIn(page, ADMIN);
    // Its own order, so the test can run any number of times against the same database.
    const created = await page.request.post('/api/orders', {
      headers: { 'Idempotency-Key': randomUUID() },
      data: {
        customer: { name: 'To Be Deleted', email: `delete.${Date.now()}@example.com` },
        items: [{ productName: 'Tea Set', quantity: 1, unitPriceCents: 15_500 }],
      },
    });
    expect(created.status()).toBe(201);
    const { id } = (await created.json()) as { id: number };

    await page.goto(`/orders/${id}`);
    const panel = page.getByRole('dialog', { name: `Order #${id}` });
    await panel.getByRole('button', { name: 'Delete order' }).click();
    await panel.getByRole('button', { name: 'Yes, delete' }).click();

    await expect(page.getByText(`Order #${id} was deleted.`)).toBeVisible();
    await page.getByRole('searchbox', { name: 'Search orders' }).fill(`#${id}`);
    await expect(page.getByText('No orders match these filters.')).toBeVisible();
  });

  test('signing out ends the session for every copy of the token', async ({ page, context }) => {
    await signIn(page, AGENT);
    const token = (await context.cookies()).find((cookie) => cookie.name === 'session')!.value;
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page.getByLabel('Email')).toBeVisible();

    const replay = await page.request.get('/api/orders', {
      headers: { Cookie: `session=${token}` },
    });
    expect(replay.status()).toBe(401);
  });
});
