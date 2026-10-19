import { toDayNumber } from '../calendar.ts';
import { DPE_LABELS } from '../content-constants.ts';
import type { GameContent, Stat, StatCondition } from '../content.ts';
import type { GameEvent } from '../events.ts';
import { toCents, type Cents } from '../money.ts';
import type { ChronicleKind, GameState, ProgressState } from '../state.ts';
import type { SystemContext } from './context.ts';
import { estimateValue } from './valuation.ts';
import { currentMonthlyRent, statementNet } from './history.ts';
import { netWorth } from './net-worth.ts';
import { changeReputation } from './reputation.ts';
import { interest } from './rivals.ts';
import { isIndecent } from './dwelling.ts';

const DAYS_PER_YEAR = 365;
const PASSOIRES = new Set(['E', 'F', 'G']);

export function initialProgress(content: GameContent): ProgressState {
  const start = content.titles.filter((title) => title.step === 0);
  return {
    titles: start.map((title) => ({ id: title.id, day: 0 })),
    achievements: [],
    counters: {},
    records: { bestCapitalGain: 0, biggestWorks: 0, bestMonth: 0, maxNetWorth: 0 },
    troubledYear: false,
    challenge: null,
    challengeHistory: [],
    nextChallengeDay: 0,
  };
}

function counterKey(stat: Stat, key?: string): string {
  return key === undefined ? stat : `${stat}.${key}`;
}

function bump(state: GameState, stat: Stat, by = 1, key?: string): void {
  const name = counterKey(stat, key);
  state.progress.counters[name] = (state.progress.counters[name] ?? 0) + by;
}

/** Value of a stat today (amounts in euros). `cache` saves the net worth within one check. */
export function statValue(
  content: GameContent,
  state: GameState,
  stat: Stat,
  key?: string,
  cache: { netWorth?: Cents } = {},
): number {
  const counters = state.progress.counters;
  switch (stat) {
    case 'netWorth':
      cache.netWorth ??= netWorth(content, state);
      return cache.netWorth / 100;
    case 'balance':
      return state.player.balance / 100;
    case 'debt':
      return state.loans.reduce((sum, loan) => sum + loan.remaining, 0) / 100;
    case 'properties':
      return state.properties.length;
    case 'letProperties':
      return state.properties.filter((owned) => owned.lease).length;
    case 'passoires':
      return state.properties.filter(
        (owned) =>
          owned.property.id !== state.player.homePropertyId && PASSOIRES.has(owned.property.dpe),
      ).length;
    case 'cities':
      return new Set(state.properties.map((owned) => owned.property.cityId)).size;
    case 'reputation':
      return state.player.reputation;
    case 'monthlyRent':
      return currentMonthlyRent(state) / 100;
    case 'bankTrust':
      return key === undefined ? 0 : (state.banks[key]?.trust ?? 0);
    case 'yearsPlayed':
      return Math.floor(
        (toDayNumber(state.clock.date) - toDayNumber(state.startDate)) / DAYS_PER_YEAR,
      );
    case 'rewinds':
      return state.rewinds;
    default:
      return counters[counterKey(stat, key)] ?? 0;
  }
}

/** Every active condition holds (conditions of a later milestone are skipped). */
export function conditionsMet(
  content: GameContent,
  state: GameState,
  conditions: readonly StatCondition[],
  cache: { netWorth?: Cents } = {},
): boolean {
  return conditions.every((condition) => {
    if (condition.active === false) return true;
    const value = statValue(content, state, condition.stat, condition.key, cache);
    if (condition.min !== undefined && value < condition.min) return false;
    if (condition.max !== undefined && value > condition.max) return false;
    return true;
  });
}

export function addChronicle(
  ctx: SystemContext,
  kind: ChronicleKind,
  ref: string | null = null,
  amount: Cents | null = null,
): void {
  const { chronicle } = ctx.state;
  chronicle.push({ day: ctx.today, kind, ref, amount });
  const max = ctx.content.progression.chronicleLength;
  if (chronicle.length > max) chronicle.splice(0, chronicle.length - max);
}

