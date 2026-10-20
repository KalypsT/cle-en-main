import { gameContent, screenTexts, uiTexts } from '@cle/content';
import {
  type AnecdoteNote,
  type CalendarDate,
  type CatalogEventInstance,
  type Cents,
  type ChronicleEntry,
  fromDayNumber,
  type GameEvent,
  type GameState,
  NO_CHOICE,
  type Property,
  toDayNumber,
  weekdayOf,
} from '@cle/engine';

/** Every displayed text comes from content/textes/ (interface.json, ecrans.json). */
export const texts = uiTexts;
/** Texts of the management screens (content/textes/ecrans.json). */
export const t = screenTexts;

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

const euroFormat = new Intl.NumberFormat('fr-FR', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 0,
});
const kiloFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const decimalFormat = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 });

/** Whole euros: « 72 000 € ». */
export function formatEuros(amount: Cents): string {
  return euroFormat.format(Math.round(amount / 100));
}

/** Short amount for pins and tiles: « 72 k€ ». */
export function formatKilo(amount: Cents): string {
  return format(t.common.kiloEuros, { amount: kiloFormat.format(amount / 100_000) });
}

/** Signed whole euros: « +180 € », « −50 € ». */
export function formatSigned(amount: Cents): string {
  const sign = amount > 0 ? t.common.plus : amount < 0 ? t.common.minus : '';
  return format(t.common.signedAmount, { sign, amount: formatEuros(Math.abs(amount)) });
}

/** A number with at most one decimal (yields, ratios). */
export function formatDecimal(value: number): string {
  return decimalFormat.format(value);
}

/** Tone of an amount, for its colour (always with a sign or a text). */
export function tone(amount: number): 'positive' | 'negative' | '' {
  return amount > 0 ? 'positive' : amount < 0 ? 'negative' : '';
}

const shortDateFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});
const shortWeekdayFormat = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function utc(date: CalendarDate): number {
  return Date.UTC(date.year, date.month - 1, date.day);
}

/** « 3 nov. », for a game day number. */
export function formatDay(day: number): string {
  return shortDateFormat.format(utc(fromDayNumber(day)));
}

