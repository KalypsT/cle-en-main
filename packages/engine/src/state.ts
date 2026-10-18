import type { Condition, DpeLabel, Epoch } from './content.ts';
import type { CalendarDate } from './calendar.ts';
import type { Clock } from './clock.ts';
import type { Cents } from './money.ts';
import type { RngState } from './random.ts';
import type { LoanDecision } from './systems/banking.ts';

/** Current version of the serialized game state. Bump it with a migration. */
export const FORMAT_VERSION = 3;

export interface PlayerState {
  jobId: string;
  employed: boolean;
  /** Current account; negative means overdraft. */
  balance: Cents;
  /** Consecutive days spent in overdraft. */
  overdraftDays: number;
  /** Overdraft interest charged since the last monthly statement. */
  overdraftInterestThisMonth: Cents;
  /** Rent of the player's own home. */
  monthlyRent: Cents;
  /** Free time left today, in minutes. */
  freeTimeMinutes: number;
  /** Global reputation, 0 … 100. */
  reputation: number;
  /** Months with rental income, used by banks once the player has no salary. */
  rentalHistoryMonths: number;
}

export interface BankRelation {
  /** Banker's trust, 0 … 100. */
  trust: number;
  relationshipMonths: number;
  /** Day number (see calendar.toDayNumber) of the last meeting. */
  lastMeetingDay: number | null;
}

export interface Loan {
  id: string;
  bankId: string;
  principal: Cents;
  /** Fixed annual rate, insurance included, in percentage points. */
  ratePercent: number;
  durationMonths: number;
  monthlyPayment: Cents;
  remaining: Cents;
  paymentsMade: number;
  startDate: CalendarDate;
  /** True once the player was told this loan can be renegotiated. */
  renegotiationSuggested: boolean;
  /** Property financed by this loan: it is repaid when the property is sold. */
  propertyId: string | null;
}

export interface NeighbourhoodMarket {
  /** Price level relative to the data date (1 = the city file's prices). */
  priceIndex: number;
  /** Current yearly trend, in percent. */
  trendPercent: number;
}

export interface MarketState {
  /** 20-year reference rate, insurance excluded, in percentage points. */
  ratePercent: number;
  /** Position in the rate cycle, 0 … 1. */
  cyclePhase: number;
  /** Market rate as felt by property prices, which react with a delay. */
  laggedRatePercent: number;
  /** Price levels by city, then by neighbourhood. */
  cities: Record<string, Record<string, NeighbourhoodMarket>>;
}

export type PropertyKind = 'apartment' | 'house' | 'building';

export interface Defect {
  id: string;
  /** Known to the player (revealed by a visit, or after buying). */
  revealed: boolean;
}

/** A dwelling or a building, on the market or owned. */
export interface Property {
  id: string;
  cityId: string;
  neighbourhoodId: string;
  kind: PropertyKind;
  /** Living area in m² (sum of the lots for a building). */
  surface: number;
  rooms: number;
  /** Floor of an apartment; null for houses and buildings. */
  floor: number | null;
  /** Flats of a building; empty otherwise. */
  lots: { surface: number; rooms: number }[];
  epoch: Epoch;
  dpe: DpeLabel;
  condition: Condition;
  /** Hidden until revealed: they lower the real value. */
  defects: Defect[];
  /** Yearly property tax and monthly co-ownership charges (charged from milestone 2). */
  annualPropertyTax: Cents;
  monthlyCharges: Cents;
}

export interface ListingOffer {
  amount: Cents;
  /** Day number the seller answers on. */
  responseDay: number;
  /** Seller's counter-offer, waiting for the player's answer. */
  counter: { amount: Cents; expiresDay: number } | null;
}

export interface Listing {
  id: string;
  property: Property;
  titleId: string;
  motivationId: string;
  askingPrice: Cents;
  initialAskingPrice: Cents;
  /** Day number of publication. */
  publishedDay: number;
  /** Other buyers see it from this day (later for an estate agent's head start). */
  publicDay: number;
  lastPriceDropDay: number;
  visited: boolean;
  offersMade: number;
  offer: ListingOffer | null;
}

export interface LoanApplication {
  id: string;
  bankId: string;
  amount: Cents;
  durationYears: number;
  /** Day number the bank answers on. */
  responseDay: number;
  /** Bank's answer once given (same shape as LoanDecision). */
  decision: LoanDecision | null;
}

/** A purchase under compromis: the property waits for its loan and the deed. */
export interface Purchase {
  id: string;
  listingId: string;
  property: Property;
  price: Cents;
  deposit: Cents;
  signedDay: number;
  loanDeadlineDay: number;
  deedDay: number;
  applications: LoanApplication[];
  /** Application whose offer the player accepted. */
  acceptedApplicationId: string | null;
  /** The player gave up the loan condition and pays cash. */
  cash: boolean;
}

export type SaleMode = 'agency' | 'self';

export interface SaleOffer {
  id: string;
  amount: Cents;
  /** Most the buyer would accept on a counter-offer (hidden). */
  buyerMax: Cents;
  expiresDay: number;
  /** A counter-offer was made: the buyer answers the next day. */
  counterAmount: Cents | null;
}

export interface SaleState {
  askingPrice: Cents;
  mode: SaleMode;
  listedDay: number;
  offers: SaleOffer[];
  /** Accepted offer, waiting for the deed. */
  agreement: { price: Cents; deedDay: number } | null;
}

export interface OwnedProperty {
  property: Property;
  purchasePrice: Cents;
  /** Price plus notary and bank fees. */
  acquisitionCost: Cents;
  purchaseDate: CalendarDate;
  sale: SaleState | null;
}

export interface AgendaItem {
  id: string;
  kind: 'visit';
  listingId: string;
  /** Day number the action is planned on. */
  day: number;
  minutes: number;
}

/** The whole world. Must stay plain JSON data: no classes, no functions. */
export interface GameState {
  formatVersion: number;
  seed: number;
  rng: RngState;
  startDate: CalendarDate;
  clock: Clock;
  /** Counter for generated identifiers. */
  nextId: number;
  player: PlayerState;
  banks: Record<string, BankRelation>;
  market: MarketState;
  loans: Loan[];
  listings: Listing[];
  purchases: Purchase[];
  properties: OwnedProperty[];
  agenda: AgendaItem[];
}
