import { type CalendarDate, isWeekend, nextDay, SATURDAY, weekdayOf } from './calendar.ts';
import type { GameEvent } from './events.ts';

export const HOURS_PER_DAY = 24;

export interface Clock {
  date: CalendarDate;
  /** Hour of day, 0 … 23. */
  hour: number;
  /** Hours elapsed since the start of the game. */
  elapsedHours: number;
}

export function createClock(date: CalendarDate, hour: number): Clock {
  return { date: { ...date }, hour, elapsedHours: 0 };
}

/** Advances the clock by one hour and reports the calendar boundaries crossed. */
export function advanceClock(clock: Clock): { clock: Clock; events: GameEvent[] } {
  const hour = clock.hour + 1;
  const elapsedHours = clock.elapsedHours + 1;
  if (hour < HOURS_PER_DAY) {
    return { clock: { date: clock.date, hour, elapsedHours }, events: [] };
  }

  const date = nextDay(clock.date);
  const weekday = weekdayOf(date);
  const events: GameEvent[] = [{ type: 'dayStarted', date, weekday, isWeekend: isWeekend(date) }];
  if (weekday === SATURDAY) events.push({ type: 'weekendStarted', date });
  if (date.month !== clock.date.month) {
    events.push({ type: 'monthStarted', year: date.year, month: date.month });
  }
  if (date.year !== clock.date.year) events.push({ type: 'yearStarted', year: date.year });

  return { clock: { date, hour: 0, elapsedHours }, events };
}
