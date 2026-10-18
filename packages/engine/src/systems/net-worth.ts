import type { GameContent } from '../content.ts';
import type { Cents } from '../money.ts';
import type { GameState } from '../state.ts';
import { depositsHeld } from './renting.ts';
import { taxDue } from './taxes.ts';
import { realValue } from './valuation.ts';

/**
 * Cash, deposits, works envelopes and properties at their real value, minus debts: loans,
 * tenants' security deposits, and last year's tax still to pay.
 */
export function netWorth(content: GameContent, state: GameState): Cents {
  const properties = state.properties.reduce(
    (sum, owned) => sum + realValue(content, state, owned.property).value,
    0,
  );
  const deposits = state.purchases.reduce((sum, purchase) => sum + purchase.deposit, 0);
  const worksFunds = state.properties.reduce(
    (sum, owned) => sum + (owned.worksFund?.amount ?? 0),
    0,
  );
  const debts = state.loans.reduce((sum, loan) => sum + loan.remaining, 0);
  return (
    state.player.balance +
    deposits +
    worksFunds +
    properties -
    debts -
    depositsHeld(state) -
    taxDue(state)
  );
}
