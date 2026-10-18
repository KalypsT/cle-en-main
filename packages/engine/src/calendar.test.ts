import { describe, expect, it } from 'vitest';
import {
  compareDates,
  daysInMonth,
  isLeapYear,
  isValidDate,
  isWeekend,
  nextDay,
  parseIsoDate,
  toDayNumber,
  toIsoDate,
  weekdayOf,
} from './calendar.ts';

describe('calendar', () => {
  it('knows leap years', () => {
    expect([2024, 2000, 2028].map(isLeapYear)).toEqual([true, true, true]);
    expect([2026, 1900, 2100].map(isLeapYear)).toEqual([false, false, false]);
  });

  it('knows month lengths', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
    expect(daysInMonth(2028, 2)).toBe(29);
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });

  it('validates dates', () => {
    expect(isValidDate({ year: 2026, month: 2, day: 29 })).toBe(false);
    expect(isValidDate({ year: 2028, month: 2, day: 29 })).toBe(true);
    expect(isValidDate({ year: 2026, month: 13, day: 1 })).toBe(false);
    expect(isValidDate({ year: 2026, month: 1, day: 1.5 })).toBe(false);
  });

  it('counts days from the Unix epoch', () => {
    expect(toDayNumber({ year: 1970, month: 1, day: 1 })).toBe(0);
    expect(toDayNumber({ year: 2000, month: 3, day: 1 })).toBe(11017);
    expect(toDayNumber({ year: 1969, month: 12, day: 31 })).toBe(-1);
  });

  it('computes ISO weekdays', () => {
    expect(weekdayOf({ year: 2026, month: 10, day: 18 })).toBe(7); // Sunday
    expect(weekdayOf({ year: 2026, month: 10, day: 19 })).toBe(1); // Monday
    expect(weekdayOf({ year: 1969, month: 12, day: 29 })).toBe(1); // Monday
    expect(isWeekend({ year: 2026, month: 10, day: 17 })).toBe(true);
    expect(isWeekend({ year: 2026, month: 10, day: 16 })).toBe(false);
  });

  it('rolls over months and years', () => {
    expect(nextDay({ year: 2026, month: 10, day: 18 })).toEqual({ year: 2026, month: 10, day: 19 });
    expect(nextDay({ year: 2026, month: 2, day: 28 })).toEqual({ year: 2026, month: 3, day: 1 });
    expect(nextDay({ year: 2028, month: 2, day: 28 })).toEqual({ year: 2028, month: 2, day: 29 });
    expect(nextDay({ year: 2026, month: 12, day: 31 })).toEqual({ year: 2027, month: 1, day: 1 });
  });

  it('stays consistent with the day count over many years', () => {
    let date = { year: 1999, month: 12, day: 25 };
    for (let i = 0; i < 20_000; i++) {
      const next = nextDay(date);
      expect(toDayNumber(next) - toDayNumber(date)).toBe(1);
      expect(compareDates(next, date)).toBeGreaterThan(0);
      date = next;
    }
  });

  it('formats and parses ISO dates', () => {
    expect(toIsoDate({ year: 2026, month: 3, day: 7 })).toBe('2026-03-07');
    expect(parseIsoDate('2026-03-07')).toEqual({ year: 2026, month: 3, day: 7 });
    expect(parseIsoDate('2026-02-30')).toBeNull();
    expect(parseIsoDate('07/03/2026')).toBeNull();
  });
});
