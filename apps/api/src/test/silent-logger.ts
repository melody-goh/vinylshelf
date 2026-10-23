import type { FastifyBaseLogger } from 'fastify';

const noop = (): void => undefined;

/** A complete logger that discards everything, for code under test that logs. */
export const silentLogger: FastifyBaseLogger = {
  level: 'silent',
  fatal: noop,
  error: noop,
  warn: noop,
  info: noop,
  debug: noop,
  trace: noop,
  silent: noop,
  child: () => silentLogger,
};
