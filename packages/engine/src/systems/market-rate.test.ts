import { describe, expect, it } from 'vitest';
import { content, engine, newGame } from '../../test/helpers.ts';

describe('market rate', () => {
  it('moves slowly, stays within bounds and is reproducible', () => {
    const run = (seed: number) => {
      const rates: number[] = [];
      for (const event of engine.advanceHours(newGame({ seed }), 30 * 365 * 24).events) {
        if (event.type === 'marketRateChanged') rates.push(event.ratePercent);
      }
      return rates;
    };
    const rates = run(3);
    expect(rates.length).toBeGreaterThan(355);
    const { minPercent, maxPercent } = content.marketRate;
    expect(rates.every((r) => r >= minPercent && r <= maxPercent)).toBe(true);
    for (let i = 1; i < rates.length; i++) {
      expect(Math.abs((rates[i] ?? 0) - (rates[i - 1] ?? 0))).toBeLessThan(0.5);
    }
    expect(Math.max(...rates) - Math.min(...rates)).toBeGreaterThan(0.5);
    expect(run(3)).toEqual(rates);
  }, 60_000);
});
