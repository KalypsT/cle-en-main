import type { CalendarDate, Weekday } from './calendar.ts';
import type { Cents } from './money.ts';
import type { LeaseType } from './content.ts';
import type { SaleMode } from './state.ts';
import type { LoanDecision, LoanRefusalCode } from './systems/banking.ts';

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
  | { kind: 'taxInstalment'; amount: Cents }
  | { kind: 'taxRefund'; amount: Cents }
  | { kind: 'livingCosts'; amount: Cents }
  | { kind: 'loanPayment'; loanId: string; amount: Cents; interest: Cents; capital: Cents }
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
  // Market (docs/03-systemes/03).
  | { type: 'propertyPricesUpdated' }
  | { type: 'listingPublished'; listingId: string }
  | { type: 'listingPriceDropped'; listingId: string; askingPrice: Cents }
  | { type: 'listingSold'; listingId: string; buyer: 'other' }
  | { type: 'listingSold'; listingId: string; buyer: 'rival'; rivalId: string }
  | { type: 'listingWithdrawn'; listingId: string }
  | { type: 'visitPlanned'; listingId: string; day: number }
  | { type: 'visitDone'; listingId: string; revealedDefects: string[] }
  | { type: 'visitCancelled'; listingId: string; day: number }
  | { type: 'offerMade'; listingId: string; amount: Cents; responseDay: number }
  | { type: 'offerAnswered'; listingId: string; answer: 'accepted'; price: Cents }
  | { type: 'offerAnswered'; listingId: string; answer: 'counterOffer'; amount: Cents }
  | { type: 'offerAnswered'; listingId: string; answer: 'refused' }
  | { type: 'counterOfferExpired'; listingId: string }
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
      price: Cents;
      agencyFees: Cents;
      loanRepaid: Cents;
      loanFees: Cents;
      capitalGainsTax: Cents;
      depositTransferred: Cents;
      net: Cents;
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
  | { type: 'rentalBlocked'; propertyId: string; reason: 'rent.indecent' | 'rent.dpeBanned' }
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
      reason: 'departure' | 'lifeEvent' | 'incident';
    }
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
  // Taxes (docs/03-systemes/06).
  | { type: 'propertyTaxCharged'; amount: Cents }
  | { type: 'taxAssessed'; year: number; total: Cents; accountantFees: Cents }
  // Descent towards bankruptcy (docs/02, section 2.6).
  | {
      type: 'forcedSale';
      propertyId: string;
      price: Cents;
      loanRepaid: Cents;
      loanFees: Cents;
      capitalGainsTax: Cents;
      depositTransferred: Cents;
      net: Cents;
    }
  | { type: 'bankrupt'; netWorth: Cents };

export type GameEventType = GameEvent['type'];
