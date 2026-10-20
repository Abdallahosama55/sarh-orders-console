import type { RequestHandler } from 'express';
import type { Logger } from '../logger';

/** One line per request, including requests the client abandoned (useful when testing R1-8 and O1-3). */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const startedAt = performance.now();
    res.once('close', () => {
      const elapsedMs = Math.round(performance.now() - startedAt);
      const target = `${req.method} ${redactUrl(req.originalUrl)}`;
      if (res.writableFinished) logger.info(`${target} ${res.statusCode} ${elapsedMs}ms`);
      else logger.info(`${target} aborted by client after ${elapsedMs}ms`);
    });
    next();
  };
}

/** Line breaks (CR, LF, NEL, U+2028/9) and other control characters. */
const CONTROL_CHARACTERS = /[\p{Cc}\p{Zl}\p{Zp}]/gu;

/** Search terms are customer names and emails, which are PII and must not reach logs (NFR-6). */
export function redactUrl(url: string): string {
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return url;
  const params = new URLSearchParams(url.slice(queryStart + 1));
  if (params.has('q')) params.set('q', '<redacted>');
  if (params.has('cursor')) params.set('cursor', '…');
  // Decoded so the line stays readable, except control characters: a decoded %0A would end
  // the line here and let the request write a forged one after it.
  const query = decodeURIComponent(params.toString()).replace(CONTROL_CHARACTERS, (character) =>
    encodeURIComponent(character),
  );
  return `${url.slice(0, queryStart)}?${query}`;
}
