/**
 * Small vector helpers for the taste engine. Vectors are unit length (the embedder
 * normalises them), so cosine similarity is a dot product.
 *
 * Catalogue vectors travel as half-precision floats (ADR 0012): half the size of
 * float32, the same precision pgvector's `halfvec` stores, and far more than embedding
 * similarity needs. Node 22 has no Float16Array, so conversion is done here.
 */

export function dot(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] ?? 0) * (b[i] ?? 0);
  return sum;
}

/** Scales a vector to unit length in place; a zero vector stays zero. */
export function normalise(v: Float32Array): Float32Array {
  const length = Math.sqrt(dot(v, v));
  if (length > 0) for (let i = 0; i < v.length; i++) v[i] = (v[i] ?? 0) / length;
  return v;
}

const scratch = new DataView(new ArrayBuffer(4));

/** IEEE 754 binary32 to binary16, rounding to nearest (enough for unit vectors). */
function toHalf(value: number): number {
  scratch.setFloat32(0, value);
  const bits = scratch.getUint32(0);
  const sign = (bits >>> 16) & 0x8000;
  const exponent = ((bits >>> 23) & 0xff) - 127 + 15;
  const mantissa = bits & 0x7fffff;
  if (exponent <= 0) {
    // Subnormal or zero in half precision.
    if (exponent < -10) return sign;
    const m = (mantissa | 0x800000) >> (1 - exponent);
    return sign | ((m + 0x1000) >> 13);
  }
  if (exponent >= 0x1f) return sign | 0x7c00;
  return sign | (exponent << 10) | ((mantissa + 0x1000) >> 13);
}

function fromHalf(half: number): number {
  const sign = half & 0x8000 ? -1 : 1;
  const exponent = (half >> 10) & 0x1f;
  const mantissa = half & 0x3ff;
  if (exponent === 0) return sign * 2 ** -14 * (mantissa / 1024);
  if (exponent === 0x1f) return mantissa ? Number.NaN : sign * Number.POSITIVE_INFINITY;
  return sign * 2 ** (exponent - 15) * (1 + mantissa / 1024);
}

/** A vector as base64 half-precision floats, little-endian. */
export function encodeHalf(vector: ArrayLike<number>): string {
  const bytes = Buffer.alloc(vector.length * 2);
  for (let i = 0; i < vector.length; i++) bytes.writeUInt16LE(toHalf(vector[i] ?? 0), i * 2);
  return bytes.toString('base64');
}

export function decodeHalf(encoded: string): Float32Array {
  const bytes = Buffer.from(encoded, 'base64');
  const vector = new Float32Array(bytes.length / 2);
  for (let i = 0; i < vector.length; i++) vector[i] = fromHalf(bytes.readUInt16LE(i * 2));
  return vector;
}

/** pgvector's text form, "[0.1,0.2,...]", for inserting and querying. */
export function toPgVector(vector: ArrayLike<number>): string {
  return `[${Array.from(vector, (v) => (Math.round(v * 1e5) / 1e5).toString()).join(',')}]`;
}
