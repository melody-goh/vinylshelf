/**
 * Time as a dependency. Rate limiting and TTL enforcement depend on "now", so tests
 * inject a fake clock instead of sleeping or mocking globals.
 */
export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};
