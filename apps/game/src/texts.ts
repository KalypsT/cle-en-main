import { gameContent, uiTexts } from '@cle/content';
import { type CalendarDate, type Cents, type GameEvent, weekdayOf } from '@cle/engine';

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

const moneyFormat = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const rateFormat = new Intl.NumberFormat('fr-FR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMoney(amount: Cents): string {
  return moneyFormat.format(amount / 100);
}

export function formatPercent(value: number): string {
  return format(texts.numbers.percent, { value: rateFormat.format(value) });
}

export function formatDuration(minutes: number): string {
  return format(texts.calendar.duration, {
    hours: Math.floor(minutes / 60),
    minutes: String(minutes % 60).padStart(2, '0'),
  });
}

export function bankerName(bankId: string): string {
  return gameContent.banks.find((bank) => bank.id === bankId)?.banker.name ?? bankId;
}

/** Text for an engine event, or null when the event is not shown to the player. */
export function describeEvent(event: GameEvent): string | null {
  const { events } = texts;
  switch (event.type) {
    case 'dayStarted':
      return format(events.dayStarted, { date: formatGameDate(event.date) });
    case 'weekendStarted':
      return events.weekendStarted;
    case 'monthStarted':
      return format(events.monthStarted, {
        month: texts.calendar.months[event.month - 1] ?? '',
        year: event.year,
      });
    case 'yearStarted':
      return format(events.yearStarted, { year: event.year });
    case 'monthlyStatement':
      return format(events.monthlyStatement, { balance: formatMoney(event.balance) });
    case 'overdraftStarted':
      return events.overdraftStarted;
    case 'overdraftEnded':
      return events.overdraftEnded;
    case 'loanRepaid':
      return events.loanRepaid;
    case 'renegotiationAvailable':
      return events.renegotiationAvailable;
    case 'loanRefinanced':
      return format(events.loanRefinanced, { fees: formatMoney(event.fees) });
    case 'bankMeetingHeld':
      return format(events.bankMeetingHeld, { trust: Math.round(event.trust) });
    case 'resigned':
      return events.resigned;
    case 'listingPublished':
      return events.listingPublished;
    case 'listingSold':
      return events.listingSold;
    case 'visitDone':
      return events.visitDone;
    case 'visitPlanned':
      return events.visitPlanned;
    case 'offerAnswered':
      if (event.answer === 'accepted') return events.offerAccepted;
      if (event.answer === 'counterOffer') {
        return format(events.offerCountered, { amount: formatMoney(event.amount) });
      }
      return events.offerRefused;
    case 'compromisSigned':
      return format(events.compromisSigned, { price: formatMoney(event.price) });
    case 'loanAnswered':
      return format(events.loanAnswered, { banker: bankerName(event.bankId) });
    case 'purchaseCancelled':
      return events.purchaseCancelled;
    case 'deedSigned':
      return events.deedSigned;
    case 'saleOfferReceived':
      return format(events.saleOfferReceived, { amount: formatMoney(event.amount) });
    case 'saleAgreed':
      return format(events.saleAgreed, { price: formatMoney(event.price) });
    case 'saleFellThrough':
      return events.saleFellThrough;
    case 'propertySold':
      return format(events.propertySold, { net: formatMoney(event.net) });
    case 'marketRateChanged':
    case 'propertyPricesUpdated':
    case 'listingPriceDropped':
    case 'listingWithdrawn':
    case 'visitCancelled':
    case 'offerMade':
    case 'counterOfferExpired':
    case 'counterOfferDeclined':
    case 'compromisImpossible':
    case 'loanRequested':
    case 'loanChosen':
    case 'saleListed':
    case 'saleWithdrawn':
    case 'saleVisit':
    case 'saleVisitMissed':
    case 'saleOfferExpired':
    case 'saleCounterAccepted':
    case 'saleCounterRefused':
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
