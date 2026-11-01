import type { TasteEvent } from '@vinylshelf/contract';
import { api } from './client';

/** How long events wait to travel together, and the most one batch may carry (the API's cap). */
const FLUSH_MS = 3000;
const BATCH = 50;

let pending: TasteEvent[] = [];
let timer: number | undefined;

/**
 * Reports what the listener did with a pick (ADR 0013). Events are batched and sent in
 * the background; one that cannot be sent is dropped rather than retried, since these
 * measure the engine and must never get in the listener's way.
 */
export function reportTasteEvent(event: TasteEvent): void {
  pending.push(event);
  if (pending.length >= BATCH) flushTasteEvents();
  else timer ??= window.setTimeout(flushTasteEvents, FLUSH_MS);
}

/** Sends everything waiting now; `keepalive` lets the last batch outlive the page. */
export function flushTasteEvents(): void {
  window.clearTimeout(timer);
  timer = undefined;
  while (pending.length > 0) {
    const events = pending.slice(0, BATCH);
    pending = pending.slice(BATCH);
    void api.POST('/taste/events', { body: { events }, keepalive: true }).catch(() => undefined);
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushTasteEvents();
  });
}
