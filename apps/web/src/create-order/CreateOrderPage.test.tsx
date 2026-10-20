// R2 on the client: validation, one request per submission, retries that reuse the key.
import { IDEMPOTENCY_KEY_HEADER } from '@orders/shared';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { makeOrderDetail } from '../test/fixtures';
import { renderApp } from '../test/render';
import { server } from '../test/server';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DRAFT_STORAGE_KEY = 'orders-console:create-order-draft';

interface RecordedPost {
  key: string | null;
  body: unknown;
}

function recordPosts(respond: (attempt: number) => Response | Promise<Response>) {
  const posts: RecordedPost[] = [];
  server.use(
    http.post('/api/orders', async ({ request }) => {
      posts.push({ key: request.headers.get(IDEMPOTENCY_KEY_HEADER), body: await request.json() });
      return respond(posts.length);
    }),
  );
  return posts;
}

const created = (headers?: Record<string, string>) =>
  HttpResponse.json(makeOrderDetail(), { status: 201, headers });

async function fillValidOrder(events: UserEvent) {
  await events.type(screen.getByLabelText('Customer name'), '  Huda Al-Qahtani ');
  await events.type(screen.getByLabelText('Customer email'), 'Huda.Q@Example.com');
  await events.type(screen.getByLabelText('Product 1'), 'Sukkari Dates Gift Box');
  await events.clear(screen.getByLabelText('Quantity 1'));
  await events.type(screen.getByLabelText('Quantity 1'), '2');
  await events.type(screen.getByLabelText('Unit price 1'), '95');
}

const createButton = () => screen.getByRole('button', { name: 'Create order' });

/** Renders /orders/new and waits until the session check has let the form through. */
async function openForm() {
  const view = renderApp('/orders/new');
  await screen.findByRole('heading', { name: 'New order' });
  return view;
}