const dayYearFormat = new Intl.DateTimeFormat('fr-FR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** « 18 nov. 2026 », for dates in tables. */
export function formatDayYear(day: number): string {
  return dayYearFormat.format(utc(fromDayNumber(day)));
}

/** « sam. 18 oct. 2026 », for the status bar. */
export function formatShortDate(date: CalendarDate): string {
  return shortWeekdayFormat.format(utc(date));
}

/** Long date of a day number: « mardi 3 novembre 2026 ». */
export function formatDayLong(day: number): string {
  return formatGameDate(fromDayNumber(day));
}

/** « aujourd'hui », « demain », « dans 3 j », « échu ». */
export function formatWhen(day: number, today: CalendarDate): string {
  const days = day - toDayNumber(today);
  if (days < 0) return t.common.overdue;
  if (days === 0) return t.common.today;
  if (days === 1) return t.common.tomorrow;
  return format(t.common.inDays, { days });
}

export function jobName(jobId: string): string {
  return gameContent.jobs.find((job) => job.id === jobId)?.name ?? jobId;
}

export function bankName(bankId: string): string {
  return gameContent.banks.find((bank) => bank.id === bankId)?.name ?? bankId;
}

export function agencyName(agencyId: string): string {
  return gameContent.renting.agencies.find((agency) => agency.id === agencyId)?.name ?? agencyId;
}

export function artisanName(artisanId: string): string {
  return gameContent.artisans.find((artisan) => artisan.id === artisanId)?.name ?? artisanId;
}

export function tradeName(trade: string): string {
  return (gameContent.trades as Record<string, string>)[trade] ?? trade;
}

export function cityName(cityId: string): string {
  return gameContent.cities[cityId]?.name ?? cityId;
}

export function neighbourhoodName(cityId: string, neighbourhoodId: string): string {
  return (
    gameContent.cities[cityId]?.neighbourhoods.find((n) => n.id === neighbourhoodId)?.name ??
    neighbourhoodId
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase('fr-FR') + text.slice(1);
}

/** « T2 », « Maison 4 p. »: the short label of a dwelling. */
export function propertyShortLabel(property: Property): string {
  if (property.kind === 'apartment') return `T${property.rooms}`;
  if (property.kind === 'building') {
    return format(t.listing.lots, { count: property.lots.length });
  }
  if (property.kind === 'house') {
    return `${t.listings.kindShort.house} ${format(t.common.rooms, { rooms: property.rooms })}`;
  }
  // A shop, a parking space or a plot: its kind and its area.
  return `${t.listings.kindShort[property.kind]} ${format(t.common.surface, { surface: property.surface })}`;
}

/** « T2 · Centre historique ». */
export function propertyLabel(property: Property): string {
  return `${propertyShortLabel(property)} · ${neighbourhoodName(property.cityId, property.neighbourhoodId)}`;
}

/** The listing's catchy title (content/textes/annonces.json). */
export function listingTitle(titleId: string, property: Property): string {
  const title = gameContent.listingTexts.titles.find((candidate) => candidate.id === titleId);
  const kind = gameContent.listingTexts.kinds[property.kind];
  if (!title) return capitalize(kind);
  return capitalize(
    format(title.text, {
      kind,
      neighbourhood: neighbourhoodName(property.cityId, property.neighbourhoodId),
      rooms: property.rooms,
      surface: property.surface,
    }),
  );
}

/** Name of a room: « Chambre 2 » for `bedroom2`. */
export function spaceName(property: Property, spaceId: string): string {
  const space = property.spaces.find((candidate) => candidate.id === spaceId);
  const name = space ? (gameContent.worksTexts.spaces[space.kind] ?? space.kind) : spaceId;
  const number = /(\d+)$/.exec(spaceId)?.[1];
  return number ? format(t.property.spaceNumbered, { space: name, number }) : name;
}

export function itemName(kind: string): string {
  return (gameContent.worksTexts.items as Record<string, string>)[kind] ?? kind;
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

export function titleName(titleId: string): string {
  return gameContent.titles.find((title) => title.id === titleId)?.name ?? titleId;
}

export function achievementName(achievementId: string): string {
  return gameContent.achievements.find((a) => a.id === achievementId)?.name ?? achievementId;
}

export function findChallenge(challengeId: string) {
  return gameContent.challenges.challenges.find((challenge) => challenge.id === challengeId);
}

export function giverName(challengeId: string): string {
  const challenge = findChallenge(challengeId);
  return challenge ? gameContent.challenges.givers[challenge.giver] : challengeId;
}

export function findCatalogEvent(eventId: string) {
  return gameContent.events.find((event) => event.id === eventId);
}

/** Values of the variables of an event or an anecdote (docs/03-systemes/07). */
function catalogValues(
  state: GameState | undefined,
  note: Pick<CatalogEventInstance, 'vars' | 'propertyId'>,
  amount: Cents | undefined,
): Record<string, string> {
  const { events } = texts;
  const property = note.propertyId
    ? state?.properties.find((owned) => owned.property.id === note.propertyId)?.property
    : undefined;
  const account = gameContent.start.accountBankId;
  return {
    bien: property ? propertyLabel(property) : events.yourProperty,
    locataire: note.vars.tenant ?? events.yourTenant,
    quartier: neighbourhoodName(note.vars.cityId, note.vars.neighbourhoodId),
    ville: cityName(note.vars.cityId),
    artisan: note.vars.artisanId ? artisanName(note.vars.artisanId) : events.theArtisan,
    banquier: bankerName(account),
    rival: rivalName(note.vars.rivalId),
    montant: formatEuros(Math.abs(amount ?? 0)),
  };
}

/** The text of a catalogue event, its variables filled in. */
export function catalogText(state: GameState | undefined, instance: CatalogEventInstance): string {
  const event = findCatalogEvent(instance.eventId);
  const template = event?.texts[instance.textIndex] ?? event?.texts[0] ?? '';
  return format(template, catalogValues(state, instance, instance.amounts[NO_CHOICE]));
}

/** A choice's label (or outcome) with its amount. */
export function choiceText(
  state: GameState | undefined,
  instance: CatalogEventInstance,
  choiceId: string,
  field: 'label' | 'outcome' = 'label',
): string | null {
  const choice = findCatalogEvent(instance.eventId)?.choices?.find((c) => c.id === choiceId);
  const template = choice?.[field];
  return template
    ? format(template, catalogValues(state, instance, instance.amounts[choiceId]))
    : null;
}

export function anecdoteText(state: GameState | undefined, note: AnecdoteNote): string {
  const anecdote = gameContent.anecdotes.find((a) => a.id === note.anecdoteId);
  const template = anecdote?.texts[note.textIndex] ?? anecdote?.texts[0] ?? '';
  return format(template, catalogValues(state, note, 0));
}

/** A line of the career chronicle. */
export function chronicleText(entry: ChronicleEntry): string {
  const templates = t.chronicle;
  const values = {
    amount: entry.amount === null ? '' : formatEuros(Math.abs(entry.amount)),
    title: entry.ref ? titleName(entry.ref) : '',
    achievement: entry.ref ? achievementName(entry.ref) : '',
    giver: entry.ref ? giverName(entry.ref) : '',
    event: entry.ref ? (findCatalogEvent(entry.ref)?.texts[0] ?? '') : '',
    date: entry.ref ?? '',
  };
  if (entry.kind === 'majorEvent') {
    return format(values.event, { ville: cityName(gameContent.start.cityId) });
  }
  if (entry.kind === 'rewind' && entry.ref) {
    const date = /^(\d+)-(\d+)-(\d+)$/.exec(entry.ref);
    if (date) {
      values.date = formatGameDate({
        year: Number(date[1]),
        month: Number(date[2]),
        day: Number(date[3]),
      });
    }
  }
  return format(templates[entry.kind], values);
}

/** Text for an engine event, or null when the event is not shown to the player. */
export function describeEvent(event: GameEvent, state?: GameState): string | null {
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
    case 'worksDelegated':
      return format(events.worksDelegated, { amount: formatMoney(event.fee) });
    case 'transformationStarted':
      return format(events.transformationStarted, {
        kind: t.transformation.kinds[event.kind],
        date: formatDayLong(event.endDay),
      });
    case 'transformationCompleted':
      return format(events.transformationCompleted, {
        kind: t.transformation.kinds[event.kind],
        amount: formatMoney(event.cost),
      });
    case 'companyCreated':
      return format(events.companyCreated, { amount: formatMoney(event.cost) });
    case 'purchaseHolderSet':
      return null;
    case 'rivalArrived':
      return format(events.rivalArrived, { rival: rivalName(event.rivalId) });
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
      // A negotiated departure is told by its answer.
      return event.reason === 'buyout' ? null : events.tenantGaveNotice;
    case 'buyoutAnswered': {
      const leaveDay = state?.properties.find((o) => o.property.id === event.propertyId)?.lease
        ?.noticeEndDay;
      return event.accepted
        ? format(events.buyoutAccepted, {
            amount: formatEuros(event.amount),
            date: leaveDay ? formatDayLong(leaveDay) : '',
          })
        : format(events.buyoutRefused, { amount: formatEuros(event.amount) });
    }
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
      if (event.wealthTax > 0) {
        return format(events.wealthTax, { year: event.year, amount: formatMoney(event.wealthTax) });
      }
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
    case 'freshStart':
      return format(events.freshStart, { savings: formatMoney(event.savings) });
    case 'gameOver':
      return events.gameOver;
    case 'titleEarned':
      return format(events.titleEarned, { title: titleName(event.titleId) });
    case 'achievementEarned':
      return format(events.achievementEarned, {
        achievement: achievementName(event.achievementId),
      });
    case 'challengeOffered':
      return format(events.challengeOffered, { giver: giverName(event.challengeId) });
    case 'challengeWon':
      return format(events.challengeWon, { text: findChallenge(event.challengeId)?.success ?? '' });
    case 'challengeLost':
      return format(events.challengeLost, {
        text: findChallenge(event.challengeId)?.failure ?? '',
      });
    case 'catalogEventStarted':
    case 'catalogEventHappened':
      return catalogText(state, event.event);
    case 'catalogEventResolved':
      return choiceText(state, event.event, event.choiceId, 'outcome');
    case 'anecdote':
      return anecdoteText(state, event.anecdote);
    case 'offMarketOffered':
      return events.offMarketOffered;
    case 'bankMeetingPlanned':
      return format(events.bankMeetingPlanned, { banker: bankerName(event.bankId) });
    case 'selfRepairPlanned':
      return events.selfRepairPlanned;
    case 'tripMade':
      return format(events.tripMade, {
        city: cityName(event.cityId),
        duration: formatDuration(event.minutes),
        cost: formatMoney(event.cost),
      });
    case 'movedCity':
      return format(events.movedCity, {
        city: cityName(event.cityId),
        rent: formatMoney(event.monthlyRent),
        cost: formatMoney(event.cost),
      });
    case 'reputationChanged':
    case 'renownChanged':
    case 'challengeAccepted':
    case 'challengeDeclined':
    case 'agendaMoved':
    case 'agendaCancelled':
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

const longDateFormat = new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' });

/** Real-world date and time of the build (« 20 octobre 2026 à 14:32 »). */
export function formatBuildDate(timestamp: number): string {
  return format(t.settings.buildDate, {
    date: longDateFormat.format(timestamp),
    time: realTimeFormat.format(timestamp),
  });
}
