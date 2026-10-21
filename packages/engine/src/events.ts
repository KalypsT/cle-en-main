import type { CalendarDate, Weekday } from './calendar.ts';
import type { Cents } from './money.ts';
import type { DpeLabel, LeaseType, Trade } from './content.ts';
import type {
  AnecdoteNote,
  CatalogEventInstance,
  Holder,
  SaleMode,
  TransformationKind,
} from './state.ts';
import type { LoanDecision, LoanRefusalCode } from './systems/banking.ts';
import type { LettingBlock } from './systems/renting.ts';

export type StatementLine =
  | { kind: 'salary'; amount: Cents }
  | { kind: 'rent'; amount: Cents }
  /** Rent and recoverable charges of a let property (paid by the tenant or the insurer). */
  | { kind: 'rentalIncome'; propertyId: string; amount: Cents }
  | { kind: 'propertyCharges'; propertyId: string; amount: Cents }
  /** Landlord insurance and unpaid-rent insurance. */
  | { kind: 'ownerInsurance'; propertyId: string; amount: Cents }
  | { kind: 'managementFees'; propertyId: string; amount: Cents }
  | { kind: 'legalCosts'; propertyId: string; amount: Cents }
  /** Call for funds voted by a co-ownership. */
  | { kind: 'coproCall'; propertyId: string; amount: Cents }
  | { kind: 'taxInstalment'; amount: Cents }
  | { kind: 'taxRefund'; amount: Cents }
  | { kind: 'livingCosts'; amount: Cents }
  | { kind: 'loanPayment'; loanId: string; amount: Cents; interest: Cents; capital: Cents }
  /** Monthly fee for a property of another city managed without an agency. */
  | { kind: 'remoteManagement'; propertyId: string; amount: Cents }
  | { kind: 'overdraftInterest'; amount: Cents };

/**
 * Output events emitted by `tick` and `dispatch`. Within one tick, calendar
 * events come first (dayStarted, weekendStarted, monthStarted, yearStarted),
 * then the events of each system in their fixed order.
 */
