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

/** Returns a standard normal draw (Box–Muller). */
export function nextNormal(state: RngState): number {
  const u1 = 1 - nextFloat(state); // (0, 1]: avoids log(0)
  const u2 = nextFloat(state);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

/** Returns a float in [min, max). */
export function nextRange(state: RngState, min: number, max: number): number {
  return min + (max - min) * nextFloat(state);
}

/** Picks a key with probability proportional to its weight (weights ≥ 0, at least one > 0). */
export function pickWeighted<K extends string>(
  state: RngState,
  weights: Readonly<Partial<Record<K, number>>>,
): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
  if (!(total > 0)) throw new RangeError('No positive weight to pick from');
  let draw = nextFloat(state) * total;
  for (const [key, weight] of entries) {
    draw -= Math.max(0, weight);
    if (draw < 0) return key;
  }
  // Floating-point remainder: the last positive entry.
  const last = entries.filter(([, weight]) => weight > 0).at(-1);
  return (last ?? entries[0] ?? ['' as K])[0];
}

/** Number of events of a Poisson process with mean `lambda` (Knuth's method, small lambdas). */
export function nextPoisson(state: RngState, lambda: number): number {
  if (!(lambda > 0)) return 0;
  const limit = Math.exp(-lambda);
  let count = 0;
  let product = nextFloat(state);
  while (product > limit) {
    count++;
    product *= nextFloat(state);
  }
  return count;
}

/**
 * Stateless float in [0, 1) derived from a seed and a key (FNV-1a, then a
 * splitmix32 finalizer). Gives a stable draw per (seed, key) without storing
 * it or advancing the generator: a rival's opinion of a given listing.
 */
export function hashFloat(seed: number, key: string): number {
  let hash = (0x811c9dc5 ^ seed) >>> 0;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  let z = (hash + 0x9e3779b9) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x21f0aaad);
  z = Math.imul(z ^ (z >>> 15), 0x735a2d97);
  return ((z ^ (z >>> 15)) >>> 0) / UINT32_RANGE;
}

/** Stateless standard normal draw for a (seed, key) pair (Box–Muller on two hashes). */
export function hashNormal(seed: number, key: string): number {
  const u1 = 1 - hashFloat(seed, `${key}#1`);
  const u2 = hashFloat(seed, `${key}#2`);
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}
