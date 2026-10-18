import type { CalendarDate, Weekday } from './calendar.ts';
import type { Cents } from './money.ts';

export type StatementLine =
  | { kind: 'salary'; amount: Cents }
  | { kind: 'rent'; amount: Cents }
  | { kind: 'livingCosts'; amount: Cents }
  | { kind: 'loanPayment'; loanId: string; amount: Cents; interest: Cents; capital: Cents }
  | { kind: 'overdraftInterest'; amount: Cents };

/**
 * Output events emitted by `tick` and `dispatch`. Within one tick, calendar
 * events come first (dayStarted, weekendStarted, monthStarted, yearStarted),
 * then the events of each system in their fixed order.
 */
export type GameEvent =
  | { type: 'dayStarted'; date: CalendarDate; weekday: Weekday; isWeekend: boolean }
  | { type: 'weekendStarted'; date: CalendarDate }
  | { type: 'monthStarted'; year: number; month: number }
  | { type: 'yearStarted'; year: number }
  | { type: 'marketRateChanged'; ratePercent: number }
  /** Monthly flows of the current account; amounts are positive, `lines` say which way. */
  | { type: 'monthlyStatement'; lines: StatementLine[]; balance: Cents }
  | { type: 'overdraftStarted'; balance: Cents }
  | { type: 'overdraftEnded' }
  | { type: 'loanRepaid'; loanId: string }
  | {
      type: 'renegotiationAvailable';
      loanId: string;
      currentRatePercent: number;
      marketOfferPercent: number;
    }
  | { type: 'loanRefinanced'; oldLoanId: string; newLoanId: string; fees: Cents }
  | { type: 'bankMeetingHeld'; bankId: string; trust: number }
  | { type: 'resigned' };

export type GameEventType = GameEvent['type'];
