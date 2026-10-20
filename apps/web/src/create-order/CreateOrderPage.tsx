import { zodResolver } from '@hookform/resolvers/zod';
import {
  MAX_ITEMS_PER_ORDER,
  type ExistingOrderDetails,
  type OrderDetail,
  type ValidationErrorDetails,
} from '@orders/shared';
import { useEffect, useRef, useState, type BaseSyntheticEvent } from 'react';
import { useFieldArray, useForm, useWatch, type UseFormSetError } from 'react-hook-form';
import { Link } from 'react-router';
import { Field } from '../components/Field';
import { ApiError, errorMessage } from '../lib/api-client';
import { formatMoney } from '../lib/format';
import { useOrderDraft } from './order-draft';
import {
  emptyItem,
  lineTotalCents,
  orderFormSchema,
  toCreateOrderInput,
  toFormField,
  type OrderFormValues,
  type ValidOrderForm,
} from './order-form';
import { MAX_AUTOMATIC_RETRIES, useCreateOrder } from './use-create-order';

type CreateOrderMutation = ReturnType<typeof useCreateOrder>;

export function CreateOrderPage() {
  const draft = useOrderDraft();
  const createOrder = useCreateOrder();
  const [created, setCreated] = useState<{ order: OrderDetail; replayed: boolean } | null>(null);
  const inFlight = useRef(false);
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    getValues,
    subscribe,
    formState: { errors },
  } = useForm<OrderFormValues, unknown, ValidOrderForm>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: draft.initialValues,
    mode: 'onTouched',
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const items = useWatch({ control, name: 'items' });
  const totalCents = items.reduce((sum, item) => sum + lineTotalCents(item), 0);

  // Keep the draft (and its key) in sessionStorage as the agent types.
  const { save } = draft;
  useEffect(
    () =>
      subscribe({
        formState: { values: true },
        callback: ({ values }) => save(values),
      }),
    [subscribe, save],
  );

  const create = async (values: ValidOrderForm) => {
    // A second click or Enter can arrive before React re-renders the disabled button.
    if (inFlight.current) return;
    inFlight.current = true;
    save(getValues()); // the key must be stored before the request leaves
    try {
      const result = await createOrder.mutateAsync({
        input: toCreateOrderInput(values),
        idempotencyKey: draft.currentKey(),
      });
      draft.discard();
      setCreated(result);
    } catch (error) {
      showServerFieldErrors(error, setError);
    } finally {
      inFlight.current = false;
    }
  };
  const submit = (event?: BaseSyntheticEvent) => handleSubmit(create)(event);

  const startNewOrder = () => {
    const next = draft.startNew();
    reset(next.values);
    createOrder.reset();
    setCreated(null);
  };

  if (created) return <OrderCreated {...created} onCreateAnother={startNewOrder} />;

  const pending = createOrder.isPending;
  return (
    <section className="page create-order" aria-labelledby="create-order-heading">
      <div className="page-header">
        <h1 id="create-order-heading">New order</h1>
      </div>
      <form className="card form" onSubmit={submit} noValidate aria-busy={pending || undefined}>
        <fieldset className="form__section" disabled={pending}>
          <legend>Customer</legend>
          <div className="form__row">
            <Field label="Customer name" error={errors.customerName?.message}>
              {(control) => (
                <input {...control} autoComplete="off" dir="auto" {...register('customerName')} />
              )}
            </Field>
            <Field label="Customer email" error={errors.customerEmail?.message}>
              {(control) => (
                <input
                  {...control}
                  type="email"
                  autoComplete="off"
                  {...register('customerEmail')}
                />
              )}
            </Field>
          </div>
        </fieldset>

        <fieldset className="form__section" disabled={pending}>
          <legend>Items</legend>
          <div className="item-row item-row--head" aria-hidden="true">
            <span>Product</span>
            <span>Qty</span>
            <span>Unit price (SAR)</span>
            <span className="num">Line total</span>
            <span />
          </div>
          {fields.map((field, index) => {
            const itemErrors = errors.items?.[index];
            return (
              <div key={field.id} className="item-row">
                <Field
                  label={`Product ${index + 1}`}
                  hideLabel
                  error={itemErrors?.productName?.message}
                >
                  {(control) => (
                    <input
                      {...control}
                      placeholder="Product name"
                      {...register(`items.${index}.productName`)}
                    />
                  )}
                </Field>
                <Field
                  label={`Quantity ${index + 1}`}
                  hideLabel
                  error={itemErrors?.quantity?.message}
                >
                  {(control) => (
                    <input
                      {...control}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      step={1}
                      {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                    />
                  )}
                </Field>
                <Field
                  label={`Unit price ${index + 1}`}
                  hideLabel
                  error={itemErrors?.unitPrice?.message}
                >
                  {(control) => (
                    <input
                      {...control}
                      inputMode="decimal"
                      placeholder="0.00"
                      {...register(`items.${index}.unitPrice`)}
                    />
                  )}
                </Field>
                <output className="item-row__total num" aria-label={`Line total ${index + 1}`}>
                  {formatMoney(lineTotalCents(items[index]))}
                </output>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove item ${index + 1}`}
                  onClick={() => remove(index)}
                  disabled={fields.length === 1}
                >
                  ×
                </button>
              </div>
            );
          })}
          {(errors.items?.message ?? errors.items?.root?.message) && (
            <p className="field__error">{errors.items?.message ?? errors.items?.root?.message}</p>
          )}
          <button
            type="button"
            className="button"
            onClick={() => append(emptyItem())}
            disabled={fields.length >= MAX_ITEMS_PER_ORDER}
          >
            + Add item
          </button>
        </fieldset>

        <div className="form__footer">
          <p className="form__total">
            Total <output aria-label="Order total">{formatMoney(totalCents)}</output>
          </p>
          <button type="submit" className="button button--primary" disabled={pending}>
            {pending ? 'Creating…' : 'Create order'}
          </button>
        </div>
        <SubmitStatus
          mutation={createOrder}
          onRetry={() => void submit()}
          onStartNew={startNewOrder}
        />
      </form>
    </section>
  );
}

function SubmitStatus({
  mutation,
  onRetry,
  onStartNew,
}: {
  mutation: CreateOrderMutation;
  onRetry: () => void;
  onStartNew: () => void;
}) {
  if (mutation.isPending && mutation.failureCount > 0) {
    return (
      <p className="alert alert--warning" role="status">
        Connection problem: retrying ({mutation.failureCount} of {MAX_AUTOMATIC_RETRIES})… The order
        will never be created twice.
      </p>
    );
  }
  if (!mutation.isError) return null;

  const error = mutation.error;
  if (error instanceof ApiError && error.code === 'validation_failed') {
    return (
      <p className="alert alert--error" role="alert">
        The server rejected some fields. Please fix the highlighted fields.
      </p>
    );
  }
  if (
    error instanceof ApiError &&
    (error.code === 'idempotency_key_reused' || error.code === 'order_deleted')
  ) {
    const orderId = (error.details as ExistingOrderDetails | undefined)?.orderId;
    return (
      <div className="alert alert--error" role="alert">
        <p>{error.message}</p>
        <div className="alert__actions">
          {orderId !== undefined && error.code === 'idempotency_key_reused' && (
            <Link to={`/orders/${orderId}`}>View order #{orderId}</Link>
          )}
          <button type="button" className="button" onClick={onStartNew}>
            Start a new order
          </button>
        </div>
      </div>
    );
  }
  if (error instanceof ApiError && error.status < 500) {
    return (
      <p className="alert alert--error" role="alert">
        {error.message}
      </p>
    );
  }
  // Network failure, timeout or 5xx after the automatic retries: the outcome is unknown.
  return (
    <div className="alert alert--error" role="alert">
      <p>
        We couldn’t confirm whether the order was created ({errorMessage(error)}). Trying again is
        safe: the same order can never be created twice.
      </p>
      <button type="button" className="button" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

function OrderCreated({
  order,
  replayed,
  onCreateAnother,
}: {
  order: OrderDetail;
  replayed: boolean;
  onCreateAnother: () => void;
}) {
  return (
    <section className="page create-order" aria-labelledby="order-created-heading">
      <div className="card success" role="status">
        <h1 id="order-created-heading">Order #{order.id} created</h1>
        {replayed && (
          <p className="muted">
            This order had already reached the server, so it was not created twice.
          </p>
        )}
        <dl className="details details--inline">
          <div>
            <dt>Customer</dt>
            <dd>
              <bdi>{order.customerName}</bdi> · {order.customerEmail}
            </dd>
          </div>
          <div>
            <dt>Items</dt>
            <dd>{order.items.length}</dd>
          </div>
          <div>
            <dt>Total</dt>
            <dd>{formatMoney(order.totalCents)}</dd>
          </div>
        </dl>
        <div className="success__actions">
          <Link className="button" to={`/orders/${order.id}`}>
            View order
          </Link>
          <button type="button" className="button button--primary" onClick={onCreateAnother}>
            Create another order
          </button>
        </div>
      </div>
    </section>
  );
}

/** Puts the server's per-field messages next to the inputs they belong to. */
function showServerFieldErrors(error: unknown, setError: UseFormSetError<OrderFormValues>): void {
  if (!(error instanceof ApiError) || error.code !== 'validation_failed') return;
  const fields = (error.details as ValidationErrorDetails | undefined)?.fields ?? {};
  for (const [apiPath, message] of Object.entries(fields)) {
    const formField = toFormField(apiPath);
    if (formField) setError(formField, { type: 'server', message });
  }
}
