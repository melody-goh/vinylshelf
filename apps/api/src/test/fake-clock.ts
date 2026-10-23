import type { Clock } from '../lib/clock.js';

/** A clock whose sleeps advance virtual time instantly and are recorded. */
export function fakeClock(start = 0): Clock & { sleeps: number[]; time: number } {
  const clock = {
    time: start,
    sleeps: [] as number[],
    now: () => clock.time,
    sleep: (ms: number) => {
      clock.sleeps.push(ms);
      clock.time += ms;
      return Promise.resolve();
    },
  };
  return clock;
}

/**
 * A clock whose sleeps stay pending until the test calls `advance`. Use it to observe
 * who is still waiting at a given moment, which an instant clock cannot show.
 */
export function manualClock(start = 0): Clock & { advance(ms: number): Promise<void> } {
  let time = start;
  let sleepers: { until: number; wake: () => void }[] = [];
  return {
    now: () => time,
    sleep: (ms) =>
      new Promise<void>((resolve) => {
        sleepers.push({ until: time + ms, wake: resolve });
      }),
    async advance(ms) {
      time += ms;
      const due = sleepers.filter((s) => s.until <= time);
      sleepers = sleepers.filter((s) => s.until > time);
      for (const sleeper of due) sleeper.wake();
      // Let woken waiters run before the test continues.
      await new Promise((resolve) => setImmediate(resolve));
    },
  };
}
