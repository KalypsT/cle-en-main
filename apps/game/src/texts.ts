import { gameContent, uiTexts } from '@cle/content';
import {
  type CalendarDate,
  type Cents,
  fromDayNumber,
  type GameEvent,
  weekdayOf,
} from '@cle/engine';

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

export function rivalName(rivalId: string): string {
  return gameContent.rivals.find((rival) => rival.id === rivalId)?.name ?? rivalId;
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
      return event.buyer === 'rival'
        ? format(events.listingSoldToRival, { rival: rivalName(event.rivalId) })
        : events.listingSold;
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
      return event.buyerId
        ? format(events.saleOfferFromRival, {
            rival: rivalName(event.buyerId),
            amount: formatMoney(event.amount),
          })
        : format(events.saleOfferReceived, { amount: formatMoney(event.amount) });
    case 'saleAgreed':
      return format(events.saleAgreed, { price: formatMoney(event.price) });
    case 'saleFellThrough':
      return events.saleFellThrough;
    case 'propertySold':
      return format(events.propertySold, { net: formatMoney(event.net) });
    case 'rentalListed':
      return format(events.rentalListed, { rent: formatMoney(event.monthlyRent) });
    case 'rentalBlocked':
      return events.rentalBlocked;
    case 'furnitureBought':
      return format(events.furnitureBought, { cost: formatMoney(event.cost) });
    case 'applicationReceived':
      return events.applicationReceived;
    case 'rentalVisitMissed':
      return events.rentalVisitMissed;
    case 'tenantMovedIn':
      return format(events.tenantMovedIn, {
        tenant: event.tenantName,
        rent: formatMoney(event.monthlyRent),
      });
    case 'tenantGaveNotice':
      return events.tenantGaveNotice;
    case 'tenantLeft':
      return event.reason === 'evicted' ? events.tenantEvicted : events.tenantLeft;
    case 'rentRevised':
      return format(events.rentRevised, { rent: formatMoney(event.monthlyRent) });
    case 'tenantLifeEvent':
      return gameContent.tenantTexts.lifeEvents[event.eventId] ?? null;
    case 'incidentReported':
      return gameContent.tenantTexts.incidents[event.kindId] ?? events.incidentReported;
    case 'incidentRepaired':
      return format(events.incidentRepaired, { cost: formatMoney(event.cost) });
    case 'rentMissed':
      return event.insured ? events.rentMissedInsured : events.rentMissed;
    case 'reminderSent':
      return event.settled ? events.reminderSettled : events.reminderFailed;
    case 'procedureStarted':
      return events.procedureStarted;
    case 'dpeWarning':
      return format(events.dpeWarning, { date: formatGameDate(fromDayNumber(event.banDay)) });
    case 'movedIntoHome':
      return events.movedIntoHome;
    case 'movedOutOfHome':
      return events.movedOutOfHome;
    case 'propertyTaxCharged':
      return format(events.propertyTaxCharged, { amount: formatMoney(event.amount) });
    case 'taxAssessed':
      if (event.total === 0) return null;
      return event.total > 0
        ? format(events.taxAssessed, { year: event.year, amount: formatMoney(event.total) })
        : format(events.taxRefund, { year: event.year, amount: formatMoney(-event.total) });
    case 'forcedSale':
      return format(events.forcedSale, { price: formatMoney(event.price) });
    case 'bankrupt':
      return events.bankrupt;
    case 'quoteReceived':
      return format(events.quoteReceived, {
        amount: formatMoney(event.total),
        date: formatGameDate(fromDayNumber(event.availableDay)),
      });
    case 'worksStarted':
      return format(events.worksStarted, {
        amount: formatMoney(event.plannedCost),
        date: formatGameDate(fromDayNumber(event.plannedEndDay)),
      });
    case 'worksHazard':
      return format(events.worksHazard, {
        text: gameContent.worksTexts.hazards[event.hazardId] ?? '',
        amount: formatMoney(event.cost),
        days: event.days,
        date: formatGameDate(fromDayNumber(event.deadlineDay)),
      });
    case 'worksCompleted':
      return format(events.worksCompleted, {
        amount: formatMoney(event.cost),
        before: event.dpeBefore,
        after: event.dpeAfter,
      });
    case 'worksFundReturned':
      return format(events.worksFundReturned, { amount: formatMoney(event.amount) });
    case 'coproMeetingCalled':
      return format(events.coproMeetingCalled, {
        date: formatGameDate(fromDayNumber(event.voteDay)),
        count: event.resolutions.length,
      });
    case 'coproMeetingHeld': {
      const result = event.results[0];
      if (!result) return null;
      const verdicts = result.passed
        ? gameContent.worksTexts.meetingPassed
        : gameContent.worksTexts.meetingRejected;
      return format(events.coproMeetingHeld, {
        resolution: gameContent.worksTexts.resolutions[result.id] ?? result.id,
        verdict: verdicts[result.textIndex] ?? '',
      });
    }
    case 'diagnosisDone':
      return format(events.diagnosisDone, {
        count: event.revealedItems.length,
        amount: formatMoney(event.cost),
      });
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
    case 'rentalWithdrawn':
    case 'applicationExpired':
    case 'leaseRenewed':
    case 'worksTaskStarted':
    case 'worksTaskDone':
    case 'worksHazardResolved':
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