describe('CreateOrderPage', () => {
  it('validates on the client and sends nothing while the form is invalid', async () => {
    const posts = recordPosts(() => created());
    const { events } = await openForm();

    await events.click(createButton());

    expect(
      await screen.findByText('Enter the customer’s name (at least 2 characters)'),
    ).toBeInTheDocument();
    expect(screen.getByText('Enter a valid email address')).toBeInTheDocument();
    expect(screen.getByText('Enter a product')).toBeInTheDocument();
    expect(screen.getByText('Enter a price')).toBeInTheDocument();
    expect(posts).toHaveLength(0);

    await events.type(screen.getByLabelText('Unit price 1'), '12.345');
    await events.tab();
    expect(await screen.findByText('Enter a price like 12.50')).toBeInTheDocument();
  });

  it('shows a live total as items are added and edited', async () => {
    const { events } = await openForm();
    await fillValidOrder(events);
    await events.click(screen.getByRole('button', { name: '+ Add item' }));
    await events.type(screen.getByLabelText('Product 2'), 'Arabic Coffee Dallah');
    await events.type(screen.getByLabelText('Unit price 2'), '120');

    expect(screen.getByLabelText('Line total 1')).toHaveTextContent(/SAR\s190\.00/);
    expect(screen.getByLabelText('Order total')).toHaveTextContent(/SAR\s310\.00/);

    await events.click(screen.getByRole('button', { name: 'Remove item 2' }));
    expect(screen.getByLabelText('Order total')).toHaveTextContent(/SAR\s190\.00/);
  });

  it('sends one request on a double-click, with a UUID key and a normalised body', async () => {
    const posts = recordPosts(async () => {
      await delay(150);
      return created();
    });
    const { events } = await openForm();
    await fillValidOrder(events);

    await events.dblClick(createButton());

    expect(
      await screen.findByRole('heading', { name: 'Order #50001 created' }),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(1);
    expect(posts[0]!.key).toMatch(UUID);
    expect(posts[0]!.body).toEqual({
      customer: { name: 'Huda Al-Qahtani', email: 'huda.q@example.com' },
      items: [{ productName: 'Sukkari Dates Gift Box', quantity: 2, unitPriceCents: 9_500 }],
    });
  });

  it('sends one request even when two submits fire before React can re-render', async () => {
    const posts = recordPosts(async () => {
      await delay(100);
      return created();
    });
    const { events } = await openForm();
    await fillValidOrder(events);

    // A fast double Enter: both events are dispatched before the button can become disabled.
    const form = createButton().closest('form')!;
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(
      await screen.findByRole('heading', { name: 'Order #50001 created' }),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(1);
  });

  it('retries a lost response with the same key and shows the original order', async () => {
    const posts = recordPosts((attempt) =>
      attempt === 1 ? HttpResponse.error() : created({ 'Idempotent-Replayed': 'true' }),
    );
    const { events } = await openForm();
    await fillValidOrder(events);

    await events.click(createButton());

    expect(
      await screen.findByRole('heading', { name: 'Order #50001 created' }, { timeout: 3_000 }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/already reached the server, so it was not created twice/),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(2);
    expect(posts[1]!.key).toBe(posts[0]!.key);
  });

  it('after the automatic retries, offers a "Try again" that still reuses the key', async () => {
    let failing = true;
    const posts = recordPosts(() =>
      failing
        ? HttpResponse.json(
            { error: { code: 'database_busy', message: 'The database is busy. Please retry.' } },
            { status: 503 },
          )
        : created(),
    );
    const { events } = await openForm();
    await fillValidOrder(events);

    await events.click(createButton());
    expect(
      await screen.findByText(/couldn’t confirm whether the order was created/i, undefined, {
        timeout: 4_000,
      }),
    ).toBeInTheDocument();
    expect(posts).toHaveLength(3); // the first attempt + 2 automatic retries

    failing = false;
    await events.click(screen.getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { name: 'Order #50001 created' }),
    ).toBeInTheDocument();
    expect(new Set(posts.map((post) => post.key)).size).toBe(1);
  }, 10_000);

  it('puts server-side validation messages next to the right fields', async () => {
    recordPosts(() =>
      HttpResponse.json(
        {
          error: {
            code: 'validation_failed',
            message: 'Some fields are invalid.',
            details: {
              fields: {
                'customer.email': 'This address bounces',
                'items.0.unitPriceCents': 'Price is too high',
              },
            },
          },
        },
        { status: 400 },
      ),
    );
    const { events } = await openForm();
    await fillValidOrder(events);
    await events.click(createButton());

    expect(await screen.findByText('This address bounces')).toBeInTheDocument();
    expect(screen.getByText('Price is too high')).toBeInTheDocument();
    expect(screen.getByLabelText('Customer email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('explains a key that was already used for a different order and links to it', async () => {
    recordPosts(() =>
      HttpResponse.json(
        {
          error: {
            code: 'idempotency_key_reused',
            message: 'This draft was already submitted as order #77 with different details.',
            details: { orderId: 77 },
          },
        },
        { status: 422 },
      ),
    );
    const { events } = await openForm();
    await fillValidOrder(events);
    await events.click(createButton());

    expect(await screen.findByRole('link', { name: 'View order #77' })).toHaveAttribute(
      'href',
      '/orders/77',
    );
    await events.click(screen.getByRole('button', { name: 'Start a new order' }));
    expect(screen.getByLabelText('Customer name')).toHaveValue('');
  });

  it('keeps the draft and its key across a reload; only the next order gets a new key', async () => {
    const posts = recordPosts(() => created());
    const first = await openForm();
    await fillValidOrder(first.events);
    const storedKey = JSON.parse(
      window.sessionStorage.getItem(DRAFT_STORAGE_KEY) ?? '{}',
    ).idempotencyKey;
    expect(storedKey).toMatch(UUID);
    first.unmount(); // the agent reloads the page

    const second = await openForm();
    expect(screen.getByLabelText('Customer name')).toHaveValue('  Huda Al-Qahtani ');
    await second.events.click(createButton());
    await screen.findByRole('heading', { name: 'Order #50001 created' });
    expect(posts[0]!.key).toBe(storedKey);
    expect(window.sessionStorage.getItem(DRAFT_STORAGE_KEY)).toBeNull(); // confirmed: nothing left to retry

    await second.events.click(screen.getByRole('button', { name: 'Create another order' }));
    expect(screen.getByLabelText('Customer name')).toHaveValue('');
    await fillValidOrder(second.events);
    await second.events.click(createButton());
    await waitFor(() => expect(posts).toHaveLength(2));
    expect(posts[1]!.key).toMatch(UUID);
    expect(posts[1]!.key).not.toBe(posts[0]!.key);
  });

  it('never restores a spent key when the agent reloads right after "Create another order"', async () => {
    const posts = recordPosts(() => created());
    const first = await openForm();
    await fillValidOrder(first.events);
    await first.events.click(createButton());
    await screen.findByRole('heading', { name: 'Order #50001 created' });
    // reset() saves the emptied form synchronously, before React re-renders with the new key.
    await first.events.click(screen.getByRole('button', { name: 'Create another order' }));
    first.unmount(); // reload before typing anything

    const second = await openForm();
    await fillValidOrder(second.events);
    await second.events.click(createButton());
    await waitFor(() => expect(posts).toHaveLength(2));
    // With the spent key, the server would replay order #50001 instead of creating this one.
    expect(posts[1]!.key).toMatch(UUID);
    expect(posts[1]!.key).not.toBe(posts[0]!.key);
  });
});
