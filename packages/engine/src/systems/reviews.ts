import { type CalendarDate, fromDayNumber, toDayNumber } from '../calendar.ts';
import { findJob, type GameContent } from '../content.ts';
import type { StatementLine } from '../events.ts';
import { type Cents, toCents } from '../money.ts';
import type { Advice, AgendaItem, GameState, MonthlyPoint, YearReview } from '../state.ts';
import { debtRatio, marketOffer, monthlyLoanPayments } from './banking.ts';
import { challengeProgress, findChallenge } from './challenges.ts';
import type { SystemContext } from './context.ts';
import { signedLine } from './history.ts';
import { type DayKind, dayKind, schoolHoliday } from './holidays.ts';
import { dailyFreeTime } from './household.ts';
import { modeOf, rewindsLeft } from './modes.ts';
import { conditionsMet, currentTitleId, statValue } from './progress.ts';
import { letBanDay } from './renting.ts';
import { offMarketChancePerMonth, progressMarginPercent } from './reputation.ts';
import { estimateRegimes } from './taxes.ts';
import { pendingDecisions } from './ui-queries.ts';

const HOURS_PER_DAY = 24;
const DAYS_PER_YEAR = 365;
const MONTHS_PER_YEAR = 12;

/**
 * Is nothing urgent waiting for the player? Then the automatic acceleration
 * may run (docs/02, 2.3): no decision due within `urgentDays`, no action
 * planned within a few hours. New decisions slow it down in the session.
 */
export function pace(content: GameContent, state: GameState): { calm: boolean } {
  if (state.gameOver) return { calm: false };
  const rules = content.rhythm.autoSpeed;
  const ignored = new Set<string>(rules.ignoredDecisions);
  const today = toDayNumber(state.clock.date);
  const urgent = pendingDecisions(content, state).some(
    (decision) =>
      !ignored.has(decision.kind) &&
      decision.deadlineDay !== null &&
      decision.deadlineDay - today <= rules.urgentDays,
  );
  if (urgent) return { calm: false };
  const soon = state.agenda.some(
    (item) => (item.day - today) * HOURS_PER_DAY - state.clock.hour <= rules.agendaHorizonHours,
  );
  return { calm: !soon };
}

export type ReviewGroup = 'income' | 'home' | 'loans' | 'properties' | 'taxes' | 'bank';

const GROUP_OF: Record<StatementLine['kind'], ReviewGroup> = {
  salary: 'income',
  rentalIncome: 'income',
  taxRefund: 'income',
  rent: 'home',
  livingCosts: 'home',
  loanPayment: 'loans',
  propertyCharges: 'properties',
  ownerInsurance: 'properties',
  managementFees: 'properties',
  legalCosts: 'properties',
  coproCall: 'properties',
  taxInstalment: 'taxes',
  overdraftInterest: 'bank',
};

/** The short monthly review (docs/02, section 2.2), from the last statement and the curve. */
export function monthlyReview(content: GameContent, state: GameState) {
  const statement = state.lastStatement;
  if (!statement) return null;
  const groups = new Map<ReviewGroup, Cents>();
  for (const line of statement.lines) {
    const group = GROUP_OF[line.kind];
    groups.set(group, (groups.get(group) ?? 0) + signedLine(line));
  }
  const net = [...groups.values()].reduce((sum, amount) => sum + amount, 0);
  const points = state.history;
  const now = points.at(-1);
  const before = points.at(-2) ?? points[0];
  const since = before ? toDayNumber(before.date) : 0;
  const statementDay = toDayNumber(statement.date);
  return {
    date: statement.date,
    groups: [...groups].map(([group, amount]) => ({ group, amount })),
    net,
    balance: statement.balance,
    netWorth: now?.netWorth ?? 0,
    netWorthChange: now && before ? now.netWorth - before.netWorth : 0,
    reputation: state.player.reputation,
    reputationChange: now && before ? now.reputation - before.reputation : 0,
    monthlyRent: now?.monthlyRent ?? 0,
    titles: state.progress.titles
      .filter((t) => t.day > since && t.day <= statementDay)
      .map((t) => t.id),
    achievements: state.progress.achievements
      .filter((a) => a.day > since && a.day <= statementDay)
      .map((a) => a.id),
    challenge: challengeView(content, state),
    positiveStreak: state.progress.counters.positiveStreak ?? 0,
  };
}

export type MonthlyReview = NonNullable<ReturnType<typeof monthlyReview>>;

