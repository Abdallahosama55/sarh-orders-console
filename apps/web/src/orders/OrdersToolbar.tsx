import { MAX_SEARCH_LENGTH, ORDER_STATUSES } from '@orders/shared';
import { STATUS_LABELS } from '../lib/format';
import { SORT_OPTIONS, type OrderFilters } from './order-filters';

interface OrdersToolbarProps {
  filters: OrderFilters;
  onChange: (patch: Partial<OrderFilters>) => void;
}

const STATUS_CHOICES = [undefined, ...ORDER_STATUSES] as const;

export function OrdersToolbar({ filters, onChange }: OrdersToolbarProps) {
  return (
    <div className="toolbar" role="search">
      <label className="toolbar__search">
        <span className="visually-hidden">Search orders</span>
        <input
          type="search"
          placeholder="Search name, email or #order"
          value={filters.q ?? ''}
          maxLength={MAX_SEARCH_LENGTH}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange({ q: event.target.value })}
        />
      </label>

      <fieldset className="segmented">
        <legend className="visually-hidden">Status</legend>
        {STATUS_CHOICES.map((status) => (
          <label key={status ?? 'all'} className="segmented__option">
            <input
              type="radio"
              name="status"
              checked={filters.status === status}
              onChange={() => onChange({ status })}
            />
            <span>{status ? STATUS_LABELS[status] : 'All'}</span>
          </label>
        ))}
      </fieldset>

      <label className="toolbar__sort">
        <span className="toolbar__sort-label">Sort</span>
        <select
          value={`${filters.sort}:${filters.dir}`}
          onChange={(event) => {
            const option = SORT_OPTIONS.find(({ value }) => value === event.target.value);
            if (option) onChange({ sort: option.sort, dir: option.dir });
          }}
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
