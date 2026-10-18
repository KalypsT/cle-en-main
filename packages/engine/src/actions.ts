import type { GameEvent } from './events.ts';
import type { Cents } from './money.ts';
import type { LeaseType } from './content.ts';
import type { GameState, SaleMode, TaxRegimeChoice } from './state.ts';
import type { VisitRefusal } from './systems/agenda.ts';
import type { BankActionRefusal } from './systems/banking.ts';
import type { OfferRefusal } from './systems/offers.ts';
import type { PurchaseRefusal } from './systems/purchases.ts';
import type { RentRefusal } from './systems/renting.ts';
import type { SaleRefusal } from './systems/resale.ts';

/** Every player or bot decision goes through one of these actions. Amounts are in cents. */
export type GameAction =
  | { type: 'bank/meet'; bankId: string }
  | { type: 'bank/refinance'; loanId: string; bankId: string }
  | { type: 'job/resign' }
  | { type: 'market/visit'; listingId: string }
  | { type: 'market/offer'; listingId: string; amount: Cents }
  | { type: 'market/answerCounter'; listingId: string; accept: boolean }
  | {
      type: 'purchase/requestLoan';
      purchaseId: string;
      bankId: string;
      amount: Cents;
      durationYears: number;
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
  | { type: 'tax/setRegime'; propertyId: string; regime: TaxRegimeChoice };

export type RefusalCode =
  | BankActionRefusal
  | VisitRefusal
  | OfferRefusal
  | PurchaseRefusal
  | SaleRefusal
  | RentRefusal
  | 'job.alreadyResigned';

/** Machine-readable refusal; the interface maps `code` to a text from `content/`. */
export interface Refusal {
  code: RefusalCode;
}

export type DispatchResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; state: GameState; reason: Refusal };
