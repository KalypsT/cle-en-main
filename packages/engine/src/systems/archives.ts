import { deepClone } from '../clone.ts';
import type { GameEvent } from '../events.ts';
import type { Cents } from '../money.ts';
import type { GameState, Loan, OwnedProperty } from '../state.ts';
import { interestPaidOf, refinancingFees } from './banking.ts';
import type { SystemContext } from './context.ts';
import { eventSubject, loanAnswerOf, subjectOf } from './inbox.ts';

/**
 * Keeps a loan that comes to an end (« Crédits soldés »). Called before the loan
 * leaves the state, with the early repayment fees it costs.
 */
export function archiveLoan(
  ctx: SystemContext,
  loan: Loan,
  reason: 'repaid' | 'sold' | 'refinanced' | 'freshStart',
  replacedBy: string | null = null,
): void {
  const { state } = ctx;
  const owned = state.properties.find((o) => o.property.id === loan.propertyId);
  state.closedLoans.push({
    id: loan.id,
    bankId: loan.bankId,
    propertyId: loan.propertyId,
    subject: owned ? subjectOf(owned.property, null) : null,
    principal: loan.principal,
    ratePercent: loan.ratePercent,
    durationMonths: loan.durationMonths,
    monthlyPayment: loan.monthlyPayment,
    startDate: { ...loan.startDate },
    closedDay: ctx.today,
    paymentsMade: loan.paymentsMade,
    interestPaid: interestPaidOf(loan),
    remaining: Math.max(0, loan.remaining),
    fees: reason === 'sold' || reason === 'refinanced' ? refinancingFees(ctx.content, loan) : 0,
    reason,
    replacedBy,
  });
}

/** What a sale brought: the figures of `propertySold` or `forcedSale`. */
export interface SaleFigures {
  price: Cents;
  agencyFees: Cents;
  loanRepaid: Cents;
  loanFees: Cents;
  capitalGainsTax: Cents;
  depositTransferred: Cents;
  net: Cents;
}

/** Keeps a property sold, with its history and its value curve (« Biens vendus »). */
export function archiveSale(
  ctx: SystemContext,
  owned: OwnedProperty,
  sale: SaleFigures,
  forced: boolean,
): void {
  ctx.state.soldProperties.push({
    // A copy: a rival buying it may go on changing its own.
    property: deepClone(owned.property),
    holder: owned.holder,
    purchasePrice: owned.purchasePrice,
    acquisitionCost: owned.acquisitionCost,
    purchaseDate: { ...owned.purchaseDate },
    soldDay: ctx.today,
    forced,
    ...sale,
    gain: sale.price - sale.agencyFees - owned.acquisitionCost - owned.worksForCapitalGains,
    rentsReceived: owned.rentsReceived,
    valueHistory: owned.valueHistory,
    log: owned.log,
  });
}

/**
 * Keeps the meetings and the answers of each bank (docs/04, « Banque »). `before`
 * is the state before the events, where a cancelled purchase is still found.
 */
export function recordBankHistory(
  state: GameState,
  before: GameState,
  events: readonly GameEvent[],
  today: number,
): void {
  for (const event of events) {
    if (event.type === 'bankMeetingHeld') {
      state.banks[event.bankId]?.log.push({ kind: 'meeting', day: today, trust: event.trust });
    } else if (event.type === 'loanAnswered') {
      const { kind: _kind, bankId, ...answer } = loanAnswerOf(event, state, before);
      void _kind;
      state.banks[bankId]?.log.push({
        kind: 'answer',
        day: today,
        subject: eventSubject(state, before, event),
        ...answer,
      });
    }
  }
}

/** The banker's trust on the 1st of the month, for its curve. */
export function recordBankTrust(state: GameState): void {
  for (const relation of Object.values(state.banks)) {
    relation.trustHistory.push({ date: { ...state.clock.date }, trust: relation.trust });
  }
}
