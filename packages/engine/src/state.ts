import type { DpeLabel, Epoch, ItemKind, LeaseType, SpaceKind, Tier, Trade } from './content.ts';
import type { CalendarDate } from './calendar.ts';
import type { Clock } from './clock.ts';
import type { Cents } from './money.ts';
import type { RngState } from './random.ts';
import type { LoanDecision } from './systems/banking.ts';

/** Current version of the serialized game state. Bump it with a migration. */
export const FORMAT_VERSION = 6;

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
  /** Day number of the bankruptcy (net worth still negative after forced sales). */
  bankruptDay: number | null;
  /** Owned property the player lives in (résidence principale); null while renting. */
  homePropertyId: string | null;
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

/** A nuisance the works cannot fix (noisy neighbours). */
export interface Defect {
  id: string;
  /** Known to the player (revealed by a visit, or after buying). */
  revealed: boolean;
}

/** A room of a dwelling (docs/03-systemes/05, « La structure d'un bien »). */
export interface Space {
  /** Unique within the property: `living`, `bedroom2`, `l3-kitchen` for a building's third flat. */
  id: string;
  kind: SpaceKind;
  /** Floor area in m² (a house's garden: its land). */
  surface: number;
}

/**
 * A poste of a room (floors, walls…) or an element of the whole dwelling
 * (electricity, insulation…). Its id is `${spaceId}.${kind}`, or `${kind}`
 * for the dwelling's elements (see systems/dwelling.ts).
 */
export interface WorkItem {
  kind: ItemKind;
  /** Room of the item; null for the dwelling's elements and the common parts. */
  spaceId: string | null;
  /** 1 = to redo entirely … 5 = new. */
  state: number;
  /** Range of the last renovation (the original fittings count as standard). */
  tier: Tier;
  /** The player knows its state (a visit, a diagnosis, or ownership). */
  known: boolean;
}

/** A hazard put off during works: it comes back when the item is worked on again. */
export interface PostponedHazard {
  hazardId: string;
  itemId: string;
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
  /** Energy class, recomputed at the end of works. */
  dpe: DpeLabel;
  spaces: Space[];
  items: WorkItem[];
  /** Calibrates the energy model on the DPE drawn from the data (primary energy multiplier). */
  energyFactor: number;
  /** Co-ownership of an apartment's building; null for houses and whole buildings. */
  copro: { lots: number; meetingMonth: number } | null;
  postponedHazards: PostponedHazard[];
  /** Hidden until revealed: they lower the real value. */
  defects: Defect[];
  /** Yearly property tax and monthly co-ownership charges. */
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
  /** Part of the project that is works: lent into the property's works envelope. */
  works: Cents;
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
  /** Rival making the offer; null for an anonymous household. */
  buyerId: string | null;
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
  agreement: { price: Cents; deedDay: number; buyerId: string | null } | null;
}

/** A candidate tenant (docs/03-systemes/04, « Trouver un locataire »). */
export interface Tenant {
  firstName: string;
  lastName: string;
  profileId: string;
  traitId: string;
  /** Net monthly income, shown on the application. */
  monthlyIncome: Cents;
  guarantor: boolean;
  desiredYears: number;
  /** Hidden: drives late payments and damages, 0 … 1. */
  reliability: number;
  /** Multiplier on the departure probability (profile, then life events). */
  mobility: number;
}

export interface RentalApplication {
  id: string;
  tenant: Tenant;
  /** Day number the candidate gives up and looks elsewhere. */
  expiresDay: number;
}

/** A property offered for rent: candidates arrive until one is accepted. */
export interface RentalListing {
  leaseType: LeaseType;
  /** Rent asked, excluding charges. */
  monthlyRent: Cents;
  /** Managing agency; null when the owner manages it himself. */
  agencyId: string | null;
  /** Garantie loyers impayés. */
  insured: boolean;
  listedDay: number;
  applications: RentalApplication[];
}

export interface Incident {
  id: string;
  /** Kind of incident (content/location.json). */
  kindId: string;
  day: number;
  /** An artisan is booked: repaired on this day for this cost. */
  repair: { day: number; cost: Cents } | null;
}

/** Unpaid rents of a lease (docs/03-systemes/04, « Les impayés »). */
export interface Arrears {
  /** Owed by the tenant (rent and charges). */
  amount: Cents;
  months: number;
  sinceDay: number;
  /** The reminder failed: the tenant stopped paying. */
  reminderFailed: boolean;
  /** Court procedure: eviction possible from this day (outside the winter truce). */
  procedureEndDay: number | null;
}

export interface Lease {
  leaseType: LeaseType;
  tenant: Tenant;
  /** Rent excluding charges. */
  monthlyRent: Cents;
  startDay: number;
  /** End of the current term: renewed, unless the tenant leaves or the DPE forbids it. */
  termDay: number;
  /** Next yearly rent revision and life event. */
  anniversaryDay: number;
  /** Market rent factor of the neighbourhood at the last revision (simulated IRL). */
  revisionFactor: number;
  /** Security deposit held by the owner. */
  deposit: Cents;
  agencyId: string | null;
  insured: boolean;
  /** Tenant satisfaction, 0 … 100. */
  satisfaction: number;
  /** The tenant gave notice: he leaves on this day. */
  noticeEndDay: number | null;
  incident: Incident | null;
  arrears: Arrears | null;
}

export type TaxRegimeChoice = 'auto' | 'micro' | 'real';

/** LMNP real-regime carry-overs of a property. */
export interface FurnishedTaxState {
  /** Depreciation not used yet (it cannot create a deficit). */
  deferredDepreciation: Cents;
  /** Deficit carried forward on this property's furnished income. */
  deficitCarry: Cents;
  /** Building (and works) depreciation deducted so far: added back to the capital gain (2025 rule). */
  buildingDepreciationDeducted: Cents;
  /** Works paid while let furnished: depreciated from the year they were paid. */
  works: { amount: Cents; year: number }[];
}

