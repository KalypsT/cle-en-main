import {
  type CalendarDate,
  fromDayNumber,
  isWeekend,
  SATURDAY,
  toDayNumber,
  weekdayOf,
} from '../calendar.ts';
import type { GameContent, Job } from '../content.ts';

/** Easter Sunday of a year (anonymous Gregorian algorithm). */
export function easterSunday(year: number): CalendarDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function monthDay(year: number, text: string): CalendarDate {
  const [month, day] = text.split('-').map(Number);
  return { year, month: month ?? 1, day: day ?? 1 };
}

export function isPublicHoliday(content: GameContent, date: CalendarDate): boolean {
  const rules = content.calendar.publicHolidays;
  const key = `${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`;
  if (rules.fixed.includes(key)) return true;
  const offset = toDayNumber(date) - toDayNumber(easterSunday(date.year));
  return rules.easterOffsets.includes(offset);
}

/** First and last day numbers of a school holiday starting in `year`. */
function holidaySpan(
  rule: GameContent['calendar']['schoolHolidays'][number],
  year: number,
): [number, number] {
  let start = toDayNumber(monthDay(year, rule.from));
  while (weekdayOf(fromDayNumber(start)) !== SATURDAY) start += 1;
  const end = rule.until ? toDayNumber(monthDay(year, rule.until)) : start + (rule.days ?? 1) - 1;
  return [start, end];
}

/** The school holiday (zone A) `date` falls in, if any. */
export function schoolHoliday(
  content: GameContent,
  date: CalendarDate,
): { id: string; name: string } | null {
  const day = toDayNumber(date);
  for (const rule of content.calendar.schoolHolidays) {
    for (const year of [date.year, date.year - 1]) {
      const [start, end] = holidaySpan(rule, year);
      if (day >= start && day <= end) return { id: rule.id, name: rule.name };
    }
  }
  return null;
}

/** RTT: the first given weekday of the month, unless it is a public holiday. */
export function isRttDay(content: GameContent, job: Job, date: CalendarDate): boolean {
  if (job.freeTime.kind !== 'regular' || !job.freeTime.rtt) return false;
  return (
    weekdayOf(date) === job.freeTime.rtt.weekday && date.day <= 7 && !isPublicHoliday(content, date)
  );
}

export type DayKind = 'work' | 'weekend' | 'publicHoliday' | 'rtt' | 'schoolHoliday';

/** What kind of day `date` is for the player's job (the agenda's labels). */
export function dayKind(content: GameContent, job: Job, date: CalendarDate): DayKind {
  if (
    job.freeTime.kind === 'regular' &&
    job.freeTime.schoolHolidayMinutes !== undefined &&
    schoolHoliday(content, date)
  ) {
    return 'schoolHoliday';
  }
  if (isWeekend(date)) return 'weekend';
  if (isPublicHoliday(content, date)) return 'publicHoliday';
  if (isRttDay(content, job, date)) return 'rtt';
  return 'work';
}
