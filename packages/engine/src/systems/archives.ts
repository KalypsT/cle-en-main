import { deepClone } from '../clone.ts';
import type { GameEvent } from '../events.ts';
import type { Cents } from '../money.ts';
import type { GameState, Loan, OwnedProperty, PropertyLogEntry } from '../state.ts';
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
  /** Early repayment fees, when the player repaid it himself. */
  prepaymentFees = 0,
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
    fees:
      reason === 'sold' || reason === 'refinanced'
        ? refinancingFees(ctx.content, loan)
        : prepaymentFees,
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

/** Keeps the statement of the month just closed (the last ones only). */
export function keepStatement(ctx: SystemContext): void {
  const { state } = ctx;
  if (!state.lastStatement) return;
  const kept = state.reviews.statements;
  kept.push(deepClone(state.lastStatement));
  const excess = kept.length - ctx.content.rhythm.statementsKept;
  if (excess > 0) kept.splice(0, excess);
}

/** Keeps the yearly review just built, with the tax assessed for that year. */
export function keepYearReview(state: GameState): void {
  const review = state.lastYearReview;
  if (!review) return;
  const assessment = state.tax.lastAssessment;
  state.reviews.years.push({
    review: deepClone(review),
    assessment: assessment?.year === review.year ? deepClone(assessment) : null,
  });
}

/** The line an event adds to its property's history, if any. */
function logEntry(event: GameEvent, day: number): PropertyLogEntry | null {
  switch (event.type) {
    case 'deedSigned':
      return { kind: 'bought', day, price: event.price };
    case 'saleListed':
      return { kind: 'listedForSale', day, askingPrice: event.askingPrice, mode: event.mode };
    case 'saleWithdrawn':
      return { kind: 'saleWithdrawn', day };
    case 'saleAgreed':
      return { kind: 'saleAgreed', day, price: event.price };
    case 'saleFellThrough':
      return { kind: 'saleFellThrough', day };
    case 'rentalListed':
      return {
        kind: 'listedForRent',
        day,
        leaseType: event.leaseType,
        monthlyRent: event.monthlyRent,
        agencyId: event.agencyId,
        insured: event.insured,
      };
    case 'rentalWithdrawn':
      return { kind: 'rentalWithdrawn', day };
    case 'furnitureBought':
      return { kind: 'furniture', day, cost: event.cost };
    case 'tenantGaveNotice':
      return { kind: 'notice', day, leaveDay: event.leaveDay, reason: event.reason };
    case 'buyoutAnswered':
      return { kind: 'buyout', day, amount: event.amount, accepted: event.accepted };
    case 'rentMissed':
      return { kind: 'rentMissed', day, amount: event.amount, insured: event.insured };
    case 'reminderSent':
      return { kind: 'reminder', day, settled: event.settled };
    case 'procedureStarted':
      return { kind: 'procedure', day, evictionDay: event.evictionDay, cost: event.cost };
    case 'rentRevised':
    case 'rentAdjusted':
      return { kind: 'rentRevised', day, monthlyRent: event.monthlyRent };
    case 'leaseRenewed':
      return { kind: 'leaseRenewed', day, termDay: event.termDay };
    case 'dpeWarning':
      return { kind: 'dpeWarning', day, banDay: event.banDay };
    case 'worksCompleted':
      return {
        kind: 'worksCompleted',
        day,
        cost: event.cost,
        dpeBefore: event.dpeBefore,
        dpeAfter: event.dpeAfter,
      };
    case 'coproMeetingHeld':
      return { kind: 'copro', day, results: event.results.map((result) => ({ ...result })) };
    case 'transformationCompleted':
      return { kind: 'transformation', day, transformation: event.kind, cost: event.cost };
    case 'movedIntoHome':
      return { kind: 'home', day, movedIn: true };
    case 'movedOutOfHome':
      return { kind: 'home', day, movedIn: false };
    default:
      return null;
  }
}

/**
 * Adds to each property's history what its events tell (docs/04, « Historique d'un
 * bien »): purchase, letting, sale, lease life, co-ownership. A property gone by then
 * (sold the same day) keeps the history it had.
 */
export function recordPropertyLog(
  state: GameState,
  events: readonly GameEvent[],
  today: number,
): void {
  for (const event of events) {
    const entry = logEntry(event, today);
    if (!entry || !('propertyId' in event)) continue;
    // A transformation is told on each flat it produced.
    const ids = event.type === 'transformationCompleted' ? event.propertyIds : [event.propertyId];
    for (const id of ids) {
      state.properties.find((owned) => owned.property.id === id)?.log.push({ ...entry });
    }
  }
}

/** The market on the 1st of the month: its rate and each neighbourhood's price level. */
export function recordMarketPoint(state: GameState): void {
  const priceIndex: Record<string, Record<string, number>> = {};
  for (const [cityId, neighbourhoods] of Object.entries(state.market.cities)) {
    const levels: Record<string, number> = {};
    for (const [id, market] of Object.entries(neighbourhoods)) {
      // Four decimals are enough for a curve, and keep the save small.
      levels[id] = Math.round(market.priceIndex * 10_000) / 10_000;
    }
    priceIndex[cityId] = levels;
  }
  state.marketHistory.push({
    date: { ...state.clock.date },
    ratePercent: state.market.ratePercent,
    priceIndex,
  });
}

/**
 * How a neighbourhood's price level moved since the monthly point `months` ago (or the
 * oldest kept, if the curve is shorter): the change, and over how many months; null
 * without any point before this month.
 */
export function priceChange(
  state: GameState,
  cityId: string,
  neighbourhoodId: string,
  months: number,
): { change: number; months: number } | null {
  const now = state.market.cities[cityId]?.[neighbourhoodId]?.priceIndex;
  const points = state.marketHistory;
  const back = Math.min(months, points.length - 1);
  const then = points[points.length - 1 - back]?.priceIndex[cityId]?.[neighbourhoodId];
  if (back < 1 || now === undefined || then === undefined) return null;
  return { change: now / then - 1, months: back };
}