/** First time a counter moves from 0: a step of the career. */
function firstTime(ctx: SystemContext, stat: Stat, kind: ChronicleKind, amount: Cents | null) {
  if ((ctx.state.progress.counters[stat] ?? 0) === 1) addChronicle(ctx, kind, null, amount);
}

const dpeRank = (label: string) => DPE_LABELS.indexOf(label as (typeof DPE_LABELS)[number]);

/**
 * Turns the events of a tick or an action into counters, reputation,
 * records and chronicle entries (docs/02, sections 2.8 to 2.10).
 */
export function recordProgress(ctx: SystemContext, events: readonly GameEvent[]): void {
  const { content, state } = ctx;
  const rules = content.progression;
  const gains = rules.reputation;
  const progress = state.progress;
  for (const event of events) {
    switch (event.type) {
      case 'deedSigned': {
        bump(state, 'purchases');
        changeReputation(ctx, gains.purchase);
        const owned = state.properties.find((o) => o.property.id === event.propertyId);
        if (owned) {
          const { estimate } = estimateValue(content, state, owned.property, true);
          if (event.price <= estimate * (1 - rules.bargainShare)) bump(state, 'bargainPurchases');
        }
        firstTime(ctx, 'purchases', 'firstPurchase', event.price);
        break;
      }
      case 'movedIntoHome':
        bump(state, 'homeBought');
        firstTime(ctx, 'homeBought', 'homeBought', null);
        break;
      case 'compromisSigned': {
        const purchase = state.purchases.find((p) => p.id === event.purchaseId);
        if (!purchase) break;
        for (const rival of content.rivals) {
          if (rival.active && interest(content, rival, purchase.property) > 0) {
            bump(state, 'rivalBeaten', 1, rival.id);
          }
        }
        break;
      }
      case 'propertySold':
        bump(state, 'sales');
        if (event.gain > 0) {
          bump(state, 'salesWithGain');
          changeReputation(ctx, gains.saleWithGain);
        }
        firstTime(ctx, 'sales', 'firstSale', event.gain);
        if (event.gain > progress.records.bestCapitalGain) {
          progress.records.bestCapitalGain = event.gain;
          if ((progress.counters.sales ?? 0) > 1)
            addChronicle(ctx, 'record', 'capitalGain', event.gain);
        }
        break;
      case 'forcedSale':
        bump(state, 'forcedSales');
        changeReputation(ctx, gains.forcedSale);
        progress.troubledYear = true;
        addChronicle(ctx, 'forcedSale', null, event.price);
        break;
      case 'worksCompleted': {
        bump(state, 'worksDone');
        if (event.cost >= toCents(rules.bigWorksMinEuros)) bump(state, 'bigWorksDone');
        const gained = Math.max(0, dpeRank(event.dpeBefore) - dpeRank(event.dpeAfter));
        bump(state, 'dpeClassesGained', gained);
        if (event.dpeBefore === 'G' && dpeRank(event.dpeAfter) <= dpeRank('B'))
          bump(state, 'dpeGToB');
        if (PASSOIRES.has(event.dpeBefore) && !PASSOIRES.has(event.dpeAfter)) {
          bump(state, 'passoiresFixed');
        }
        changeReputation(ctx, gains.worksDone + gains.dpeClassGained * gained);
        firstTime(ctx, 'worksDone', 'firstWorks', event.cost);
        if (event.cost > progress.records.biggestWorks) progress.records.biggestWorks = event.cost;
        break;
      }
      case 'worksTaskStarted':
        if (event.artisanId === null) bump(state, 'diyTasks');
        break;
      case 'tenantMovedIn':
        bump(state, 'leasesSigned');
        firstTime(ctx, 'leasesSigned', 'firstLease', event.monthlyRent);
        break;
      case 'incidentRepaired':
        bump(state, 'incidentsRepaired');
        break;
      case 'tenantGaveNotice':
        if (event.reason === 'incident') changeReputation(ctx, gains.tenantConflict);
        break;
      case 'procedureStarted':
        bump(state, 'procedures');
        changeReputation(ctx, gains.procedure);
        progress.troubledYear = true;
        break;
      case 'tenantLeft':
        if (event.reason === 'evicted') {
          bump(state, 'evictions');
          changeReputation(ctx, gains.eviction);
          progress.troubledYear = true;
        }
        break;
      case 'bankMeetingHeld':
        bump(state, 'bankMeetings');
        break;
      case 'loanRefinanced':
        bump(state, 'refinances');
        break;
      case 'loanRepaid':
        bump(state, 'loansRepaid');
        break;
      case 'monthlyStatement': {
        const net = statementNet(event.lines);
        const streak = net > 0 ? (progress.counters.positiveStreak ?? 0) + 1 : 0;
        progress.counters.positiveStreak = streak;
        progress.counters.bestPositiveStreak = Math.max(
          progress.counters.bestPositiveStreak ?? 0,
          streak,
        );
        if (net > progress.records.bestMonth) progress.records.bestMonth = net;
        break;
      }
      case 'taxAssessed': {
        const assessment = state.tax.lastAssessment;
        const taxed = assessment ? assessment.incomeTax + assessment.socialContributions : 1;
        if (assessment && assessment.properties.length > 0 && taxed <= 0) {
          bump(state, 'rentTaxFreeYears');
        }
        break;
      }
      case 'catalogEventResolved':
        if (!event.auto) bump(state, 'eventChoices');
        break;
      case 'catalogEventHappened':
      case 'catalogEventStarted': {
        const rule = content.events.find((e) => e.id === event.event.eventId);
        if (rule?.major) addChronicle(ctx, 'majorEvent', rule.id);
        break;
      }
      case 'anecdote':
        bump(state, 'anecdotes');
        break;
      default:
        break;
    }
  }
}

