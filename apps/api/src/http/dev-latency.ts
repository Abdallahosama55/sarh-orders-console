import { DEBUG_LATENCY_HEADER } from '@orders/shared';
import type { RequestHandler } from 'express';
import { setTimeout as sleep } from 'node:timers/promises';
import { abortSignalFor } from './abort';

const MAX_SIMULATED_LATENCY_MS = 5_000;

/**
 * Development only (mounted when `config.devSimulation`): `X-Debug-Latency: <ms>` delays the
 * request by a random 0–ms. On a fast laptop every response arrives in order, so this is what
 * lets a reviewer actually *see* the rapid-filter race being handled (R1-8).
 */
export function devLatency(): RequestHandler {
  return async (req, res, next) => {
    const maxMs = Number(req.get(DEBUG_LATENCY_HEADER));
    if (!Number.isFinite(maxMs) || maxMs <= 0) {
      next();
      return;
    }
    const delayMs = Math.round(Math.random() * Math.min(maxMs, MAX_SIMULATED_LATENCY_MS));
    try {
      await sleep(delayMs, undefined, { signal: abortSignalFor(res) });
    } catch {
      return; // the client cancelled; there is nobody left to answer
    }
    next();
  };
}
