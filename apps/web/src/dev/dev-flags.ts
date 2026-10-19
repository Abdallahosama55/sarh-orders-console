import { DEBUG_FAIL_HEADER, DEBUG_LATENCY_HEADER } from '@orders/shared';
import { useSyncExternalStore } from 'react';
import { readStored, writeStored } from '../lib/storage';

/**
 * Development-only switches that let a reviewer *see* the behaviour under test:
 * slow, out-of-order list responses (R1-8) and a failing stats report (O1-4).
 * They only add request headers, which the API ignores in production.
 */
export interface DevFlags {
  slowList: boolean;
  failStats: boolean;
}

const STORAGE_KEY = 'dev-flags';
export const SLOW_LIST_MAX_MS = 2_000;

let flags: DevFlags = readFlags();
const listeners = new Set<() => void>();

function readFlags(): DevFlags {
  try {
    const stored = JSON.parse(readStored('local', STORAGE_KEY) ?? '{}') as Partial<DevFlags>;
    return { slowList: stored.slowList === true, failStats: stored.failStats === true };
  } catch {
    return { slowList: false, failStats: false };
  }
}

export function setDevFlag(name: keyof DevFlags, value: boolean): void {
  flags = { ...flags, [name]: value };
  writeStored('local', STORAGE_KEY, JSON.stringify(flags));
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useDevFlags(): DevFlags {
  return useSyncExternalStore(subscribe, () => flags);
}

export function devRequestHeaders(request: 'list' | 'stats'): Record<string, string> {
  if (!import.meta.env.DEV) return {};
  if (request === 'list' && flags.slowList)
    return { [DEBUG_LATENCY_HEADER]: String(SLOW_LIST_MAX_MS) };
  if (request === 'stats' && flags.failStats) return { [DEBUG_FAIL_HEADER]: '1' };
  return {};
}
