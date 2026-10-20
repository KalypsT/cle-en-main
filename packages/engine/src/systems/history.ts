import type { GameContent } from '../content.ts';
import type { StatementLine } from '../events.ts';
import type { Cents } from '../money.ts';
import type { GameState, MonthlyPoint } from '../state.ts';
import { netWorth } from './net-worth.ts';
import { estimateValue } from './valuation.ts';

const INCOME_KINDS: ReadonlySet<StatementLine['kind']> = new Set([
  'salary',
  'rentalIncome',
  'taxRefund',
]);

/** Signed amount of a statement line: positive for money in. */
export function signedLine(line: StatementLine): Cents {
  return INCOME_KINDS.has(line.kind) ? line.amount : -line.amount;
}

/** Net flow of a monthly statement. */
export function statementNet(lines: readonly StatementLine[]): Cents {
  return lines.reduce((sum, line) => sum + signedLine(line), 0);
}

/** A point of the wealth curve, taken now. */
export function monthlyPoint(
  content: GameContent,
  state: GameState,
  cashFlow: Cents,
): MonthlyPoint {
  return {
    date: { ...state.clock.date },
    netWorth: netWorth(content, state),
    balance: state.player.balance,
    debt: state.loans.reduce((sum, loan) => sum + loan.remaining, 0),
    cashFlow,
    monthlyRent: currentMonthlyRent(state),
    reputation: state.player.reputation,
  };
}

/** Rents of the current leases, charges excluded. */
export function currentMonthlyRent(state: GameState): Cents {
  return state.properties.reduce((sum, owned) => sum + (owned.lease?.monthlyRent ?? 0), 0);
}

/** A point of each property's value curve: its estimate today, as the player sees it, and its debt. */
export function recordPropertyValues(content: GameContent, state: GameState): void {
  for (const owned of state.properties) {
    owned.valueHistory.push({
      date: { ...state.clock.date },
      value: estimateValue(content, state, owned.property, true).estimate,
      debt: propertyDebt(state, owned.property.id),
    });
  }
}

/** What the loans of a property still owe. */
export function propertyDebt(state: GameState, propertyId: string): Cents {
  return state.loans
    .filter((loan) => loan.propertyId === propertyId)
    .reduce((sum, loan) => sum + loan.remaining, 0);
}
