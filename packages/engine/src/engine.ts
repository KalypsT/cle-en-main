import type { DispatchResult, GameAction, RefusalCode } from './actions.ts';
import { type CalendarDate, isValidDate, toDayNumber, toIsoDate } from './calendar.ts';
import { advanceClock, createClock, HOURS_PER_DAY } from './clock.ts';
import { deepClone } from './clone.ts';
import { findJob, type GameContent } from './content.ts';
import type { GameEvent, StatementLine } from './events.ts';
import { type Cents, toCents } from './money.ts';
import { nextFloat, seedRng } from './random.ts';
import { deserializeGame, type MigrationRegistry, MIGRATIONS } from './serialization.ts';
import { FORMAT_VERSION, type GameState } from './state.ts';
import {
  evaluateLoan,
  holdMeeting,
  initialBankRelations,
  type LoanDecision,
  type LoanRequest,
  quoteRate,
  type RateQuote,
  refinanceLoan,
  runDailyOverdraft,
  runMonthlyLoanPayments,
  runMonthlyTrust,
  runRenegotiationCheck,
} from './systems/banking.ts';
import type { SystemContext } from './systems/context.ts';
import { dailyFreeTime, runMonthlyHousehold, startFreeDay } from './systems/household.ts';
import { roundRate, runMonthlyMarketRate } from './systems/market-rate.ts';

export interface CreateGameOptions {
  /** uint32 seed of the random generator. */
  seed: number;
  /** First day of the game, supplied by the caller (the engine never reads the system clock). */
  startDate: CalendarDate;
  /** Hour of day the game starts at, 0 … 23. */
  startHour: number;
  /** Defaults to the content's default job. */
  jobId?: string;
}

export interface TickResult {
  state: GameState;
  events: GameEvent[];
}

/** Starting game state, from the content's starting conditions. */
export function createInitialState(content: GameContent, options: CreateGameOptions): GameState {
  const { seed, startDate, startHour } = options;
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffff_ffff) {
    throw new RangeError(`Seed must be a uint32, got ${seed}`);
  }
  if (!isValidDate(startDate)) {
    throw new RangeError(`Invalid start date ${JSON.stringify(startDate)}`);
  }
  if (!Number.isInteger(startHour) || startHour < 0 || startHour >= HOURS_PER_DAY) {
    throw new RangeError(`Invalid start hour ${startHour}`);
  }
  const job = findJob(content, options.jobId ?? content.start.defaultJobId);
  const rng = seedRng(seed);
  const state: GameState = {
    formatVersion: FORMAT_VERSION,
    seed,
    rng,
    startDate: { ...startDate },
    clock: createClock(startDate, startHour),
    nextId: 1,
    player: {
      jobId: job.id,
      employed: true,
      balance: toCents(content.start.savings),
      overdraftDays: 0,
      overdraftInterestThisMonth: 0,
      monthlyRent: toCents(content.start.monthlyRent),
      freeTimeMinutes: 0,
      reputation: content.start.reputation,
      rentalHistoryMonths: 0,
    },
    banks: initialBankRelations(content, job.bankTrust),
    market: {
      ratePercent: roundRate(content.marketRate.startPercent),
      cyclePhase: nextFloat(rng),
    },
    loans: [],
  };
  // Free time left on the first day, prorated to the hours remaining.
  const fullDay = dailyFreeTime(content, state, startDate);
  state.player.freeTimeMinutes = Math.floor(
    (fullDay * (HOURS_PER_DAY - startHour)) / HOURS_PER_DAY,
  );
  return state;
}

function context(content: GameContent, state: GameState, events: GameEvent[]): SystemContext {
  return { content, state, events, today: toDayNumber(state.clock.date) };
}

/** Systems run in this fixed order at the start of each game day. */
function runNewDay(ctx: SystemContext, monthStarted: boolean): void {
  if (monthStarted) {
    runMonthlyMarketRate(ctx);
    const lines: StatementLine[] = [];
    runMonthlyHousehold(ctx, lines);
    const paidBankIds = new Set(ctx.state.loans.map((loan) => loan.bankId));
    runMonthlyLoanPayments(ctx, lines);
    runMonthlyTrust(ctx, paidBankIds);
    runRenegotiationCheck(ctx);
    const { player } = ctx.state;
    if (player.overdraftInterestThisMonth > 0) {
      lines.push({ kind: 'overdraftInterest', amount: player.overdraftInterestThisMonth });
      player.overdraftInterestThisMonth = 0;
    }
    ctx.events.push({ type: 'monthlyStatement', lines, balance: player.balance });
  }
  startFreeDay(ctx, ctx.state.clock.date);
  runDailyOverdraft(ctx);
}

/** The engine bound to its content. Every function is pure: inputs are never mutated. */
export function createEngine(content: GameContent) {
  function tick(state: GameState): TickResult {
    const { clock, events } = advanceClock(state.clock);
    if (events.length === 0) return { state: { ...state, clock }, events };
    const draft = deepClone({ ...state, clock });
    runNewDay(
      context(content, draft, events),
      events.some((event) => event.type === 'monthStarted'),
    );
    return { state: draft, events };
  }

  function advanceHours(state: GameState, hours: number): TickResult {
    let current = state;
    const events: GameEvent[] = [];
    for (let i = 0; i < hours; i++) {
      const result = tick(current);
      current = result.state;
      for (const event of result.events) events.push(event);
    }
    return { state: current, events };
  }

  function dispatch(state: GameState, action: GameAction): DispatchResult {
    const draft = deepClone(state);
    const events: GameEvent[] = [];
    const ctx = context(content, draft, events);
    let refusal: RefusalCode | null;
    switch (action.type) {
      case 'bank/meet':
        refusal = holdMeeting(ctx, action.bankId);
        break;
      case 'bank/refinance':
        refusal = refinanceLoan(ctx, action.loanId, action.bankId);
        break;
      case 'job/resign':
        if (!draft.player.employed) {
          refusal = 'job.alreadyResigned';
        } else {
          refusal = null;
          draft.player.employed = false;
          events.push({ type: 'resigned' });
        }
        break;
    }
    if (refusal) return { ok: false, state, reason: { code: refusal } };
    return { ok: true, state: draft, events };
  }

  return {
    content,
    createGame: (options: CreateGameOptions) => createInitialState(content, options),
    tick,
    advanceHours,
    dispatch,
    /** Loads a save, migrating it to the current format. Throws SaveFormatError. */
    loadGame: (json: string, registry: MigrationRegistry = MIGRATIONS) =>
      deserializeGame(json, { content }, registry),
    /** Rate a bank would offer today, with its breakdown. */
    quoteRate: (state: GameState, bankId: string, durationYears: number): RateQuote | null => {
      const bank = content.banks.find((candidate) => candidate.id === bankId);
      return bank ? quoteRate(content, state, bank, durationYears) : null;
    },
    /** What a bank would answer to a loan request today. */
    evaluateLoan: (state: GameState, request: LoanRequest): LoanDecision =>
      evaluateLoan(content, state, request),
    netWorth,
  };
}

export type Engine = ReturnType<typeof createEngine>;

/** Cash minus debts; properties join with milestone 1b. */
export function netWorth(state: GameState): Cents {
  return state.player.balance - state.loans.reduce((sum, loan) => sum + loan.remaining, 0);
}

/** Short human-oriented identifier of the current game time, for logs and tools. */
export function describeTime(state: GameState): string {
  return `${toIsoDate(state.clock.date)} ${String(state.clock.hour).padStart(2, '0')}:00`;
}
