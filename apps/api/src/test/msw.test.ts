import { describe, expect, it } from 'vitest';

describe('network guard', () => {
  it('fails any outbound request no test has mocked (CLAUDE.md: never hit live APIs)', async () => {
    await expect(fetch('https://example.org/should-never-be-called')).rejects.toThrow();
  });
});
