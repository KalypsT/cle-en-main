import { toDayNumber } from '../calendar.ts';
import type { CrisisModifier } from '../content.ts';
import type { GameState } from '../state.ts';
import type { SystemContext } from './context.ts';
import { monthsToDays } from './renting.ts';

/**
 * Lasting national crises (docs/03-systemes/07, milestone 8): a catalogue event sets a factor
 * on unpaid rents, the artisans' prices, the candidates, the buyers or the banks' limits, for
 * some months. Several crises of the same kind multiply.
 */
export function crisisFactor(state: GameState, modifier: CrisisModifier): number {
  const today = toDayNumber(state.clock.date);
  let factor = 1;
  for (const crisis of state.market.crises) {
    if (crisis.modifier === modifier && today < crisis.untilDay) factor *= crisis.factor;
  }
  return factor;
}

export function startCrisis(
  ctx: SystemContext,
  modifier: CrisisModifier,
  factor: number,
  months: number,
): void {
  ctx.state.market.crises.push({ modifier, factor, untilDay: ctx.today + monthsToDays(months) });
}

/** Monthly: the crises that are over are forgotten. */
export function expireCrises(ctx: SystemContext): void {
  ctx.state.market.crises = ctx.state.market.crises.filter((c) => ctx.today < c.untilDay);
}
