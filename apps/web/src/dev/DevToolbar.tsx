import { SLOW_LIST_MAX_MS, setDevFlag, useDevFlags } from './dev-flags';

/** Development builds only (lazy-loaded behind import.meta.env.DEV; absent from production). */
export default function DevToolbar() {
  const flags = useDevFlags();
  return (
    <aside className="dev-toolbar" aria-label="Developer tools">
      <span className="dev-toolbar__tag">DEV</span>
      <label>
        <input
          type="checkbox"
          checked={flags.slowList}
          onChange={(event) => setDevFlag('slowList', event.target.checked)}
        />
        Slow list requests (random 0–{SLOW_LIST_MAX_MS / 1000}s each)
      </label>
      <label>
        <input
          type="checkbox"
          checked={flags.failStats}
          onChange={(event) => setDevFlag('failStats', event.target.checked)}
        />
        Make stats requests fail
      </label>
    </aside>
  );
}
