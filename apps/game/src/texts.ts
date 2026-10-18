import { uiTexts } from '@cle/content';
import { type CalendarDate, type GameEvent, weekdayOf } from '@cle/engine';

/** Every displayed text comes from content/textes/interface.json. */
export const texts = uiTexts;

/** Replaces `{name}` placeholders with the given values. */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export function formatGameDate(date: CalendarDate): string {
  return format(texts.calendar.date, {
    weekday: texts.calendar.weekdays[weekdayOf(date) - 1] ?? '',
    day: date.day,
    month: texts.calendar.months[date.month - 1] ?? '',
    year: date.year,
  });
}

export function formatGameTime(hour: number): string {
  return format(texts.calendar.time, { hour });
}

/** Text for an engine event, or null when the event is not shown to the player. */
export function describeEvent(event: GameEvent): string | null {
  switch (event.type) {
    case 'dayStarted':
      return format(texts.events.dayStarted, { date: formatGameDate(event.date) });
    case 'weekendStarted':
      return texts.events.weekendStarted;
    case 'monthStarted':
      return format(texts.events.monthStarted, {
        month: texts.calendar.months[event.month - 1] ?? '',
        year: event.year,
      });
    case 'yearStarted':
      return format(texts.events.yearStarted, { year: event.year });
    case 'demo/dieRolled':
      return null;
  }
}

const realDateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'short' });
const realTimeFormat = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' });

/** Formats a real-world timestamp (save time), in the device's time zone. */
export function formatRealTimestamp(timestamp: number): string {
  return format(texts.slots.savedAt, {
    date: realDateFormat.format(timestamp),
    time: realTimeFormat.format(timestamp),
  });
}
