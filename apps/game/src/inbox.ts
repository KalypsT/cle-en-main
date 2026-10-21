import { gameContent } from '@cle/content';
import type { GameState, InboxSubject, MailItem, NewsEventType, NewsItem } from '@cle/engine';
import type { Route } from './game/context.tsx';
import {
  bankerName,
  catalogText,
  choiceText,
  describeEvent,
  format,
  formatEuros,
  formatPercent,
  rivalName,
  t,
} from './texts.ts';
import type { IconName } from './ui/Icon.tsx';

export type NewsCategory = keyof typeof t.decisions.newsFilters & string;

/** Filter of the news (docs/04, section 4.10): one per family of the game. */
const NEWS_CATEGORIES: Record<NewsEventType, Exclude<NewsCategory, 'all'>> = {
  listingPriceDropped: 'market',
  listingSold: 'market',
  listingWithdrawn: 'market',
  visitDone: 'market',
  diagnosisDone: 'market',
  offerAnswered: 'market',
  counterOfferExpired: 'market',
  compromisSigned: 'market',
  purchaseCancelled: 'market',
  deedSigned: 'market',
  offMarketOffered: 'market',
  rivalArrived: 'market',
  saleOfferReceived: 'market',
  saleAgreed: 'market',
  saleFellThrough: 'market',
  propertySold: 'market',
  rentalListed: 'rental',
  rentalBlocked: 'rental',
  furnitureBought: 'rental',
  applicationReceived: 'rental',
  rentalVisitMissed: 'rental',
  tenantMovedIn: 'rental',
  tenantGaveNotice: 'rental',
  buyoutAnswered: 'rental',
  tenantLeft: 'rental',
  leaseRenewed: 'rental',
  rentRevised: 'rental',
  tenantLifeEvent: 'rental',
  incidentReported: 'rental',
  incidentRepaired: 'rental',
  rentMissed: 'rental',
  reminderSent: 'rental',
  procedureStarted: 'rental',
  dpeWarning: 'rental',
  movedIntoHome: 'rental',
  movedOutOfHome: 'rental',
  worksDelegated: 'works',
  transformationStarted: 'works',
  transformationCompleted: 'works',
  quoteReceived: 'works',
  worksStarted: 'works',
  worksHazard: 'works',
  worksCompleted: 'works',
  worksFundReturned: 'works',
  renovationAidPaid: 'money',
  coproMeetingCalled: 'works',
  coproMeetingHeld: 'works',
  monthlyStatement: 'money',
  overdraftStarted: 'money',
  overdraftEnded: 'money',
  loanRepaid: 'money',
  renegotiationAvailable: 'money',
  loanRefinanced: 'money',
  bankMeetingHeld: 'money',
  loanAnswered: 'money',
  resigned: 'money',
  companyCreated: 'money',
  propertyTaxCharged: 'money',
  taxAssessed: 'money',
  forcedSale: 'money',
  bankrupt: 'money',
  freshStart: 'money',
  gameOver: 'money',
  catalogEventStarted: 'life',
  catalogEventHappened: 'life',
  catalogEventResolved: 'life',
  anecdote: 'life',
  tripMade: 'life',
  movedCity: 'life',
  titleEarned: 'progress',
  achievementEarned: 'progress',
  challengeOffered: 'progress',
  challengeWon: 'progress',
  challengeLost: 'progress',
};

export const NEWS_FILTERS: readonly NewsCategory[] = [
  'all',
  'market',
  'rental',
  'works',
  'money',
  'life',
  'progress',
];

export function newsCategory(item: NewsItem): Exclude<NewsCategory, 'all'> {
  return NEWS_CATEGORIES[item.event.type];
}

/** The news shown, newest first (a news whose text is empty is left out). */
export function newsLines(state: GameState): { item: NewsItem; text: string }[] {
  const lines: { item: NewsItem; text: string }[] = [];
  for (let i = state.inbox.news.length - 1; i >= 0; i--) {
    const item = state.inbox.news[i];
    if (!item) continue;
    const text = describeEvent(item.event, state, item.subject);
    if (text) lines.push({ item, text });
  }
  return lines;
}