/** Regime advice from last year's books, before they are closed. */
export function regimeAdvice(ctx: SystemContext): Advice[] {
  const { content, state } = ctx;
  const threshold = toCents(content.yvon.thresholds.regimeSavingEuros);
  const estimate = estimateRegimes(content, state, ctx.today);
  const advice: Advice[] = [];
  for (const property of estimate.properties) {
    const owned = state.properties.find((o) => o.property.id === property.propertyId);
    if (!owned || owned.taxRegime === 'auto') continue;
    const chosen = owned.taxRegime === 'micro' ? property.micro : property.real;
    const other = owned.taxRegime === 'micro' ? property.real : property.micro;
    if (chosen - other >= threshold) {
      advice.push({
        kind: 'betterRegime',
        propertyId: property.propertyId,
        amount: chosen - other,
      });
    }
  }
  if (advice.length === 0 && estimate.properties.length > 0) {
    advice.push({ kind: 'autoRegime' });
  }
  return advice;
}

function pointsOfYear(history: readonly MonthlyPoint[], year: number): MonthlyPoint[] {
  return history.filter((point) => point.date.year === year);
}

/**
 * The yearly review with Yvon Tableur (docs/04, « Bilan annuel »), built on
 * the 1st of January once last year's tax is assessed.
 */
export function buildYearReview(ctx: SystemContext, regime: readonly Advice[]): YearReview {
  const { content, state } = ctx;
  const year = state.clock.date.year - 1;
  const thresholds = content.yvon.thresholds;
  const points = pointsOfYear(state.history, year);
  const end = state.history.at(-1);
  const first = points[0] ?? end;
  const start = toDayNumber({ year, month: 1, day: 1 });
  const cashFlow = [...points.slice(1), ...(end ? [end] : [])].reduce((s, p) => s + p.cashFlow, 0);
  const rents = points.reduce((sum, point) => sum + point.monthlyRent, 0);
  const assessment = state.tax.lastAssessment?.year === year ? state.tax.lastAssessment : null;
  const rentTax =
    assessment && assessment.properties.length > 0
      ? assessment.incomeTax + assessment.socialContributions
      : null;
  const advice: Advice[] = [];
  const netWorthStart = first?.netWorth ?? 0;
  const netWorthEnd = end?.netWorth ?? 0;
  const delta = netWorthEnd - netWorthStart;
  advice.push({ kind: delta >= 0 ? 'netWorthUp' : 'netWorthDown', amount: Math.abs(delta) });
  const today = ctx.today;
  const home = state.player.homePropertyId;
  for (const owned of state.properties) {
    if (owned.property.id === home) continue;
    const ban = letBanDay(content, owned.property.dpe);
    if (ban !== null && ban > today && ban - today <= thresholds.dpeBanYears * DAYS_PER_YEAR) {
      advice.push({ kind: 'dpeBan', propertyId: owned.property.id, year: fromDayNumber(ban).year });
    }
  }
  const payments = monthlyLoanPayments(state);
  if (payments > 0 && state.player.balance < payments * thresholds.reserveMonths) {
    advice.push({ kind: 'lowReserve' });
  }
  const ratio = debtRatio(content, state);
  if (Number.isFinite(ratio) && ratio > thresholds.highDebtRatio) {
    advice.push({ kind: 'highDebt', ratio });
  }
  for (const owned of state.properties) {
    if (owned.property.id !== home && !owned.lease && !owned.works && !owned.sale) {
      advice.push({ kind: 'vacancy', propertyId: owned.property.id });
    }
  }
  advice.push(...regime.filter((a) => a.kind === 'betterRegime'));
  if (rentTax !== null && rentTax <= 0) advice.push({ kind: 'taxFree' });
  if (rentTax !== null && rentTax >= toCents(thresholds.bigTaxEuros)) {
    advice.push({ kind: 'bigTax', amount: rentTax });
  }
  const deficits = state.tax.landlordDeficits.reduce((sum, d) => sum + d.amount, 0);
  if (deficits > 0) advice.push({ kind: 'deficitCarry', amount: deficits });
  advice.push(...regime.filter((a) => a.kind === 'autoRegime'));
  const expensive = state.loans.some((loan) => {
    const years = Math.max(
      1,
      Math.round((loan.durationMonths - loan.paymentsMade) / MONTHS_PER_YEAR),
    );
    return loan.ratePercent - marketOffer(content, state, years) >= thresholds.renegotiatePoints;
  });
  if (expensive) advice.push({ kind: 'renegotiate' });
  advice.push({ kind: cashFlow >= 0 ? 'goodYear' : 'badYear', amount: Math.abs(cashFlow) });
  if (state.properties.length === 0) advice.push({ kind: 'noProperty' });
  const firstPurchase = state.chronicle.find((entry) => entry.kind === 'firstPurchase');
  if (firstPurchase && fromDayNumber(firstPurchase.day).year === year) {
    advice.push({ kind: 'firstYear' });
  }
  const inYear = (day: number) => day >= start && day < today;
  return {
    year,
    netWorthStart,
    netWorthEnd,
    cashFlow,
    rents,
    reputationStart: first?.reputation ?? state.player.reputation,
    reputationEnd: state.player.reputation,
    rentTax,
    accountantFees: assessment?.accountantFees ?? 0,
    titles: state.progress.titles.filter((t) => inYear(t.day)).map((t) => t.id),
    achievements: state.progress.achievements.filter((a) => inYear(a.day)).map((a) => a.id),
    advice: advice.slice(0, content.yvon.maxAdvice),
  };
}

