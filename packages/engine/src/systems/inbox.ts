import type { GameContent } from '../content.ts';
import { type GameEvent, NEWS_EVENT_TYPES, type NewsEvent } from '../events.ts';
import type { RefusalCode } from '../actions.ts';
import { deepClone } from '../clone.ts';
import type { GameState, InboxSubject, MailContent, Property } from '../state.ts';

const NEWS_TYPES: ReadonlySet<GameEvent['type']> = new Set(NEWS_EVENT_TYPES);
/** Changes of a listing, news only for a listing the player follows. */
const FOLLOWED_ONLY: ReadonlySet<GameEvent['type']> = new Set([
  'listingSold',
  'listingWithdrawn',
  'listingPriceDropped',
]);

export function emptyInbox(): GameState['inbox'] {
  return { news: [], newsSeenId: 0, mail: [], nextId: 1 };
}

/**
 * Keeps the news and the mail of `events` (docs/04, section 4.10), then forgets what is
 * past the limits of content/rythme.json. `before` is the state before the events: what
 * they are about may be gone from `state` (a listing sold, a property sold).
 */
export function recordInbox(
  content: GameContent,
  state: GameState,
  before: GameState,
  events: readonly GameEvent[],
  today: number,
): void {
  const { inbox } = state;
  const added = inbox.nextId;
  for (const event of events) {
    if (isNews(event, before)) {
      inbox.news.push({
        id: inbox.nextId++,
        day: today,
        // A copy: the event may share objects with the state (a pending catalogue event).
        event: deepClone(event),
        subject: eventSubject(state, before, event),
      });
    }
    const letter = mailOf(event, state, before);
    if (letter) {
      const subject = eventSubject(state, before, event);
      inbox.mail.push({ ...letter, id: inbox.nextId++, day: today, subject, dismissed: false });
    }
  }
  const limits = content.rhythm.inbox;
  const newsFrom = today - limits.newsKeptDays;
  if (inbox.nextId !== added || inbox.news.some((item) => item.day < newsFrom)) {
    inbox.news = inbox.news.filter((item) => item.day >= newsFrom).slice(-limits.newsKept);
  }
  const mailFrom = today - limits.mailKeptDays;
  if (inbox.nextId !== added || inbox.mail.some((item) => item.day < mailFrom)) {
    const mail = inbox.mail.filter((item) => item.day >= mailFrom);
    // Over the limit, the oldest closed letters go first, then the oldest ones.
    let excess = mail.length - limits.mailKept;
    const kept = mail.filter((item) => {
      if (excess <= 0 || !item.dismissed) return true;
      excess--;
      return false;
    });
    inbox.mail = kept.slice(-limits.mailKept);
  }
}

/**
 * Freezes what is kept and never changes (news, mail, archives, bank logs): the daily copy
 * of the state then shares it.
 */
export function freezeInbox(state: GameState): void {
  for (const item of state.inbox.news) deepFreeze(item);
  for (const item of state.inbox.mail) deepFreeze(item);
  for (const sold of state.soldProperties) deepFreeze(sold);
  for (const loan of state.closedLoans) deepFreeze(loan);
  for (const relation of Object.values(state.banks)) {
    for (const entry of relation.log) deepFreeze(entry);
    for (const point of relation.trustHistory) deepFreeze(point);
  }
}

function deepFreeze(value: object): void {
  if (Object.isFrozen(value)) return;
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === 'object') deepFreeze(child as object);
  }
  Object.freeze(value);
}

/** Closes one letter, or all of them (`null`). */
export function dismissMail(state: GameState, mailId: number | null): RefusalCode | null {
  const { inbox } = state;
  if (mailId !== null && !inbox.mail.some((item) => item.id === mailId)) return 'mail.unknown';
  inbox.mail = inbox.mail.map((item) =>
    (mailId === null || item.id === mailId) && !item.dismissed
      ? { ...item, dismissed: true }
      : item,
  );
  return null;
}

/** The player has seen every news so far. */
export function markNewsSeen(state: GameState): RefusalCode | null {
  const last = state.inbox.news.at(-1);
  if (last) state.inbox.newsSeenId = Math.max(state.inbox.newsSeenId, last.id);
  return null;
}

function isNews(event: GameEvent, before: GameState): event is NewsEvent {
  if (!NEWS_TYPES.has(event.type)) return false;
  if (FOLLOWED_ONLY.has(event.type) && 'listingId' in event) {
    return isFollowed(before, event.listingId);
  }
  return true;
}

/** A favourite, or a listing the player made an offer on. */
function isFollowed(state: GameState, listingId: string): boolean {
  if (state.favorites.includes(listingId)) return true;
  const listing = state.listings.find((candidate) => candidate.id === listingId);
  return (listing?.offersMade ?? 0) > 0;
}

