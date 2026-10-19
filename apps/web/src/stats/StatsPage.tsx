import type { OrderStats } from '@orders/shared';
import { useEffect, useState } from 'react';
import { errorMessage } from '../lib/api-client';
import { formatCount, formatMoney, formatTime, STATUS_LABELS } from '../lib/format';
import { useOrderStats } from './use-order-stats';

export function StatsPage() {
  const stats = useOrderStats();

  // A retry with no earlier data puts the query back into its loading state. A failed
  // *refresh* keeps the last good numbers on screen next to the error.
  const error = stats.isError && (
    <div className="alert alert--error" role="alert">
      <p>
        {stats.data
          ? 'Couldn’t refresh the stats; showing the last numbers.'
          : 'Couldn’t load the stats.'}{' '}
        {errorMessage(stats.error)}
      </p>
      <button
        type="button"
        className="button"
        onClick={() => void stats.refetch()}
        disabled={stats.isFetching}
      >
        {stats.isFetching ? 'Retrying…' : 'Retry'}
      </button>
    </div>
  );
  let content = null;
  if (stats.data) content = <StatsGrid stats={stats.data} />;
  else if (!stats.isError) content = <StatsLoading />;

  return (
    <section className="page stats-page" aria-labelledby="stats-heading">
      <div className="page-header">
        <h1 id="stats-heading">Overview</h1>
        {stats.data && (
          <div className="page-header__aside">
            <span className="muted">
              {stats.isFetching ? 'Refreshing…' : `Updated ${formatTime(stats.data.generatedAt)}`}
            </span>
            <button
              type="button"
              className="button"
              onClick={() => void stats.refetch()}
              disabled={stats.isFetching}
            >
              Refresh
            </button>
          </div>
        )}
      </div>
      {error}
      {content}
    </section>
  );
}

function StatsLoading() {
  return (
    <>
      <p className="alert alert--info" role="status">
        Loading stats… <ElapsedSeconds /> This report is slow (3–6 seconds). You can keep working:
        leaving this page cancels the request.
      </p>
      <div className="stats-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="stat-card stat-card--skeleton">
            <span className="skeleton skeleton--short" />
            <span className="skeleton skeleton--wide" />
            <span className="skeleton" />
          </div>
        ))}
      </div>
    </>
  );
}

/** Mounted only while loading, so it always starts from zero. */
function ElapsedSeconds() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setSeconds((value) => value + 1), 1_000);
    return () => clearInterval(timer);
  }, []);
  return <span className="elapsed">({seconds}s)</span>;
}

function StatsGrid({ stats }: { stats: OrderStats }) {
  const { revenueToday } = stats;
  return (
    <div className="stats-grid">
      <article className="stat-card stat-card--highlight">
        <h2>Revenue today</h2>
        <p className="stat-card__value">{formatMoney(revenueToday.totalCents)}</p>
        <p className="muted">
          {formatCount(revenueToday.orderCount)} paid, shipped or delivered orders since midnight (
          {revenueToday.timeZone})
        </p>
      </article>
      {stats.byStatus.map((row) => (
        <article key={row.status} className="stat-card">
          <h2>
            <span className={`badge badge--${row.status}`}>{STATUS_LABELS[row.status]}</span>
          </h2>
          <p className="stat-card__value">{formatCount(row.count)}</p>
          <p className="muted">{formatMoney(row.totalCents)}</p>
        </article>
      ))}
    </div>
  );
}
