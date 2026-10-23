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
