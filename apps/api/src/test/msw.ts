import { setupServer } from 'msw/node';

/**
 * One interception server for the whole API test run. It starts with no handlers and
 * errors on any unhandled request (see msw-setup.ts), so a test that reaches a live
 * third-party API fails instead of quietly calling it (CLAUDE.md).
 */
export const mswServer = setupServer();