/** The letter an event leaves, if any. */
function mailOf(event: GameEvent, state: GameState, before: GameState): MailContent | null {
  switch (event.type) {
    case 'offerAnswered':
      if (event.answer === 'counterOffer') return null; // a decision, until it is settled
      return {
        kind: 'offerReply',
        listingId: event.listingId,
        outcome: event.answer,
        amount: event.answer === 'accepted' ? event.price : event.amount,
      };
    case 'counterOfferExpired':
      return {
        kind: 'offerReply',
        listingId: event.listingId,
        outcome: 'counterExpired',
        amount: event.amount,
      };
    case 'counterOfferDeclined': {
      const listing = before.listings.find((candidate) => candidate.id === event.listingId);
      const amount = listing?.offer?.counter?.amount;
      if (amount === undefined) return null;
      return { kind: 'offerReply', listingId: event.listingId, outcome: 'counterDeclined', amount };
    }
    case 'loanAnswered':
      return loanAnswerOf(event, state, before);
    case 'saleCounterAccepted':
    case 'saleCounterRefused':
    case 'saleOfferExpired': {
      const sale = before.properties.find((o) => o.property.id === event.propertyId)?.sale;
      const offer = sale?.offers.find((candidate) => candidate.id === event.offerId);
      if (!offer) return null;
      const expired = event.type === 'saleOfferExpired';
      return {
        kind: 'saleReply',
        buyerId: offer.buyerId,
        outcome: expired
          ? 'expired'
          : event.type === 'saleCounterAccepted'
            ? 'counterAccepted'
            : 'counterRefused',
        amount: expired ? offer.amount : (offer.counterAmount ?? offer.amount),
      };
    }
    case 'buyoutAnswered':
      return { kind: 'buyout', amount: event.amount, accepted: event.accepted };
    case 'catalogEventResolved':
      return {
        kind: 'catalogEvent',
        event: deepClone(event.event),
        choiceId: event.choiceId,
        auto: event.auto,
      };
    case 'coproMeetingHeld':
      return { kind: 'copro', results: event.results.map((result) => ({ ...result })) };
    case 'worksHazardResolved': {
      const works = before.properties.find((o) => o.property.id === event.propertyId)?.works;
      const hazard = works?.hazard;
      return {
        kind: 'hazard',
        hazardId: event.hazardId,
        choice: event.choice,
        cost: hazard?.hazardId === event.hazardId ? hazard.cost : 0,
      };
    }
    default:
      return null;
  }
}

/** A bank's answer, with the debt ratio of a refusal on that ground (read on the application). */
export function loanAnswerOf(
  event: Extract<GameEvent, { type: 'loanAnswered' }>,
  state: GameState,
  before: GameState,
): Extract<MailContent, { kind: 'loanAnswer' }> {
  const decision = [...state.purchases, ...before.purchases]
    .find((purchase) => purchase.id === event.purchaseId)
    ?.applications.find((application) => application.id === event.applicationId)?.decision;
  return {
    kind: 'loanAnswer',
    bankId: event.bankId,
    decision: event.decision,
    reason: event.reason ?? null,
    debtRatio: decision?.decision === 'refused' ? (decision.debtRatioAfter ?? null) : null,
    amount: event.amount ?? null,
    ratePercent: event.ratePercent ?? null,
  };
}

/** What an event is about: a listing, a purchase or a property, looked up now, then before. */
export function eventSubject(
  state: GameState,
  before: GameState,
  event: GameEvent,
): InboxSubject | null {
  if ('listingId' in event)
    return listingSubject(state, event.listingId) ?? listingSubject(before, event.listingId);
  if ('purchaseId' in event) {
    return purchaseSubject(state, event.purchaseId) ?? purchaseSubject(before, event.purchaseId);
  }
  const propertyId =
    'propertyId' in event
      ? event.propertyId
      : event.type === 'catalogEventStarted' ||
          event.type === 'catalogEventHappened' ||
          event.type === 'catalogEventResolved'
        ? event.event.propertyId
        : event.type === 'anecdote'
          ? event.anecdote.propertyId
          : null;
  if (propertyId === null) return null;
  return propertySubject(state, propertyId) ?? propertySubject(before, propertyId);
}

function listingSubject(state: GameState, listingId: string): InboxSubject | null {
  const listing = state.listings.find((candidate) => candidate.id === listingId);
  return listing ? subjectOf(listing.property, listingId) : null;
}

function purchaseSubject(state: GameState, purchaseId: string): InboxSubject | null {
  const purchase = state.purchases.find((candidate) => candidate.id === purchaseId);
  return purchase ? subjectOf(purchase.property, purchase.listingId) : null;
}

function propertySubject(state: GameState, propertyId: string): InboxSubject | null {
  const owned = state.properties.find((candidate) => candidate.property.id === propertyId);
  if (owned) return subjectOf(owned.property, null);
  const purchase = state.purchases.find((candidate) => candidate.property.id === propertyId);
  return purchase ? subjectOf(purchase.property, purchase.listingId) : null;
}

export function subjectOf(property: Property, listingId: string | null): InboxSubject {
  return {
    propertyId: property.id,
    listingId,
    kind: property.kind,
    rooms: property.rooms,
    surface: property.surface,
    lots: property.lots.length,
    cityId: property.cityId,
    neighbourhoodId: property.neighbourhoodId,
  };
}