export type GameEvent =
  | { type: 'dayStarted'; date: CalendarDate; weekday: Weekday; isWeekend: boolean }
  | { type: 'weekendStarted'; date: CalendarDate }
  | { type: 'monthStarted'; year: number; month: number }
  | { type: 'yearStarted'; year: number }
  | { type: 'marketRateChanged'; ratePercent: number }
  /** Monthly flows of the current account; amounts are positive, `lines` say which way. */
  | { type: 'monthlyStatement'; lines: StatementLine[]; balance: Cents }
  | { type: 'overdraftStarted'; balance: Cents }
  | { type: 'overdraftEnded' }
  | { type: 'loanRepaid'; loanId: string }
  | {
      type: 'renegotiationAvailable';
      loanId: string;
      currentRatePercent: number;
      marketOfferPercent: number;
    }
  | { type: 'loanRefinanced'; oldLoanId: string; newLoanId: string; fees: Cents }
  | { type: 'bankMeetingHeld'; bankId: string; trust: number }
  | { type: 'resigned' }
  /** Works handed to the project manager (milestone 8): his fee is paid. */
  | { type: 'worksDelegated'; propertyId: string; fee: Cents }
  | {
      type: 'transformationStarted';
      propertyId: string;
      kind: TransformationKind;
      total: Cents;
      endDay: number;
    }
  /** The transformation is done: `propertyIds` are what it produced (the flats of a division). */
  | {
      type: 'transformationCompleted';
      propertyId: string;
      kind: TransformationKind;
      cost: Cents;
      propertyIds: string[];
    }
  /** A late rival (the SCI Horizon) enters the market (milestone 8). */
  | { type: 'rivalArrived'; rivalId: string }
  /** The player created his SCI (milestone 8). */
  | { type: 'companyCreated'; cost: Cents }
  | { type: 'purchaseHolderSet'; purchaseId: string; holder: Holder }
  // Market (docs/03-systemes/03).
  | { type: 'propertyPricesUpdated' }
  | { type: 'listingPublished'; listingId: string }
  | { type: 'listingPriceDropped'; listingId: string; askingPrice: Cents }
  | { type: 'listingSold'; listingId: string; buyer: 'other' }
  | { type: 'listingSold'; listingId: string; buyer: 'rival'; rivalId: string }
  | { type: 'listingWithdrawn'; listingId: string }
  | { type: 'visitPlanned'; listingId: string; day: number }
  | { type: 'visitDone'; listingId: string; revealedDefects: string[]; revealedItems: string[] }
  | {
      type: 'diagnosisDone';
      listingId: string;
      trade: Trade;
      revealedItems: string[];
      cost: Cents;
    }
  | { type: 'visitCancelled'; listingId: string; day: number }
  | { type: 'offerMade'; listingId: string; amount: Cents; responseDay: number }
  | { type: 'offerAnswered'; listingId: string; answer: 'accepted'; price: Cents }
  | { type: 'offerAnswered'; listingId: string; answer: 'counterOffer'; amount: Cents }
  | { type: 'offerAnswered'; listingId: string; answer: 'refused'; amount: Cents }
  | { type: 'counterOfferExpired'; listingId: string; amount: Cents }
  | { type: 'counterOfferDeclined'; listingId: string }
  | { type: 'compromisImpossible'; listingId: string; deposit: Cents }
  | {
      type: 'compromisSigned';
      purchaseId: string;
      listingId: string;
      price: Cents;
      deposit: Cents;
      loanDeadlineDay: number;
      deedDay: number;
    }
  | {
      type: 'loanRequested';
      purchaseId: string;
      applicationId: string;
      bankId: string;
      responseDay: number;
    }
  | {
      type: 'loanAnswered';
      purchaseId: string;
      applicationId: string;
      bankId: string;
      decision: LoanDecision['decision'];
      reason?: LoanRefusalCode;
      amount?: Cents;
      ratePercent?: number;
    }
  | { type: 'loanChosen'; purchaseId: string; applicationId: string }
  | {
      type: 'purchaseCancelled';
      purchaseId: string;
      reason: 'noLoan' | 'fundsMissing' | 'withdrawn';
      depositRefunded: Cents;
    }
  | {
      type: 'deedSigned';
      purchaseId: string;
      propertyId: string;
      price: Cents;
      notaryFees: Cents;
      bankFees: Cents;
      loanId: string | null;
      discoveredDefects: string[];
      /** Items whose state the new owner discovers. */
      discoveredItems: string[];
      /** Part of the loan kept for the works. */
      worksEnvelope: Cents;
    }
  // Resale.
  | { type: 'saleListed'; propertyId: string; askingPrice: Cents; mode: SaleMode }
  | { type: 'saleWithdrawn'; propertyId: string }
  | { type: 'saleVisit'; propertyId: string }
  | { type: 'saleVisitMissed'; propertyId: string }
  | {
      type: 'saleOfferReceived';
      propertyId: string;
      offerId: string;
      amount: Cents;
      buyerId: string | null;
    }
  | { type: 'saleOfferExpired'; propertyId: string; offerId: string }
  | { type: 'saleCounterAccepted'; propertyId: string; offerId: string }
  | { type: 'saleCounterRefused'; propertyId: string; offerId: string }
  | { type: 'saleAgreed'; propertyId: string; price: Cents; deedDay: number }
  | { type: 'saleFellThrough'; propertyId: string }
  | {
      type: 'propertySold';
      propertyId: string;
      cityId: string;
      price: Cents;
      agencyFees: Cents;
      loanRepaid: Cents;
      loanFees: Cents;
      capitalGainsTax: Cents;
      depositTransferred: Cents;
      net: Cents;
      /** Price net of fees, minus the cost of the property and of its works (the record). */
      gain: Cents;
    }
  // Renting (docs/03-systemes/04).
  | {
      type: 'rentalListed';
      propertyId: string;
      leaseType: LeaseType;
      monthlyRent: Cents;
      agencyId: string | null;
      insured: boolean;
    }
  | { type: 'rentalWithdrawn'; propertyId: string }
  | { type: 'rentalBlocked'; propertyId: string; reason: LettingBlock }
  | { type: 'furnitureBought'; propertyId: string; cost: Cents }
  | { type: 'applicationReceived'; propertyId: string; applicationId: string }
  | { type: 'applicationExpired'; propertyId: string; applicationId: string }
  | { type: 'rentalVisitMissed'; propertyId: string }
  | {
      type: 'tenantMovedIn';
      propertyId: string;
      leaseType: LeaseType;
      monthlyRent: Cents;
      tenantName: string;
      agencyId: string | null;
    }
  | {
      type: 'tenantGaveNotice';
      propertyId: string;
      leaveDay: number;
      reason: 'departure' | 'lifeEvent' | 'incident' | 'buyout';
    }
  /** The player offered an indemnity for the tenant to leave (« départ négocié »). */
  | { type: 'buyoutAnswered'; propertyId: string; amount: Cents; accepted: boolean }
  | {
      type: 'tenantLeft';
      propertyId: string;
      reason: 'notice' | 'evicted' | 'endOfTerm' | 'dpe';
      damages: Cents;
      depositReturned: Cents;
    }
  | { type: 'leaseRenewed'; propertyId: string; termDay: number }
  | { type: 'rentRevised'; propertyId: string; monthlyRent: Cents }
  | { type: 'tenantLifeEvent'; propertyId: string; eventId: string }
  | { type: 'incidentReported'; propertyId: string; kindId: string }
  | { type: 'incidentRepaired'; propertyId: string; kindId: string; cost: Cents }
  | { type: 'rentMissed'; propertyId: string; amount: Cents; insured: boolean }
  | { type: 'reminderSent'; propertyId: string; settled: boolean }
  | { type: 'procedureStarted'; propertyId: string; evictionDay: number; cost: Cents }
  | { type: 'dpeWarning'; propertyId: string; banDay: number }
  | { type: 'movedIntoHome'; propertyId: string }
  | { type: 'movedOutOfHome'; propertyId: string }
  // Works and co-ownership (docs/03-systemes/05).
  | {
      type: 'quoteReceived';
      propertyId: string;
      quoteId: string;
      artisanId: string;
      total: Cents;
      availableDay: number;
    }
  | {
      type: 'worksStarted';
      propertyId: string;
      projectId: string;
      plannedCost: Cents;
      plannedEndDay: number;
    }
  | {
      type: 'worksTaskStarted';
      propertyId: string;
      taskId: string;
      trade: Trade;
      artisanId: string | null;
    }
  | { type: 'worksTaskDone'; propertyId: string; taskId: string; cost: Cents }
  | {
      type: 'worksHazard';
      propertyId: string;
      hazardId: string;
      itemId: string;
      cost: Cents;
      days: number;
      deadlineDay: number;
    }
  | {
      type: 'worksHazardResolved';
      propertyId: string;
      hazardId: string;
      choice: 'treat' | 'postpone' | 'eco';
    }
  | {
      type: 'worksCompleted';
      propertyId: string;
      cost: Cents;
      dpeBefore: DpeLabel;
      dpeAfter: DpeLabel;
    }
  | { type: 'worksFundReturned'; propertyId: string; amount: Cents }
  | {
      type: 'coproMeetingCalled';
      propertyId: string;
      voteDay: number;
      resolutions: { id: string; cost: Cents }[];
    }
  | {
      type: 'coproMeetingHeld';
      propertyId: string;
      /** `textIndex`: the humorous verdict (content/textes/travaux.json). */
      results: { id: string; passed: boolean; textIndex: number }[];
    }
  // Taxes (docs/03-systemes/06).
  | { type: 'propertyTaxCharged'; amount: Cents }
  | {
      type: 'taxAssessed';
      year: number;
      /** Income tax, social contributions and IFI, paid in instalments this year. */
      total: Cents;
      accountantFees: Cents;
      wealthTax: Cents;
    }
  // Descent towards bankruptcy (docs/02, section 2.6).
  | {
      type: 'forcedSale';
      propertyId: string;
      cityId: string;
      price: Cents;
      loanRepaid: Cents;
      loanFees: Cents;
      capitalGainsTax: Cents;
      depositTransferred: Cents;
      net: Cents;
    }
  | { type: 'bankrupt'; netWorth: Cents }
  /** Classique and Serein modes: same world, a small savings, no property (docs/02, 2.6). */
  | { type: 'freshStart'; savings: Cents; reputation: number }
  | { type: 'gameOver' }
  // Progression (docs/02, sections 2.8 to 2.10).
  | { type: 'reputationChanged'; delta: number; reputation: number }
  /** Local renown of a city moved (docs/02, section 2.8). */
  | { type: 'renownChanged'; cityId: string; delta: number; renown: number }
  // Cities and trips (docs/03-systemes/08).
  | { type: 'tripMade'; cityId: string; minutes: number; cost: Cents }
  | { type: 'movedCity'; fromCityId: string; cityId: string; monthlyRent: Cents; cost: Cents }
  | { type: 'titleEarned'; titleId: string }
  | { type: 'achievementEarned'; achievementId: string }
  | { type: 'challengeOffered'; challengeId: string; deadlineDay: number }
  | { type: 'challengeAccepted'; challengeId: string; deadlineDay: number }
  | { type: 'challengeDeclined'; challengeId: string }
  | { type: 'challengeWon'; challengeId: string; reputation: number }
  | { type: 'challengeLost'; challengeId: string; reputation: number }
  // Catalogue of events and anecdotes (docs/03-systemes/07).
  | { type: 'catalogEventStarted'; event: CatalogEventInstance }
  /** An event without choices: its effects are applied. */
  | { type: 'catalogEventHappened'; event: CatalogEventInstance }
  | {
      type: 'catalogEventResolved';
      event: CatalogEventInstance;
      choiceId: string;
      /** The deadline passed: the default choice applied. */
      auto: boolean;
    }
  | { type: 'anecdote'; anecdote: AnecdoteNote }
  | { type: 'offMarketOffered'; listingId: string }
  | { type: 'agendaMoved'; itemId: string; day: number }
  | { type: 'agendaCancelled'; itemId: string }
  | { type: 'bankMeetingPlanned'; bankId: string; day: number }
  | { type: 'selfRepairPlanned'; propertyId: string; day: number };