/** Yearly review of the reputation: a quiet year, satisfied tenants, indecent homes let. */
export function runYearlyProgress(ctx: SystemContext): void {
  const { content, state } = ctx;
  const gains = content.progression.reputation;
  for (const owned of state.properties) {
    const lease = owned.lease;
    if (!lease) continue;
    if (isIndecent(content, owned.property)) {
      changeReputation(ctx, gains.indecentLet);
      state.progress.troubledYear = true;
    } else if (lease.satisfaction >= gains.happyTenantMin) {
      changeReputation(ctx, gains.happyTenant);
    }
  }
  if (state.properties.length > 0 && !state.progress.troubledYear) {
    bump(state, 'quietYears');
    changeReputation(ctx, gains.quietYear);
  }
  state.progress.troubledYear = false;
}

/** Titles and achievements whose conditions now hold (several may come at once). */
export function checkMilestones(ctx: SystemContext): void {
  const { content, state } = ctx;
  const cache: { netWorth?: Cents } = {};
  const progress = state.progress;
  let earned = true;
  while (earned) {
    earned = false;
    const held = new Set(progress.titles.map((title) => title.id));
    for (const title of content.titles) {
      if (held.has(title.id) || !title.available) continue;
      if (title.requiresAny.length > 0 && !title.requiresAny.some((id) => held.has(id))) continue;
      if (!conditionsMet(content, state, title.conditions, cache)) continue;
      progress.titles.push({ id: title.id, day: ctx.today });
      ctx.events.push({ type: 'titleEarned', titleId: title.id });
      addChronicle(ctx, 'title', title.id);
      earned = true;
    }
  }
  const done = new Set(progress.achievements.map((achievement) => achievement.id));
  for (const achievement of content.achievements) {
    if (done.has(achievement.id)) continue;
    if (!conditionsMet(content, state, achievement.conditions, cache)) continue;
    progress.achievements.push({ id: achievement.id, day: ctx.today });
    ctx.events.push({ type: 'achievementEarned', achievementId: achievement.id });
    addChronicle(ctx, 'achievement', achievement.id);
  }
  if (cache.netWorth !== undefined && cache.netWorth > progress.records.maxNetWorth) {
    progress.records.maxNetWorth = cache.netWorth;
  }
}

/** The current title: the highest step held (the most recent one on a tie). */
export function currentTitleId(content: GameContent, state: GameState): string | null {
  let best: { id: string; step: number } | null = null;
  for (const held of state.progress.titles) {
    const title = content.titles.find((candidate) => candidate.id === held.id);
    if (title && (!best || title.step >= best.step)) best = { id: title.id, step: title.step };
  }
  return best?.id ?? null;
}
