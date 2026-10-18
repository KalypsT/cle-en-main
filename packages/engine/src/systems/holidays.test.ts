import { describe, expect, it } from 'vitest';
import { content, newGame } from '../../test/helpers.ts';
import { type CalendarDate, fromDayNumber, toDayNumber } from '../calendar.ts';
import { findJob } from '../content.ts';
import { dailyFreeTime } from './household.ts';
import { dayKind, easterSunday, isPublicHoliday, isRttDay, schoolHoliday } from './holidays.ts';

const d = (year: number, month: number, day: number): CalendarDate => ({ year, month, day });

describe('calendar of the agenda (docs/03-systemes/01)', () => {
  it('finds Easter and the public holidays', () => {
    expect(easterSunday(2027)).toEqual(d(2027, 3, 28));
    expect(easterSunday(2026)).toEqual(d(2026, 4, 5));
    expect(isPublicHoliday(content, d(2027, 3, 29))).toBe(true); // Easter Monday
    expect(isPublicHoliday(content, d(2027, 5, 6))).toBe(true); // Ascension
    expect(isPublicHoliday(content, d(2027, 5, 17))).toBe(true); // Whit Monday
    expect(isPublicHoliday(content, d(2026, 11, 11))).toBe(true);
    expect(isPublicHoliday(content, d(2026, 11, 12))).toBe(false);
  });

  it('gives the official zone A school holidays of 2026-2027', () => {
    const span = (from: CalendarDate, to: CalendarDate, id: string) => {
      expect(schoolHoliday(content, from)?.id).toBe(id);
      expect(schoolHoliday(content, to)?.id).toBe(id);
      const before = toDayNumber(from) - 1;
      const after = toDayNumber(to) + 1;
      expect(schoolHoliday(content, fromDayNumber(before))?.id).not.toBe(id);
      expect(schoolHoliday(content, fromDayNumber(after))?.id).not.toBe(id);
    };
    span(d(2026, 10, 17), d(2026, 11, 1), 'toussaint');
    span(d(2026, 12, 19), d(2027, 1, 3), 'christmas');
    span(d(2027, 2, 13), d(2027, 2, 28), 'winter');
    span(d(2027, 4, 10), d(2027, 4, 25), 'spring');
    span(d(2027, 7, 3), d(2027, 8, 31), 'summer');
  });

  it('gives teachers their holidays and civil servants a monthly RTT day', () => {
    const teacher = newGame({ jobId: 'teacher' });
    const job = findJob(content, 'teacher');
    if (job.freeTime.kind !== 'regular') throw new Error('Regular job expected');
    // A Tuesday of the Toussaint holidays, then a Tuesday of school.
    expect(dailyFreeTime(content, teacher, d(2026, 10, 27))).toBe(
      job.freeTime.schoolHolidayMinutes,
    );
    expect(dailyFreeTime(content, teacher, d(2026, 11, 3))).toBe(job.freeTime.weekdayMinutes);
    const civil = newGame({ jobId: 'civilServant' });
    const civilJob = findJob(content, 'civilServant');
    if (civilJob.freeTime.kind !== 'regular' || !civilJob.freeTime.rtt) throw new Error('RTT');
    // The first Friday of November 2026 is the 6th.
    expect(isRttDay(content, civilJob, d(2026, 11, 6))).toBe(true);
    expect(isRttDay(content, civilJob, d(2026, 11, 13))).toBe(false);
    expect(dayKind(content, civilJob, d(2026, 11, 6))).toBe('rtt');
    expect(dailyFreeTime(content, civil, d(2026, 11, 6))).toBe(civilJob.freeTime.rtt.minutes);
    // A public holiday on a weekday is free like a weekend.
    expect(dailyFreeTime(content, civil, d(2026, 11, 11))).toBe(civilJob.freeTime.weekendMinutes);
  });
});
