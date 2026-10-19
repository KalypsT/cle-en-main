import type { GameEvent } from './events.ts';
import type { Cents } from './money.ts';
import type { LeaseType, Trade } from './content.ts';
import type { GameState, Holder, SaleMode, TaxRegimeChoice } from './state.ts';
import type { CompanyRefusal } from './systems/company.ts';
import type { AgendaRefusal, VisitRefusal } from './systems/agenda.ts';
import type { CatalogRefusal } from './systems/catalog.ts';
import type { ChallengeRefusal } from './systems/challenges.ts';
import type { BankActionRefusal } from './systems/banking.ts';
import type { OfferRefusal } from './systems/offers.ts';
import type { PurchaseRefusal } from './systems/purchases.ts';
import type { RentRefusal } from './systems/renting.ts';
import type { SaleRefusal } from './systems/resale.ts';
import type { CoproRefusal } from './systems/copro.ts';
import type { MoveRefusal } from './systems/cities.ts';
import type { HazardChoice, ItemChoice, WorksRefusal } from './systems/works.ts';

/** Every player or bot decision goes through one of these actions. Amounts are in cents. */
export type GameAction =
  | { type: 'bank/meet'; bankId: string }
  | { type: 'bank/refinance'; loanId: string; bankId: string }
  | { type: 'job/resign' }
  /** Creates the player's SCI (milestone 8). */
  | { type: 'company/create' }
  /** Buys in one's own name or through the SCI, before asking any bank. */
  | { type: 'purchase/setHolder'; purchaseId: string; holder: Holder }
  | { type: 'market/favorite'; listingId: string; favorite: boolean }
  /** Interface data kept in the save: Gérard's tutorial, on or off, and its step. */
  | { type: 'tutorial/set'; enabled?: boolean; step?: number }
  | { type: 'market/visit'; listingId: string }
  | { type: 'market/offer'; listingId: string; amount: Cents }
  | { type: 'market/answerCounter'; listingId: string; accept: boolean }
  | {
      type: 'purchase/requestLoan';
      purchaseId: string;
      bankId: string;
      amount: Cents;
      durationYears: number;
      /** Part of the project that is works (kept in the property's works envelope). */
      works?: Cents;
    }
  | { type: 'purchase/acceptLoan'; purchaseId: string; applicationId: string }
  | { type: 'purchase/payCash'; purchaseId: string }
  | { type: 'purchase/withdraw'; purchaseId: string }
  | { type: 'sale/list'; propertyId: string; askingPrice: Cents; mode: SaleMode }
  | { type: 'sale/update'; propertyId: string; askingPrice: Cents }
  | { type: 'sale/withdraw'; propertyId: string }
  | { type: 'sale/acceptOffer'; propertyId: string; offerId: string }
  | { type: 'sale/rejectOffer'; propertyId: string; offerId: string }
  | { type: 'sale/counterOffer'; propertyId: string; offerId: string; amount: Cents }
  | {
      type: 'rent/list';
      propertyId: string;
      leaseType: LeaseType;
      monthlyRent: Cents;
      /** Managing agency; null to manage it oneself. */
      agencyId: string | null;
      /** Garantie loyers impayés. */
      insured: boolean;
    }
  | { type: 'rent/withdraw'; propertyId: string }
  | { type: 'rent/accept'; propertyId: string; applicationId: string }
  | { type: 'rent/reject'; propertyId: string; applicationId: string }
  | { type: 'rent/manage'; propertyId: string; agencyId: string | null }
  | { type: 'rent/repair'; propertyId: string; method: 'self' | 'artisan' }
  | { type: 'home/moveIn'; propertyId: string }
  | { type: 'home/moveOut' }
  /** Moves the rented home to another city: the base changes (docs/03-systemes/08). */
  | { type: 'city/move'; cityId: string }
  | { type: 'tax/setRegime'; propertyId: string; regime: TaxRegimeChoice }
  | { type: 'market/diagnose'; listingId: string; trade: Trade }
  | { type: 'works/quote'; propertyId: string; artisanId: string; items: ItemChoice[] }
  | { type: 'works/start'; propertyId: string; quoteIds: string[]; diy: ItemChoice[] }
  | { type: 'works/hazard'; propertyId: string; choice: HazardChoice }
  | {
      type: 'copro/vote';
      propertyId: string;
      resolutionId: string;
      vote: 'for' | 'against';
    }
  | { type: 'agenda/cancel'; itemId: string }
  /** `day`: a later day number with enough free time left. */
  | { type: 'agenda/move'; itemId: string; day: number }
  /** Answers a catalogue event (docs/03-systemes/07). */
  | { type: 'event/choose'; eventId: string; choiceId: string }
  /** Accepts or declines the challenge on offer. */
  | { type: 'challenge/answer'; accept: boolean };

export type RefusalCode =
  | BankActionRefusal
  | VisitRefusal
  | OfferRefusal
  | PurchaseRefusal
  | SaleRefusal
  | RentRefusal
  | WorksRefusal
  | CoproRefusal
  | AgendaRefusal
  | MoveRefusal
  | CatalogRefusal
  | ChallengeRefusal
  | CompanyRefusal
  | 'game.over'
  | 'job.alreadyResigned'
  | 'tutorial.invalidStep';

/** Machine-readable refusal; the interface maps `code` to a text from `content/`. */
export interface Refusal {
  code: RefusalCode;
}

export type DispatchResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; reason: Refusal };
