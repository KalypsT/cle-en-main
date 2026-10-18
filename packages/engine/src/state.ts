import type { CalendarDate } from './calendar.ts';
import type { Clock } from './clock.ts';
import type { Cents } from './money.ts';
import type { RngState } from './random.ts';

/** Current version of the serialized game state. Bump it with a migration. */
export const FORMAT_VERSION = 2;

export interface PlayerState {
  jobId: string;
  employed: boolean;
  /** Current account; negative means overdraft. */
  balance: Cents;
  /** Consecutive days spent in overdraft. */
  overdraftDays: number;
  /** Overdraft interest charged since the last monthly statement. */
  overdraftInterestThisMonth: Cents;
  /** Rent of the player's own home. */
  monthlyRent: Cents;
  /** Free time left today, in minutes. */
  freeTimeMinutes: number;
  /** Global reputation, 0 … 100. */
  reputation: number;
  /** Months with rental income, used by banks once the player has no salary. */
  rentalHistoryMonths: number;
}

export interface BankRelation {
  /** Banker's trust, 0 … 100. */
  trust: number;
  relationshipMonths: number;
  /** Day number (see calendar.toDayNumber) of the last meeting. */
  lastMeetingDay: number | null;
}

export interface Loan {
  id: string;
  bankId: string;
  principal: Cents;
  /** Fixed annual rate, insurance included, in percentage points. */
  ratePercent: number;
  durationMonths: number;
  monthlyPayment: Cents;
  remaining: Cents;
  paymentsMade: number;
  startDate: CalendarDate;
  /** True once the player was told this loan can be renegotiated. */
  renegotiationSuggested: boolean;
}

export interface MarketState {
  /** 20-year reference rate, insurance excluded, in percentage points. */
  ratePercent: number;
  /** Position in the rate cycle, 0 … 1. */
  cyclePhase: number;
}

/** The whole world. Must stay plain JSON data: no classes, no functions. */
export interface GameState {
  formatVersion: number;
  seed: number;
  rng: RngState;
  startDate: CalendarDate;
  clock: Clock;
  /** Counter for generated identifiers. */
  nextId: number;
  player: PlayerState;
  banks: Record<string, BankRelation>;
  market: MarketState;
  loans: Loan[];
}
