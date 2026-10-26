import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, vi } from 'vitest';
import { server } from './server';

// jsdom has no media playback. Playing resolves at once and fires the events a browser
// would, so components see play and pause as they would for real.
Object.defineProperties(HTMLMediaElement.prototype, {
  load: { configurable: true, value: vi.fn() },
  play: {
    configurable: true,
    value: vi.fn(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { configurable: true, value: false });
      this.dispatchEvent(new Event('play'));
      return Promise.resolve();
    }),
  },
  pause: {
    configurable: true,
    value: vi.fn(function (this: HTMLMediaElement) {
      Object.defineProperty(this, 'paused', { configurable: true, value: true });
      this.dispatchEvent(new Event('pause'));
    }),
  },
});

// Any request no test has mocked fails the test: web tests never reach a real server.
beforeAll(() => {
  server.listen({ onUnhandledFrame: 'error' });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  window.history.replaceState(null, '', '/');
});

afterAll(() => {
  server.close();
});
