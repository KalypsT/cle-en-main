import { nextNormal } from '../random.ts';
import type { SystemContext } from './context.ts';

/** Monthly evolution of the national rate: a slow cycle, mean reversion and noise. */
export function runMonthlyMarketRate(ctx: SystemContext): void {
  const rules = ctx.content.marketRate;
  const { market, rng } = ctx.state;
  market.cyclePhase = (market.cyclePhase + 1 / rules.cycleMonths) % 1;
  const target =
    rules.longTermMeanPercent +
    rules.cycleAmplitudePercent * Math.sin(2 * Math.PI * market.cyclePhase);
  const next =
    market.ratePercent +
    rules.monthlyReversion * (target - market.ratePercent) +
    rules.monthlyVolatilityPercent * nextNormal(rng);
  market.ratePercent = roundRate(Math.min(rules.maxPercent, Math.max(rules.minPercent, next)));
  ctx.events.push({ type: 'marketRateChanged', ratePercent: market.ratePercent });
}

/** Rates are kept to a hundredth of a point, as banks quote them. */
export function roundRate(percent: number): number {
  return Math.round(percent * 100) / 100;
}