/** The challenge offered or under way, with its progress. */
export function challengeView(content: GameContent, state: GameState) {
  const active = state.progress.challenge;
  const challenge = active && findChallenge(content, active.id);
  if (!active || !challenge) return null;
  return {
    id: challenge.id,
    giver: challenge.giver,
    accepted: active.accepted,
    deadlineDay: active.deadlineDay,
    progress: active.accepted ? challengeProgress(content, state) : null,
  };
}

/** Titles, achievements, reputation and challenges for the « Progression » screens. */
export function progressionView(content: GameContent, state: GameState) {
  const cache = {};
  const held = new Map(state.progress.titles.map((title) => [title.id, title.day]));
  const titles = content.titles.map((title) => {
    const day = held.get(title.id);
    const conditions = title.conditions
      .filter((condition) => condition.active !== false)
      .map((condition) => ({
        stat: condition.stat,
        key: condition.key ?? null,
        current: statValue(content, state, condition.stat, condition.key, cache),
        target: condition.min ?? condition.max ?? 0,
      }));
    return {
      id: title.id,
      day: day ?? null,
      available: title.available,
      reachable:
        day === undefined &&
        title.available &&
        (title.requiresAny.length === 0 || title.requiresAny.some((id) => held.has(id))),
      conditions,
      met: day === undefined && conditionsMet(content, state, title.conditions, cache),
    };
  });
  const earned = new Map(state.progress.achievements.map((a) => [a.id, a.day]));
  const achievements = content.achievements.map((achievement) => {
    const condition = achievement.conditions[0];
    return {
      id: achievement.id,
      day: earned.get(achievement.id) ?? null,
      secret: achievement.secret === true,
      current: condition ? statValue(content, state, condition.stat, condition.key, cache) : 0,
      target: condition ? (condition.min ?? condition.max ?? 0) : 0,
    };
  });
  return {
    currentTitleId: currentTitleId(content, state),
    reputation: state.player.reputation,
    /** Margin every bank adds for this player (reputation and titles, ≤ 0). */
    bankMarginPercent: progressMarginPercent(content, state),
    offMarket: offMarketChancePerMonth(content, state) > 0,
    titles,
    achievements,
    challenge: challengeView(content, state),
    challengeHistory: state.progress.challengeHistory,
    records: state.progress.records,
    counters: state.progress.counters,
    mode: modeOf(content, state).id,
    rewindsLeft: rewindsLeft(content, state),
  };
}

export interface AgendaDay {
  day: number;
  date: CalendarDate;
  kind: DayKind;
  /** Name of the school holiday, when the day is in one. */
  holiday: string | null;
  freeMinutes: number;
  planned: AgendaItem[];
}

/** The coming week of the agenda: kind of day, free time and planned actions. */
export function agendaWeek(content: GameContent, state: GameState, days = 7): AgendaDay[] {
  const today = toDayNumber(state.clock.date);
  const job = findJob(content, state.player.jobId);
  return Array.from({ length: days }, (_, offset) => {
    const day = today + offset;
    const date = fromDayNumber(day);
    return {
      day,
      date,
      kind: state.player.employed ? dayKind(content, job, date) : 'weekend',
      holiday: schoolHoliday(content, date)?.name ?? null,
      freeMinutes:
        offset === 0 ? state.player.freeTimeMinutes : dailyFreeTime(content, state, date),
      planned: state.agenda.filter((item) => item.day === day),
    };
  });
}
