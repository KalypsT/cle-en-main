/**
 * Seeded pseudo-random number generator: xoshiro128** seeded via splitmix32.
 *
 * The generator state is a plain tuple of four uint32 values so that it can be
 * stored in the game state and serialized as JSON. Drawing functions mutate the
 * tuple they receive: callers must work on a copy when they need immutability.
 */

export type RngState = [number, number, number, number];

const UINT32_RANGE = 0x1_0000_0000;

function splitmix32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
    return (z ^ (z >>> 15)) >>> 0;
  };
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/** Builds a generator state from a uint32 seed. */
export function seedRng(seed: number): RngState {
  const next = splitmix32(seed);
  const state: RngState = [next(), next(), next(), next()];
  // xoshiro must never be in the all-zero state.
  if (state.every((v) => v === 0)) state[0] = 1;
  return state;
}

/** Returns the next uint32 and advances the state in place. */
export function nextUint32(state: RngState): number {
  const [s0, s1, s2, s3] = state;
  const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
  const t = (s1 << 9) >>> 0;
  const n2 = (s2 ^ s0) >>> 0;
  const n3 = (s3 ^ s1) >>> 0;
  state[1] = (s1 ^ n2) >>> 0;
  state[0] = (s0 ^ n3) >>> 0;
  state[2] = (n2 ^ t) >>> 0;
  state[3] = rotl(n3, 11);
  return result;
}

/** Returns a float in [0, 1). */
export function nextFloat(state: RngState): number {
  return nextUint32(state) / UINT32_RANGE;
}

/** Returns an integer in [min, max] (both inclusive), without modulo bias. */
export function nextInt(state: RngState, min: number, max: number): number {
  if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
    throw new RangeError(`Invalid integer range [${min}, ${max}]`);
  }
  const range = max - min + 1;
  if (range > UINT32_RANGE) throw new RangeError('Integer range too large');
  const limit = UINT32_RANGE - (UINT32_RANGE % range);
  let value = nextUint32(state);
  while (value >= limit) value = nextUint32(state);
  return min + (value % range);
}
