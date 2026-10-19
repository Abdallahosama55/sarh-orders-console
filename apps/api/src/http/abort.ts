import type { Response } from 'express';

/**
 * A signal that fires when the client disconnects before we answered, so slow work
 * (the stats report, simulated latency) can stop instead of finishing for nobody.
 * `res` emits 'close' both after a normal response and on an early disconnect;
 * `writableFinished` tells the two apart.
 */
export function abortSignalFor(res: Response): AbortSignal {
  const controller = new AbortController();
  res.once('close', () => {
    if (!res.writableFinished) controller.abort();
  });
  return controller.signal;
}
