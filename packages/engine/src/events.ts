import type { CalendarDate, Weekday } from './calendar.ts';

/**
 * Output events emitted by `tick` and `dispatch`. Within one tick they are
 * emitted in this order: dayStarted, weekendStarted, monthStarted, yearStarted.
 */
export type GameEvent =
  | { type: 'dayStarted'; date: CalendarDate; weekday: Weekday; isWeekend: boolean }
  | { type: 'weekendStarted'; date: CalendarDate }
  | { type: 'monthStarted'; year: number; month: number }
  | { type: 'yearStarted'; year: number }
  | { type: 'demo/dieRolled'; sides: number; value: number };

export type GameEventType = GameEvent['type'];
