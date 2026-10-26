import { describe, expect, it } from 'vitest';
import { decodeHalf, dot, encodeHalf, normalise, toPgVector } from './vectors.js';

describe('half-precision vectors', () => {
  it('round-trip a unit vector closely enough that similarity is unchanged', () => {
    const v = normalise(Float32Array.from({ length: 384 }, (_, i) => Math.sin(i * 1.7)));
    const back = decodeHalf(encodeHalf(v));
    expect(back).toHaveLength(384);
    expect(Math.max(...v.map((x, i) => Math.abs(x - (back[i] ?? 0))))).toBeLessThan(1e-3);
    expect(dot(v, back)).toBeGreaterThan(0.9999);
  });

  it('takes two bytes a dimension', () => {
    expect(Buffer.from(encodeHalf(new Float32Array(384)), 'base64')).toHaveLength(768);
  });

  it('writes pgvector text', () => {
    expect(toPgVector([0.5, -0.25, 0])).toBe('[0.5,-0.25,0]');
  });
});
