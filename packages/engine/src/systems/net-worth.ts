import type { GameContent } from '../content.ts';
import type { Cents } from '../money.ts';
import type { GameState } from '../state.ts';
import { realValue } from './valuation.ts';

/** Cash, deposits and properties at their real value, minus debts. */
export function netWorth(content: GameContent, state: GameState): Cents {
  const properties = state.properties.reduce(
    (sum, owned) => sum + realValue(content, state, owned.property).value,
    0,
  );
  const deposits = state.purchases.reduce((sum, purchase) => sum + purchase.deposit, 0);
  const debts = state.loans.reduce((sum, loan) => sum + loan.remaining, 0);
  return state.player.balance + deposits + properties - debts;
}
