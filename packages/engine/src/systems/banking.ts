import { type Bank, findBank, findJob, type GameContent } from '../content.ts';
import type { StatementLine } from '../events.ts';
import {
  annuityPayment,
  type Cents,
  principalForPayment,
  splitPayment,
  toCents,
} from '../money.ts';
import type { BankRelation, GameState, Loan } from '../state.ts';
import type { SystemContext } from './context.ts';
import { expectedSalary } from './household.ts';
import { roundRate } from './market-rate.ts';

export type JobTrustLevel = 'mediumLow' | 'medium' | 'high' | 'veryHigh';
const JOB_TRUST_ORDER: readonly JobTrustLevel[] = ['mediumLow', 'medium', 'high', 'veryHigh'];

const MONTHS_PER_YEAR = 12;
const DAYS_PER_YEAR = 365;

/** Trust stays within 0 … 100, kept to a tenth to avoid floating-point drift. */
function clampTrust(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

export function jobTrustLevel(content: GameContent, state: GameState): JobTrustLevel {
  return findJob(content, state.player.jobId).bankTrust;
}

export function initialBankRelations(content: GameContent, jobTrust: JobTrustLevel) {
  const relations: Record<string, BankRelation> = {};
  for (const bank of content.banks) {
    relations[bank.id] = {
      trust: content.credit.trust.startByJob[jobTrust],
      relationshipMonths: 0,
      lastMeetingDay: null,
    };
  }
  return relations;
}

function relationOf(state: GameState, bankId: string): BankRelation {
  const relation = state.banks[bankId];
  if (!relation) throw new RangeError(`No relation with bank ${bankId}`);
  return relation;
}

/** Spread over the 20-year market rate for a duration, interpolated between content points. */
export function durationSpread(content: GameContent, years: number): number {
  const points = Object.entries(content.credit.durationSpreadPercent)
    .map(([key, value]) => [Number(key), value] as const)
    .sort((a, b) => a[0] - b[0]);
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return 0;
  if (years <= first[0]) return first[1];
  if (years >= last[0]) return last[1];
  for (let i = 1; i < points.length; i++) {
    const [x1, y1] = points[i] ?? last;
    const [x0, y0] = points[i - 1] ?? first;
    if (years <= x1) return y0 + ((y1 - y0) * (years - x0)) / (x1 - x0);
  }
  return last[1];
}

/** Detailed rate offered by a bank, so the interface can explain it. */
export interface RateQuote {
  marketPercent: number;
  durationSpreadPercent: number;
  insurancePercent: number;
  bankMarginPercent: number;
  profilePercent: number;
  trustPercent: number;
  ratePercent: number;
}

export function quoteRate(
  content: GameContent,
  state: GameState,
  bank: Bank,
  durationYears: number,
): RateQuote {
  const rules = content.credit;
  const trust = relationOf(state, bank.id).trust;
  const quote = {
    marketPercent: state.market.ratePercent,
    durationSpreadPercent: durationSpread(content, durationYears),
    insurancePercent: rules.insurancePercent,
    bankMarginPercent: bank.marginPercent,
    profilePercent: rules.trust.marginByJobPercent[jobTrustLevel(content, state)],
    // Trust 50 is neutral; 100 removes the full swing, 0 adds it.
    trustPercent: (rules.trust.marginSwingPercent * (50 - trust)) / 50,
  };
  const total =
    quote.marketPercent +
    quote.durationSpreadPercent +
    quote.insurancePercent +
    quote.bankMarginPercent +
    quote.profilePercent +
    quote.trustPercent;
  return { ...quote, ratePercent: roundRate(Math.max(rules.insurancePercent, total)) };
}

/** Rate a borrower could get on the market, without bank margin: used to suggest renegotiation. */
export function marketOffer(content: GameContent, state: GameState, durationYears: number): number {
  return roundRate(
    state.market.ratePercent +
      durationSpread(content, durationYears) +
      content.credit.insurancePercent,
  );
}

/** Monthly income the banks take into account. */
export function retainedIncome(content: GameContent, state: GameState): Cents {
  const monthlyRents = 0; // Rental income arrives with milestone 2.
  return expectedSalary(content, state.player) + content.credit.retainedRentShare * monthlyRents;
}

export function monthlyLoanPayments(state: GameState): Cents {
  return state.loans.reduce((sum, loan) => sum + loan.monthlyPayment, 0);
}

export function debtRatio(content: GameContent, state: GameState, extraPayment: Cents = 0): number {
  const income = retainedIncome(content, state);
  const payments = monthlyLoanPayments(state) + extraPayment;
  if (payments === 0) return 0;
  return income > 0 ? payments / income : Number.POSITIVE_INFINITY;
}

export function isCreditFrozen(state: GameState): boolean {
  return state.player.balance < 0;
}

export interface LoanRequest {
  bankId: string;
  amount: Cents;
  durationYears: number;
  /** Price of the property, before fees. */
  price: Cents;
  works: Cents;
  /** Personal money put into the project. */
  contribution: Cents;
}

export interface LoanOffer {
  bankId: string;
  amount: Cents;
  durationYears: number;
  ratePercent: number;
  rate: RateQuote;
  monthlyPayment: Cents;
  /** Total interest and insurance over the whole loan. */
  totalCost: Cents;
  debtRatioAfter: number;
}

export type LoanRefusalCode =
  | 'unknownBank'
  | 'creditFrozen'
  | 'jobProfile'
  | 'noIncomeHistory'
  | 'lowTrust'
  | 'invalidDuration'
  | 'insufficientContribution'
  | 'overFinancing'
  | 'debtRatio';

export type LoanDecision =
  | { decision: 'accepted'; offer: LoanOffer }
  | { decision: 'partial'; offer: LoanOffer; requestedAmount: Cents }
  | { decision: 'counterOffer'; offer: LoanOffer; requestedDurationYears: number }
  | { decision: 'refused'; reason: LoanRefusalCode; debtRatioAfter?: number };

/** Fees the contribution must cover at least: notary, bank file and guarantee. */
export function requiredContribution(content: GameContent, price: Cents): Cents {
  return Math.round(price * (content.credit.notaryFeesShare + content.credit.bankFeesShare));
}

export function maxDurationYears(content: GameContent, price: Cents, works: Cents): number {
  const rules = content.credit;
  const project = price + works;
  return project > 0 && works >= rules.worksShareForLongerDuration * project
    ? rules.maxDurationWithWorksYears
    : rules.maxDurationYears;
}

function buildOffer(
  content: GameContent,
  state: GameState,
  bank: Bank,
  amount: Cents,
  durationYears: number,
): LoanOffer {
  const rate = quoteRate(content, state, bank, durationYears);
  const months = durationYears * MONTHS_PER_YEAR;
  const monthlyPayment = annuityPayment(amount, rate.ratePercent, months);
  return {
    bankId: bank.id,
    amount,
    durationYears,
    ratePercent: rate.ratePercent,
    rate,
    monthlyPayment,
    totalCost: monthlyPayment * months - amount,
    debtRatioAfter: debtRatio(content, state, monthlyPayment),
  };
}

function debtRatioLimit(content: GameContent, state: GameState, bank: Bank): number {
  const derogation = bank.derogation;
  if (derogation && relationOf(state, bank.id).trust >= derogation.minTrust) {
    return Math.max(content.credit.maxDebtRatio, derogation.maxDebtRatio);
  }
  return content.credit.maxDebtRatio;
}

/** Checks that a bank is willing to lend to the player at all. */
function checkBorrower(content: GameContent, state: GameState, bank: Bank): LoanRefusalCode | null {
  if (isCreditFrozen(state)) return 'creditFrozen';
  const { player } = state;
  if (player.employed) {
    const level = JOB_TRUST_ORDER.indexOf(jobTrustLevel(content, state));
    if (level < JOB_TRUST_ORDER.indexOf(bank.minJobTrust)) return 'jobProfile';
  } else if (player.rentalHistoryMonths < content.credit.minRentalHistoryMonthsWithoutSalary) {
    return 'noIncomeHistory';
  }
  if (relationOf(state, bank.id).trust < bank.minTrust) return 'lowTrust';
  return null;
}

/** Applies the credit rules of docs/03-systemes/02 to a request. Pure: no state change. */
export function evaluateLoan(
  content: GameContent,
  state: GameState,
  request: LoanRequest,
): LoanDecision {
  const rules = content.credit;
  const bank = findBank(content, request.bankId);
  if (!bank) return { decision: 'refused', reason: 'unknownBank' };
  const borrowerRefusal = checkBorrower(content, state, bank);
  if (borrowerRefusal) return { decision: 'refused', reason: borrowerRefusal };

  const maxYears = maxDurationYears(content, request.price, request.works);
  if (
    !Number.isInteger(request.durationYears) ||
    request.durationYears < rules.minDurationYears ||
    request.durationYears > maxYears ||
    !Number.isInteger(request.amount) ||
    request.amount <= 0
  ) {
    return { decision: 'refused', reason: 'invalidDuration' };
  }
  const fees = requiredContribution(content, request.price);
  if (request.contribution < fees) {
    return { decision: 'refused', reason: 'insufficientContribution' };
  }
  if (request.amount > request.price + request.works + fees - request.contribution) {
    return { decision: 'refused', reason: 'overFinancing' };
  }

  const limit = debtRatioLimit(content, state, bank);
  const offer = buildOffer(content, state, bank, request.amount, request.durationYears);
  if (offer.debtRatioAfter <= limit) return { decision: 'accepted', offer };
  if (!bank.counterOffers) {
    return { decision: 'refused', reason: 'debtRatio', debtRatioAfter: offer.debtRatioAfter };
  }

  // Counter-proposal: same amount over a longer duration.
  for (let years = request.durationYears + 1; years <= maxYears; years++) {
    const longer = buildOffer(content, state, bank, request.amount, years);
    if (longer.debtRatioAfter <= limit) {
      return {
        decision: 'counterOffer',
        offer: longer,
        requestedDurationYears: request.durationYears,
      };
    }
  }

  // Partial agreement: the largest amount that fits at the requested duration.
  const room = Math.floor(limit * retainedIncome(content, state)) - monthlyLoanPayments(state);
  const rate = quoteRate(content, state, bank, request.durationYears);
  const amount =
    room > 0
      ? principalForPayment(room, rate.ratePercent, request.durationYears * MONTHS_PER_YEAR)
      : 0;
  if (amount >= rules.partialAgreementMinShare * request.amount) {
    return {
      decision: 'partial',
      offer: buildOffer(content, state, bank, amount, request.durationYears),
      requestedAmount: request.amount,
    };
  }
  return { decision: 'refused', reason: 'debtRatio', debtRatioAfter: offer.debtRatioAfter };
}

/** Creates the loan of an accepted offer and pays its amount into the current account. */
export function grantLoan(ctx: SystemContext, offer: LoanOffer): Loan {
  const { state } = ctx;
  const months = offer.durationYears * MONTHS_PER_YEAR;
  const loan: Loan = {
    id: `loan-${state.nextId++}`,
    bankId: offer.bankId,
    principal: offer.amount,
    ratePercent: offer.ratePercent,
    durationMonths: months,
    monthlyPayment: offer.monthlyPayment,
    remaining: offer.amount,
    paymentsMade: 0,
    startDate: { ...state.clock.date },
    renegotiationSuggested: false,
  };
  state.loans.push(loan);
  state.player.balance += offer.amount;
  return loan;
}

/** Debits every loan's monthly payment; removes the loans fully repaid. */
export function runMonthlyLoanPayments(ctx: SystemContext, lines: StatementLine[]): void {
  const { state } = ctx;
  const stillRunning: Loan[] = [];
  for (const loan of state.loans) {
    const due = Math.min(
      loan.monthlyPayment,
      loan.remaining + splitPayment(loan.remaining, loan.ratePercent, 0).interest,
    );
    const { interest, capital } = splitPayment(loan.remaining, loan.ratePercent, due);
    state.player.balance -= due;
    loan.remaining -= capital;
    loan.paymentsMade += 1;
    lines.push({ kind: 'loanPayment', loanId: loan.id, amount: due, interest, capital });
    if (loan.remaining <= 0 || loan.paymentsMade >= loan.durationMonths) {
      ctx.events.push({ type: 'loanRepaid', loanId: loan.id });
    } else {
      stillRunning.push(loan);
    }
  }
  state.loans = stillRunning;
}

/** Monthly trust changes: relationship age and payments made on time. */
export function runMonthlyTrust(ctx: SystemContext, paidBankIds: ReadonlySet<string>): void {
  const { content, state } = ctx;
  const rules = content.credit.trust;
  for (const bank of content.banks) {
    if (!bank.meetings) continue; // No relationship with a chatbot.
    const relation = relationOf(state, bank.id);
    const related =
      bank.id === content.start.accountBankId ||
      state.loans.some((loan) => loan.bankId === bank.id);
    if (!related && !paidBankIds.has(bank.id)) continue;
    relation.relationshipMonths += 1;
    let change = rules.relationshipMonth;
    if (paidBankIds.has(bank.id) && state.player.balance >= 0) change += rules.onTimePayment;
    relation.trust = clampTrust(relation.trust + change);
  }
}

/** Tells the player once when a loan could be renegotiated, and again after rates rose back. */
export function runRenegotiationCheck(ctx: SystemContext): void {
  const { content, state } = ctx;
  const threshold = content.credit.renegotiation.thresholdPercent;
  for (const loan of state.loans) {
    const offer = marketOffer(content, state, remainingYears(content, loan));
    const worthIt = loan.ratePercent - offer >= threshold;
    if (worthIt && !loan.renegotiationSuggested) {
      loan.renegotiationSuggested = true;
      ctx.events.push({
        type: 'renegotiationAvailable',
        loanId: loan.id,
        currentRatePercent: loan.ratePercent,
        marketOfferPercent: offer,
      });
    } else if (!worthIt) {
      loan.renegotiationSuggested = false;
    }
  }
}

function remainingMonths(loan: Loan): number {
  return loan.durationMonths - loan.paymentsMade;
}

function remainingYears(content: GameContent, loan: Loan): number {
  return Math.max(
    content.credit.minDurationYears,
    Math.ceil(remainingMonths(loan) / MONTHS_PER_YEAR),
  );
}

/** Daily overdraft: interest, trust loss with the account bank, start and end events. */
export function runDailyOverdraft(ctx: SystemContext): void {
  const { content, state } = ctx;
  const { player } = state;
  if (player.balance < 0) {
    const interest = Math.round(
      (-player.balance * content.credit.overdraftAnnualPercent) / 100 / DAYS_PER_YEAR,
    );
    player.balance -= interest;
    player.overdraftInterestThisMonth += interest;
    player.overdraftDays += 1;
    if (player.overdraftDays === 1) {
      ctx.events.push({ type: 'overdraftStarted', balance: player.balance });
    }
    const relation = relationOf(state, content.start.accountBankId);
    relation.trust = clampTrust(relation.trust + content.credit.trust.overdraftDay);
  } else if (player.overdraftDays > 0) {
    player.overdraftDays = 0;
    ctx.events.push({ type: 'overdraftEnded' });
  }
}

export type BankActionRefusal =
  | 'bank.unknown'
  | 'bank.noMeetings'
  | 'bank.meetingTooSoon'
  | 'time.notEnoughFreeTime'
  | 'loan.unknown'
  | 'loan.notWorthRefinancing'
  | 'loan.refinancingRefused'
  | 'account.insufficientFunds';

/** A meeting with a banker: costs free time, builds trust. */
export function holdMeeting(ctx: SystemContext, bankId: string): BankActionRefusal | null {
  const { content, state } = ctx;
  const bank = findBank(content, bankId);
  if (!bank) return 'bank.unknown';
  if (!bank.meetings) return 'bank.noMeetings';
  const rules = content.credit.trust;
  const relation = relationOf(state, bank.id);
  if (
    relation.lastMeetingDay !== null &&
    ctx.today - relation.lastMeetingDay < rules.meetingCooldownDays
  ) {
    return 'bank.meetingTooSoon';
  }
  if (state.player.freeTimeMinutes < rules.meetingMinutes) return 'time.notEnoughFreeTime';
  state.player.freeTimeMinutes -= rules.meetingMinutes;
  relation.lastMeetingDay = ctx.today;
  relation.trust = clampTrust(relation.trust + rules.meeting);
  ctx.events.push({ type: 'bankMeetingHeld', bankId: bank.id, trust: relation.trust });
  return null;
}

/** Fees of a renegotiation or buy-back: share of the remaining capital plus a fixed amount. */
export function refinancingFees(content: GameContent, loan: Loan): Cents {
  const rules = content.credit.renegotiation;
  return Math.round(loan.remaining * rules.feesShareOfRemaining) + toCents(rules.fixedFees);
}

/** Replaces a loan by a new one at the bank's current rate, over the remaining months. */
export function refinanceLoan(
  ctx: SystemContext,
  loanId: string,
  bankId: string,
): BankActionRefusal | null {
  const { content, state } = ctx;
  const loan = state.loans.find((candidate) => candidate.id === loanId);
  if (!loan) return 'loan.unknown';
  const bank = findBank(content, bankId);
  if (!bank) return 'bank.unknown';

  // The bank checks the borrower as for a new loan; the payment can only go down.
  if (checkBorrower(content, state, bank)) return 'loan.refinancingRefused';
  const months = remainingMonths(loan);
  const rate = quoteRate(content, state, bank, remainingYears(content, loan)).ratePercent;
  if (rate >= loan.ratePercent) return 'loan.notWorthRefinancing';
  const fees = refinancingFees(content, loan);
  if (state.player.balance < fees) return 'account.insufficientFunds';

  state.player.balance -= fees;
  const replacement: Loan = {
    id: `loan-${state.nextId++}`,
    bankId,
    principal: loan.remaining,
    ratePercent: rate,
    durationMonths: months,
    monthlyPayment: annuityPayment(loan.remaining, rate, months),
    remaining: loan.remaining,
    paymentsMade: 0,
    startDate: { ...state.clock.date },
    renegotiationSuggested: false,
  };
  state.loans = state.loans.map((other) => (other.id === loan.id ? replacement : other));
  ctx.events.push({ type: 'loanRefinanced', oldLoanId: loan.id, newLoanId: replacement.id, fees });
  return null;
}