/** An artisan's quote for some items of a property (docs/03-systemes/05, « Les devis »). */
export interface Quote {
  id: string;
  artisanId: string;
  items: { itemId: string; tier: Tier; price: Cents; days: number }[];
  total: Cents;
  /** Calendar days of work. */
  days: number;
  /** First day the artisan can start. */
  availableDay: number;
  expiresDay: number;
}

/** One artisan's part of a project (or the player's own). */
export interface WorksTask {
  id: string;
  /** Null: done by the player. */
  artisanId: string | null;
  trade: Trade;
  phase: number;
  items: { itemId: string; tier: Tier; price: Cents }[];
  status: 'waiting' | 'running' | 'done';
  /** First day the artisan can start. */
  availableDay: number;
  /** Planned calendar days (artisan). */
  days: number;
  startDay: number | null;
  /** Day the artisan finishes, delays included (hidden from the player until then). */
  endDay: number | null;
  /** Hidden share added to the bill, drawn when the task starts. */
  overrun: number;
  /** Already paid as a deposit, deducted from the bill. */
  deposit: Cents;
  /** Doing it oneself: free time needed and spent. */
  minutesNeeded: number;
  minutesDone: number;
}

export interface PendingHazard {
  hazardId: string;
  taskId: string;
  itemId: string;
  cost: Cents;
  days: number;
  /** Treated by default from this day. */
  deadlineDay: number;
}

export interface WorksProject {
  id: string;
  startDay: number;
  tasks: WorksTask[];
  /** A hazard waiting for the player's decision: the works are paused. */
  hazard: PendingHazard | null;
  dpeBefore: DpeLabel;
  /** Paid so far: deposits, bills, hazards. */
  paid: Cents;
}

export interface CoproMeeting {
  voteDay: number;
  /** The player goes (free time spent once) and votes. */
  attended: boolean;
  resolutions: {
    id: string;
    /** Player's share of the cost. */
    cost: Cents;
    /** Share of the other owners in favour (hidden). */
    support: number;
    vote: 'for' | 'against' | null;
  }[];
}

export interface OwnedProperty {
  property: Property;
  purchasePrice: Cents;
  /** Price plus notary and bank fees. */
  acquisitionCost: Cents;
  purchaseDate: CalendarDate;
  sale: SaleState | null;
  rental: RentalListing | null;
  lease: Lease | null;
  /** Furniture bought for a furnished let. */
  furniture: { cost: Cents; boughtDay: number } | null;
  /** Tax regime chosen by the player; 'auto' applies the cheapest. */
  taxRegime: TaxRegimeChoice;
  furnishedTax: FurnishedTaxState;
  quotes: Quote[];
  works: WorksProject | null;
  /** Money lent for works, kept for this property's bills until `untilDay`. */
  worksFund: { amount: Cents; loanId: string; untilDay: number } | null;
  /** Works not deducted from the rents: they count in the capital gain (instead of the flat allowance). */
  worksForCapitalGains: Cents;
  coproMeeting: CoproMeeting | null;
  /** Calls for funds voted by the co-ownership, charged monthly. */
  coproCalls: { monthly: Cents; monthsLeft: number }[];
}

/** A property a marchand de biens renovates before selling it again. */
export interface RivalProject {
  property: Property;
  /** Day number it goes back on the market. */
  resaleDay: number;
}

/** A named rival: only a budget and a few projects, no full simulation of its wealth. */
export interface RivalState {
  budget: Cents;
  purchases: number;
  projects: RivalProject[];
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
  /** Named rivals, by id (content/rivaux.json). */
  rivals: Record<string, RivalState>;
  tax: TaxState;
  /** The player's history with each artisan (content/artisans.json). */
  artisans: Record<string, { jobs: number }>;
  /** Works projects completed, by city: the address book grows with them. */
  worksDone: Record<string, number>;
}

/** What one property earned and cost during the tax year, for the yearly assessment. */
export interface PropertyLedger {
  /** Kind of let this year (the last lease's type); null if never let. */
  category: LeaseType | null;
  regime: TaxRegimeChoice;
  /** Rents received, charges excluded (unpaid rents are not income). */
  rents: Cents;
  /** Deductible costs, interest and works excluded. */
  costs: Cents;
  /** Works paid this year (deducted, depreciated or kept for the capital gain at the review). */
  works: Cents;
  /** Works of an energy renovation (DPE E–G to A–D): the doubled deficit ceiling applies. */
  energyRenovation: boolean;
  interest: Cents;
  /** Still owned at the end of the year (depreciation only applies then). */
  sold: boolean;
}

export interface TaxAssessment {
  year: number;
  incomeTax: Cents;
  socialContributions: Cents;
  accountantFees: Cents;
  /** Landlord deficit deducted from the salary. */
  deficitOnSalary: Cents;
  properties: {
    propertyId: string;
    category: LeaseType;
    regime: 'micro' | 'real';
    /** Taxable result (negative for a deficit). */
    taxable: Cents;
  }[];
}

export interface TaxState {
  /** Year being accumulated. */
  year: number;
  /** Salary received this year. */
  salary: Cents;
  ledgers: Record<string, PropertyLedger>;
  /** Landlord deficits carried forward on bare-let income, by year of origin. */
  landlordDeficits: { year: number; amount: Cents }[];
  /** Last year's tax, paid monthly this year. */
  installments: { monthly: Cents; remaining: number };
  lastAssessment: TaxAssessment | null;
}
