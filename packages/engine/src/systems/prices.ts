import { type CalendarDate, parseIsoDate, toDayNumber } from '../calendar.ts';
import type { GameContent } from '../content.ts';
import { nextNormal } from '../random.ts';
import type { MarketState } from '../state.ts';
import type { SystemContext } from './context.ts';

const MONTHS_PER_YEAR = 12;
const DAYS_PER_YEAR = 365.25;

/** Long-run trend a neighbourhood drifts back to: blend of its data trend and a national norm. */
function longRunTrend(content: GameContent, dataTrend: number): number {
  const rules = content.market.prices;
  return (
    rules.dataTrendWeight * dataTrend + (1 - rules.dataTrendWeight) * rules.longRunTrendPercent
  );
}

/**
 * Price levels at game start: the city files describe the market at their
 * data date, brought forward (or back) to the start date with the observed trend.
 */
export function initialCityMarkets(
  content: GameContent,
  startDate: CalendarDate,
): MarketState['cities'] {
  const cities: MarketState['cities'] = {};
  for (const [cityId, city] of Object.entries(content.cities)) {
    const dataDate = parseIsoDate(city.dataDate);
    const years = dataDate ? (toDayNumber(startDate) - toDayNumber(dataDate)) / DAYS_PER_YEAR : 0;
    cities[cityId] = Object.fromEntries(
      city.neighbourhoods.map((n) => [
        n.id,
        {
          priceIndex: (1 + n.trendPercentPerYear / 100) ** years,
          trendPercent: n.trendPercentPerYear,
        },
      ]),
    );
  }
  return cities;
}

/**
 * Monthly evolution of every neighbourhood: a drifting trend, noise, and a
 * delayed reaction to the market rate (prices fall when rates have risen).
 */
export function runMonthlyPrices(ctx: SystemContext): void {
  const { content, state } = ctx;
  const rules = content.market.prices;
  const { market } = state;
  const previousLag = market.laggedRatePercent;
  market.laggedRatePercent += rules.rateLagShare * (market.ratePercent - market.laggedRatePercent);
  const rateChange = market.laggedRatePercent - previousLag;
  for (const [cityId, neighbourhoods] of Object.entries(market.cities)) {
    const city = content.cities[cityId];
    if (!city) continue;
    for (const n of city.neighbourhoods) {
      const current = neighbourhoods[n.id];
      if (!current) continue;
      current.trendPercent +=
        rules.trendReversion *
          (longRunTrend(content, n.trendPercentPerYear) - current.trendPercent) +
        rules.trendVolatilityPercent * nextNormal(state.rng);
      const change =
        current.trendPercent / 100 / MONTHS_PER_YEAR +
        (rules.monthlyNoisePercent / 100) * nextNormal(state.rng) -
        rules.rateSensitivity * rateChange;
      current.priceIndex = Math.min(
        rules.maxIndex,
        Math.max(rules.minIndex, current.priceIndex * (1 + change)),
      );
    }
  }
  ctx.events.push({ type: 'propertyPricesUpdated' });
}
