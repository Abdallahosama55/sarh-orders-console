/**
 * Web Storage can be missing or throw (private mode, blocked site data, quota), so every
 * access is guarded. Losing a draft is acceptable; crashing the form is not.
 */
const PREFIX = 'orders-console:';

function store(kind: 'local' | 'session'): Storage | null {
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
}

export function readStored(kind: 'local' | 'session', key: string): string | null {
  try {
    return store(kind)?.getItem(PREFIX + key) ?? null;
  } catch {
    return null;
  }
}

export function writeStored(kind: 'local' | 'session', key: string, value: string): void {
  try {
    store(kind)?.setItem(PREFIX + key, value);
  } catch {
    // Storage full or unavailable: the app keeps working, only persistence is lost.
  }
}

export function removeStored(kind: 'local' | 'session', key: string): void {
  try {
    store(kind)?.removeItem(PREFIX + key);
  } catch {
    // Nothing to do.
  }
}

/** On sign-out: the next person at this desk must not inherit the previous agent's draft. */
export function clearSessionStore(): void {
  try {
    const session = store('session');
    if (!session) return;
    for (const key of Object.keys(session)) if (key.startsWith(PREFIX)) session.removeItem(key);
  } catch {
    // Nothing to do.
  }
}
