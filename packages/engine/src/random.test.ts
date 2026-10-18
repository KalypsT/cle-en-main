import { describe, expect, it } from 'vitest';
import { nextFloat, nextInt, nextUint32, type RngState, seedRng } from './random.ts';

function draw(state: RngState, count: number): number[] {
  return Array.from({ length: count }, () => nextUint32(state));
}

describe('xoshiro128**', () => {
  it('matches the reference implementation for state [1, 2, 3, 4]', () => {
    expect(draw([1, 2, 3, 4], 6)).toEqual([11520, 0, 5927040, 70819200, 2031721883, 1637235492]);
  });

  it('produces the same sequence for the same seed', () => {
    expect(draw(seedRng(42), 100)).toEqual(draw(seedRng(42), 100));
  });

  it('produces different sequences for different seeds', () => {
    expect(draw(seedRng(1), 10)).not.toEqual(draw(seedRng(2), 10));
  });

  it('resumes identically after a JSON round trip of its state', () => {
    const original = seedRng(2026);
    draw(original, 37);
    const restored = JSON.parse(JSON.stringify(original)) as RngState;
    expect(draw(restored, 50)).toEqual(draw(original, 50));
  });

  it('only yields uint32 values and floats in [0, 1)', () => {
    const state = seedRng(7);
    for (let i = 0; i < 10_000; i++) {
      const value = nextUint32(state);
      expect(Number.isInteger(value) && value >= 0 && value <= 0xffffffff).toBe(true);
      const float = nextFloat(state);
      expect(float >= 0 && float < 1).toBe(true);
    }
  });

  it('draws integers within inclusive bounds, covering every value', () => {
    const state = seedRng(99);
    const seen = new Set<number>();
    for (let i = 0; i < 1_000; i++) {
      const value = nextInt(state, 1, 6);
      expect(value >= 1 && value <= 6).toBe(true);
      seen.add(value);
    }
    expect(seen.size).toBe(6);
  });

  it('rejects invalid ranges', () => {
    expect(() => nextInt(seedRng(1), 5, 4)).toThrow(RangeError);
    expect(() => nextInt(seedRng(1), 0.5, 4)).toThrow(RangeError);
  });

  it('never starts from the all-zero state', () => {
    for (let seed = 0; seed < 1_000; seed++) {
      expect(seedRng(seed).some((v) => v !== 0)).toBe(true);
    }
  });
});