/** The screen of what a news or a letter is about, while it is still there. */
export function subjectRoute(state: GameState, subject: InboxSubject | null): Route | null {
  if (!subject) return null;
  if (state.properties.some((owned) => owned.property.id === subject.propertyId)) {
    return { name: 'property', id: subject.propertyId };
  }
  const purchase = state.purchases.find((p) => p.property.id === subject.propertyId);
  if (purchase) return { name: 'purchase', id: purchase.id };
  if (subject.listingId && state.listings.some((listing) => listing.id === subject.listingId)) {
    return { name: 'listing', id: subject.listingId };
  }
  if (state.soldProperties.some((sold) => sold.property.id === subject.propertyId)) {
    return { name: 'soldProperty', id: subject.propertyId };
  }
  return null;
}

type OfferReply = Extract<MailItem, { kind: 'offerReply' }>;
export type SellerReply = OfferReply & { outcome: Exclude<OfferReply['outcome'], 'accepted'> };

/** The seller's last word on a listing, for its box « Dernière réponse du vendeur ». */
export function sellerReply(state: GameState, listingId: string): SellerReply | undefined {
  return state.inbox.mail.findLast(
    (item): item is SellerReply =>
      item.kind === 'offerReply' && item.listingId === listingId && item.outcome !== 'accepted',
  );
}

export const MAIL_ICONS: Record<MailItem['kind'], IconName> = {
  offerReply: 'tag',
  loanAnswer: 'bank',
  saleReply: 'tag',
  buyout: 'key',
  catalogEvent: 'info',
  copro: 'decisions',
  hazard: 'wrench',
};

/** A bank's answer (a letter, or a line of the bank's history), and the reason of a refusal. */
export function loanAnswerText(
  answer: Pick<
    Extract<MailItem, { kind: 'loanAnswer' }>,
    'bankId' | 'decision' | 'amount' | 'ratePercent' | 'reason' | 'debtRatio'
  >,
): { title: string; details: string[] } {
  const texts = t.decisions.mail;
  const values = {
    banker: bankerName(answer.bankId),
    amount: answer.amount === null ? '' : formatEuros(answer.amount),
    rate: answer.ratePercent === null ? '' : formatPercent(answer.ratePercent),
  };
  const reason = answer.reason
    ? format(texts.loanRefusedBecause, {
        reason: format(t.financing.loanRefusals[answer.reason], {
          ratio: formatPercent((answer.debtRatio ?? 0) * 100),
        }),
      })
    : null;
  return {
    title: format(texts.loanAnswer[answer.decision], values),
    details: reason ? [reason] : [],
  };
}

/** A letter's title, and its details (the reason, the text of the event, the verdicts). */
export function mailText(state: GameState, item: MailItem): { title: string; details: string[] } {
  const texts = t.decisions.mail;
  switch (item.kind) {
    case 'offerReply':
      return {
        title: format(texts.offerReply[item.outcome], { amount: formatEuros(item.amount) }),
        details: [],
      };
    case 'loanAnswer':
      return loanAnswerText(item);
    case 'saleReply':
      return {
        title: format(texts.saleReply[item.outcome], {
          buyer: item.buyerId ? rivalName(item.buyerId) : texts.household,
          amount: formatEuros(item.amount),
        }),
        details: [],
      };
    case 'buyout':
      return {
        title: format(item.accepted ? texts.buyout.accepted : texts.buyout.refused, {
          amount: formatEuros(item.amount),
        }),
        details: [],
      };
    case 'catalogEvent': {
      const outcome = choiceText(state, item.event, item.choiceId, 'outcome');
      return {
        title: format(texts.catalogEvent, {
          choice: choiceText(state, item.event, item.choiceId) ?? '',
        }),
        details: [catalogText(state, item.event), ...(outcome ? [outcome] : [])],
      };
    }
    case 'copro': {
      const works = gameContent.worksTexts;
      return {
        title: format(texts.copro, {
          passed: item.results.filter((result) => result.passed).length,
          count: item.results.length,
        }),
        details: item.results.map((result) =>
          format(texts.coproLine, {
            resolution: works.resolutions[result.id] ?? result.id,
            verdict:
              (result.passed ? works.meetingPassed : works.meetingRejected)[result.textIndex] ?? '',
          }),
        ),
      };
    }
    case 'hazard':
      return {
        title: format(texts.hazard[item.choice], { amount: formatEuros(item.cost) }),
        details: [gameContent.worksTexts.hazards[item.hazardId] ?? ''].filter(Boolean),
      };
  }
}