export type GameEventType = GameEvent['type'];

/**
 * Events kept in the news of the save (docs/04, section 4.10): calendar ticks, the
 * market's churn and the confirmations of the player's own plans are left out. The
 * changes of a listing (sold, withdrawn, cheaper) are kept only for listings the
 * player follows.
 */
export const NEWS_EVENT_TYPES = [
  'monthlyStatement',
  'overdraftStarted',
  'overdraftEnded',
  'loanRepaid',
  'renegotiationAvailable',
  'loanRefinanced',
  'bankMeetingHeld',
  'resigned',
  'worksDelegated',
  'transformationStarted',
  'transformationCompleted',
  'rivalArrived',
  'companyCreated',
  'listingPriceDropped',
  'listingSold',
  'listingWithdrawn',
  'visitDone',
  'diagnosisDone',
  'offerAnswered',
  'counterOfferExpired',
  'compromisSigned',
  'loanAnswered',
  'purchaseCancelled',
  'deedSigned',
  'saleOfferReceived',
  'saleAgreed',
  'saleFellThrough',
  'propertySold',
  'rentalListed',
  'rentalBlocked',
  'furnitureBought',
  'applicationReceived',
  'rentalVisitMissed',
  'tenantMovedIn',
  'tenantGaveNotice',
  'buyoutAnswered',
  'tenantLeft',
  'leaseRenewed',
  'rentRevised',
  'tenantLifeEvent',
  'incidentReported',
  'incidentRepaired',
  'rentMissed',
  'reminderSent',
  'procedureStarted',
  'dpeWarning',
  'movedIntoHome',
  'movedOutOfHome',
  'quoteReceived',
  'worksStarted',
  'worksHazard',
  'worksCompleted',
  'worksFundReturned',
  'coproMeetingCalled',
  'coproMeetingHeld',
  'propertyTaxCharged',
  'taxAssessed',
  'forcedSale',
  'bankrupt',
  'freshStart',
  'gameOver',
  'tripMade',
  'movedCity',
  'titleEarned',
  'achievementEarned',
  'challengeOffered',
  'challengeWon',
  'challengeLost',
  'catalogEventStarted',
  'catalogEventHappened',
  'catalogEventResolved',
  'anecdote',
  'offMarketOffered',
] as const satisfies readonly GameEventType[];

export type NewsEventType = (typeof NEWS_EVENT_TYPES)[number];
export type NewsEvent = Extract<GameEvent, { type: NewsEventType }>;
