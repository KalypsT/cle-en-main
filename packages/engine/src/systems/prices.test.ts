import { describe, expect, it } from 'vitest';
import { content, newGame, systemContext } from '../../test/helpers.ts';
import { initialCityMarkets, runMonthlyPrices } from './prices.ts';

describe('property prices', () => {
  it('brings the data date prices to the start date with the observed trend', () => {
    const city = content.cities.dole;
    if (!city) throw new Error('No Dole');
    const atDataDate = initialCityMarkets(content, { year: 2026, month: 6, day: 30 });
    for (const market of Object.values(atDataDate.dole ?? {}))
      expect(market.priceIndex).toBeCloseTo(1, 2);
    const later = initialCityMarkets(content, { year: 2027, month: 6, day: 30 });
    for (const n of city.neighbourhoods) {
      expect(later.dole?.[n.id]?.priceIndex).toBeCloseTo(1 + n.trendPercentPerYear / 100, 2);
    }
  });

  it('reacts to a rate rise with a delay, deterministically', () => {
    const calm = systemContext(newGame());
    const shocked = systemContext(newGame());
    shocked.state.market.ratePercent += 2;
    for (let month = 0; month < 12; month++) {
      runMonthlyPrices(calm);
      runMonthlyPrices(shocked);
    }
    for (const id of Object.keys(calm.state.market.cities.dole ?? {})) {
      const a = calm.state.market.cities.dole?.[id]?.priceIndex ?? 0;
      const b = shocked.state.market.cities.dole?.[id]?.priceIndex ?? 0;
      expect(b).toBeLessThan(a);
    }
    const again = systemContext(newGame());
    for (let month = 0; month < 12; month++) runMonthlyPrices(again);
    expect(again.state.market.cities).toEqual(calm.state.market.cities);
  });

  it('stays within bounds over a long time', () => {
    const ctx = systemContext(newGame({ seed: 5 }));
    for (let month = 0; month < 600; month++) runMonthlyPrices(ctx);
    const { minIndex, maxIndex } = content.market.prices;
    for (const market of Object.values(ctx.state.market.cities.dole ?? {})) {
      expect(market.priceIndex).toBeGreaterThanOrEqual(minIndex);
      expect(market.priceIndex).toBeLessThanOrEqual(maxIndex);
    }
  });
});
