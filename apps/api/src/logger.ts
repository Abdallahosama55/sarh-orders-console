import type { LogLevel } from './config';

type Fields = Record<string, unknown>;

export interface Logger {
  debug(message: string, fields?: Fields): void;
  info(message: string, fields?: Fields): void;
  warn(message: string, fields?: Fields): void;
  error(message: string, fields?: Fields): void;
}

const SEVERITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

/** Minimal line logger. Callers must never pass tokens, passwords or search terms (NFR-6). */
export function createLogger(level: LogLevel): Logger {
  const write = (lineLevel: Exclude<LogLevel, 'silent'>, message: string, fields?: Fields) => {
    if (SEVERITY[lineLevel] < SEVERITY[level]) return;
    const line = `${new Date().toISOString()} ${lineLevel.toUpperCase().padEnd(5)} ${message}`;
    const output = fields ? `${line} ${JSON.stringify(fields)}` : line;
    if (lineLevel === 'error' || lineLevel === 'warn') console.error(output);
    else console.log(output);
  };
  return {
    debug: (message, fields) => write('debug', message, fields),
    info: (message, fields) => write('info', message, fields),
    warn: (message, fields) => write('warn', message, fields),
    error: (message, fields) => write('error', message, fields),
  };
}
