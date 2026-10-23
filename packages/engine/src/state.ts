import type {
  AdviceKind,
  CrisisModifier,
  DpeLabel,
  Epoch,
  ItemKind,
  LeaseType,
  SpaceKind,
  Tier,
  Trade,
} from './content.ts';
import type { CalendarDate } from './calendar.ts';
import type { Clock } from './clock.ts';
import type { Cents } from './money.ts';
import type { RngState } from './random.ts';
import type { NewsEvent, StatementLine } from './events.ts';
import type { LoanDecision, LoanRefusalCode } from './systems/banking.ts';

/** Current version of the serialized game state. Bump it with a migration. */
export const FORMAT_VERSION = 22;

/** The player's composed avatar: an index into each list of content/avatar.json. */
export interface Avatar {
  face: number;
  hair: number;
  skin: number;
  outfit: number;
}

export interface PlayerState {
  name: string;
  avatar: Avatar;
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
  /** City of the home: trips are counted from it (docs/03-systemes/08). */
  baseCityId: string;
  /** Cities the player already went to today: one trip each, however many actions. */
  tripsToday: string[];
  /** Day number of the last move to another city. */
  lastMoveDay: number | null;
  /** Local renown by city, 0 … 100; a city without an entry is at 0. */
  renown: Record<string, number>;
}

export interface BankRelation {
  /** Banker's trust, 0 … 100. */
  trust: number;
  relationshipMonths: number;
  /** Day number (see calendar.toDayNumber) of the last meeting. */
  lastMeetingDay: number | null;
  /** Meetings and answers to loan requests, oldest first (kept for good). */
  log: BankLogEntry[];
  /** The banker's trust on the 1st of each month: its curve. */
  trustHistory: { date: CalendarDate; trust: number }[];
}

/** One line of the history with a bank. */
export type BankLogEntry =
  | { kind: 'meeting'; day: number; trust: number }
  | {
      kind: 'answer';
      day: number;
      decision: LoanDecision['decision'];
      /** What the loan was for. */
      subject: InboxSubject | null;
      amount: Cents | null;
      ratePercent: number | null;
      reason: LoanRefusalCode | null;
      debtRatio: number | null;
    };

/** A loan that came to an end, kept for good (« Crédits soldés »). */
export interface ClosedLoan {
  id: string;
  bankId: string;
  propertyId: string | null;
  /** The financed property, as it was. */
  subject: InboxSubject | null;
  principal: Cents;
  ratePercent: number;
  durationMonths: number;
  monthlyPayment: Cents;
  startDate: CalendarDate;
  closedDay: number;
  paymentsMade: number;
  interestPaid: Cents;
  /** Capital still owed when it ended early: repaid by a sale, taken over, or written off. */
  remaining: Cents;
  /** Early repayment fees. */
  fees: Cents;
  /** `freshStart`: written off by the bankruptcy. */
  reason: 'repaid' | 'sold' | 'refinanced' | 'freshStart';
  /** The loan that took over a refinanced one. */
  replacedBy: string | null;
}

/** The market on the 1st of a month (docs/04, « Statistiques »). */
export interface MarketPoint {
  date: CalendarDate;
  /** 20-year reference rate, insurance excluded. */
  ratePercent: number;
  /** Price level of each neighbourhood, by city (1 = the city file's prices). */
  priceIndex: Record<string, Record<string, number>>;
}

/** A property sold, kept for good with its history (« Biens vendus »). */
export interface SoldProperty {
  property: Property;
  holder: Holder;
  purchasePrice: Cents;
  acquisitionCost: Cents;
  purchaseDate: CalendarDate;
  soldDay: number;
  /** Sold by the bank in the descent towards bankruptcy. */
  forced: boolean;
  price: Cents;
  agencyFees: Cents;
  loanRepaid: Cents;
  loanFees: Cents;
  capitalGainsTax: Cents;
  depositTransferred: Cents;
  net: Cents;
  /** Price net of fees, minus the cost of the property and of its works. */
  gain: Cents;
  rentsReceived: Cents;
  valueHistory: OwnedProperty['valueHistory'];
  log: PropertyLogEntry[];
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
  /** Interest of the payments made so far (early repayments change the schedule). */
  interestPaid: Cents;
  startDate: CalendarDate;
  /** True once the player was told this loan can be renegotiated. */
  renegotiationSuggested: boolean;
  /**
   * Rate of the best offer when the player declined it: not suggested again until an
   * offer drops further (content/credit.json, `renotifyStepPercent`). Null otherwise.
   */
  renegotiationDeclinedPercent: number | null;
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
  /** Lasting national crises under way (milestone 8). */
  crises: { modifier: CrisisModifier; factor: number; untilDay: number }[];
}

/** Dwellings, then the kinds of the depth (milestone 8): shops, parking spaces, building land. */
export type PropertyKind = 'apartment' | 'house' | 'building' | 'commercial' | 'parking' | 'land';
export type OtherKind = 'commercial' | 'parking' | 'land';

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
  /** Area of a house's attic that could be converted (milestone 8); 0 when there is none. */
  atticSurface: number;
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

/** Who owns a property: the player in his own name, or his SCI (milestone 8). */
export type Holder = 'player' | 'company';

/** The player's SCI: one balance sheet with him, created once. */
export interface CompanyState {
  createdDay: number;
}

/** A purchase under compromis: the property waits for its loan and the deed. */
export interface Purchase {
  id: string;
  /** Buyer: chosen before any loan request. */
  holder: Holder;
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
  /** Short-term let managed by the owner: days of this month he could not see to (lost). */
  missedDays: number;
  /** Day the tenant last refused to leave for an indemnity; null if never asked. */
  buyoutRefusedDay: number | null;
  /** Rents received during this lease, charges excluded (counted since save format 19). */
  rentsReceived: Cents;
  /** Months the tenant did not pay. */
  missedRents: number;
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

export type TransformationKind = 'division' | 'splitBuilding' | 'attic' | 'construction';

/** A transformation led by the project manager (milestone 8): one bill, paid at the end. */
export interface TransformationProject {
  kind: TransformationKind;
  /** Quoted total, the project manager included. */
  total: Cents;
  endDay: number;
  /** Hidden share added to the final bill. */
  overrun: number;
}

/**
 * A property as the works found it or left it (game feel, lot 4): what the
 * « avant / après » of the end of the works shows.
 */
export interface WorksSnapshot {
  dpe: DpeLabel;
  /** The player's estimate of the value, and the market rent of a bare let. */
  value: Cents;
  rent: Cents;
  /** What the street sees of the building (façade, windows, roof), 1 … 5. */
  facadeState: number;
  newWindows: boolean;
  /** State and range of every item, by `itemId`. */
  items: { id: string; state: number; tier: Tier }[];
}

/** The last works finished on a property, before and after. */
export interface WorksReport {
  day: number;
  /** What the works cost the player. */
  cost: Cents;
  before: WorksSnapshot;
  after: WorksSnapshot;
}

export interface WorksProject {
  id: string;
  startDay: number;
  tasks: WorksTask[];
  /** Led by the project manager: he treats the hazards himself (milestone 8). */
  managed: boolean;
  /** A transformation instead of tasks; null for ordinary works. */
  transformation: TransformationProject | null;
  /** A hazard waiting for the player's decision: the works are paused. */
  hazard: PendingHazard | null;
  dpeBefore: DpeLabel;
  /** The property when the works started; null for works begun before save format 21. */
  before: WorksSnapshot | null;
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
  holder: Holder;
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
  /** The last works finished, before and after (save format 21); null if none since. */
  lastWorks: WorksReport | null;
  /** Money lent for works, kept for this property's bills until `untilDay`. */
  worksFund: { amount: Cents; loanId: string; untilDay: number } | null;
  /** Works not deducted from the rents: they count in the capital gain (instead of the flat allowance). */
  worksForCapitalGains: Cents;
  coproMeeting: CoproMeeting | null;
  /** Calls for funds voted by the co-ownership, charged monthly. */
  coproCalls: { monthly: Cents; monthsLeft: number }[];
  /**
   * Estimated value and what its loans still owe, on the deed day then on the 1st of each
   * month (the value curve).
   */
  valueHistory: { date: CalendarDate; value: Cents; debt: Cents }[];
  /** What happened to the property, oldest first (works, tenants, incidents). */
  log: PropertyLogEntry[];
  /** Rents received, charges excluded (counted since save format 17). */
  rentsReceived: Cents;
}

/** One line of a property's history. */
export type PropertyLogEntry =
  | {
      kind: 'works';
      day: number;
      itemKind: ItemKind;
      spaceId: string | null;
      tier: Tier;
      /** Null: done by the player. */
      artisanId: string | null;
      /** What the item cost (the bill, or the materials). */
      cost: Cents;
    }
  | { kind: 'tenantIn'; day: number; tenantName: string; monthlyRent: Cents }
  | {
      kind: 'tenantOut';
      day: number;
      tenantName: string;
      reason: 'notice' | 'evicted' | 'endOfTerm' | 'dpe';
      /** Day the lease began, and its last rent (excluding charges). */
      startDay: number;
      monthlyRent: Cents;
      /** Damages found at the exit inventory, and the deposit given back. */
      damages: Cents;
      depositReturned: Cents;
      /** The tenant's profile and trait, the rents received, the months unpaid and the
       * satisfaction at the end (null for a departure before save format 19). */
      profileId: string | null;
      traitId: string | null;
      rentsReceived: Cents | null;
      missedRents: number | null;
      satisfaction: number | null;
    }
  | { kind: 'incident'; day: number; kindId: string; cost: Cents }
  // Added in version 18 (docs/04, « Historique d'un bien »).
  | { kind: 'bought'; day: number; price: Cents }
  | { kind: 'listedForSale'; day: number; askingPrice: Cents; mode: SaleMode }
  | { kind: 'saleWithdrawn'; day: number }
  | { kind: 'saleAgreed'; day: number; price: Cents }
  | { kind: 'saleFellThrough'; day: number }
  | {
      kind: 'listedForRent';
      day: number;
      leaseType: LeaseType;
      monthlyRent: Cents;
      agencyId: string | null;
      insured: boolean;
    }
  | { kind: 'rentalWithdrawn'; day: number }
  | { kind: 'furniture'; day: number; cost: Cents }
  | {
      kind: 'notice';
      day: number;
      leaveDay: number;
      reason: 'departure' | 'lifeEvent' | 'incident' | 'buyout';
    }
  | { kind: 'buyout'; day: number; amount: Cents; accepted: boolean }
  | { kind: 'rentMissed'; day: number; amount: Cents; insured: boolean }
  | { kind: 'reminder'; day: number; settled: boolean }
  | { kind: 'procedure'; day: number; evictionDay: number; cost: Cents }
  | { kind: 'rentRevised'; day: number; monthlyRent: Cents }
  | { kind: 'leaseRenewed'; day: number; termDay: number }
  | { kind: 'dpeWarning'; day: number; banDay: number }
  | { kind: 'worksCompleted'; day: number; cost: Cents; dpeBefore: DpeLabel; dpeAfter: DpeLabel }
  | {
      kind: 'copro';
      day: number;
      results: { id: string; passed: boolean; textIndex: number }[];
    }
  | { kind: 'transformation'; day: number; transformation: TransformationKind; cost: Cents }
  | { kind: 'home'; day: number; movedIn: boolean }
  | { kind: 'regime'; day: number; regime: TaxRegimeChoice };

/** A property a marchand de biens renovates before selling it again. */
export interface RivalProject {
  property: Property;
  /** Day number it goes back on the market. */
  resaleDay: number;
}

/** A named rival: only a budget and a few projects, no full simulation of its wealth. */
export interface RivalState {
  /** Day a late rival arrived (SCI Horizon); null before, and for the others. */
  arrivedDay: number | null;
  budget: Cents;
  purchases: number;
  projects: RivalProject[];
}

interface AgendaBase {
  id: string;
  /** Day number the action is planned on. */
  day: number;
  minutes: number;
}

/** An action planned on a later day (docs/03-systemes/01, « L'agenda léger »). */
export type AgendaItem = AgendaBase &
  (
    | { kind: 'visit'; listingId: string }
    | { kind: 'bankMeeting'; bankId: string }
    /** The player repairs a tenant's incident himself. */
    | { kind: 'selfRepair'; propertyId: string }
  );

/** A catalogue event waiting for the player's answer (docs/03-systemes/07). */
export interface CatalogEventInstance {
  id: string;
  /** Event of content/evenements/. */
  eventId: string;
  day: number;
  /** The default choice applies on this day. */
  deadlineDay: number;
  /** Variant of the text. */
  textIndex: number;
  /** Target property; null for game-wide events. */
  propertyId: string | null;
  /** Values of the text variables, fixed when the event fires. */
  vars: {
    tenant: string | null;
    artisanId: string | null;
    neighbourhoodId: string;
    cityId: string;
    rivalId: string;
  };
  /** Signed amount of each choice (or of the event without choices), drawn when it fires. */
  amounts: Record<string, Cents>;
}

/** An anecdote heard recently, for the street bubbles and the news. */
export interface AnecdoteNote {
  anecdoteId: string;
  day: number;
  textIndex: number;
  propertyId: string | null;
  vars: {
    tenant: string | null;
    artisanId: string | null;
    neighbourhoodId: string;
    cityId: string;
    rivalId: string;
  };
}

export interface CatalogState {
  pending: CatalogEventInstance[];
  /** Last day each event fired, by event id (its cooldown). */
  lastDay: Record<string, number>;
  /** Most recent anecdotes, newest last. */
  anecdotes: AnecdoteNote[];
}

/** A challenge offered or accepted (docs/02, section 2.10). */
export interface ChallengeState {
  id: string;
  offeredDay: number;
  /** Day the offer lapses (not accepted) or the challenge fails (accepted). */
  deadlineDay: number;
  accepted: boolean;
  /** Value of the goal's stat when accepted. */
  baseline: number;
}

export interface ProgressState {
  /** Titles held, in the order earned. */
  titles: { id: string; day: number }[];
  achievements: { id: string; day: number }[];
  /** Counters of content/schemas/progression.ts (`rivalBeaten.<rival>` for a keyed one). */
  counters: Record<string, number>;
  records: {
    /** Best capital gain on a sale (price net of fees, minus the cost of the property and its works). */
    bestCapitalGain: Cents;
    biggestWorks: Cents;
    bestMonth: Cents;
    maxNetWorth: Cents;
  };
  /** Trouble this year (forced sale, procedure, eviction, indecent let): no quiet year. */
  troubledYear: boolean;
  challenge: ChallengeState | null;
  challengeHistory: { id: string; day: number; won: boolean }[];
  /** No challenge is offered before this day. */
  nextChallengeDay: number;
}

export type ChronicleKind =
  | 'start'
  | 'firstPurchase'
  | 'firstLease'
  | 'firstWorks'
  | 'firstSale'
  | 'homeBought'
  | 'title'
  | 'achievement'
  | 'challengeWon'
  | 'challengeLost'
  | 'majorEvent'
  | 'forcedSale'
  | 'bankrupt'
  | 'freshStart'
  | 'gameOver'
  | 'rewind'
  | 'record'
  // Added in version 19.
  | 'companyCreated'
  | 'rivalArrived'
  | 'movedCity'
  | 'firstRemotePurchase'
  | 'firstEviction'
  | 'firstLoanRepaid'
  | 'firstTransformation';

/** A step of the career (« Chronique »). `ref` names a title, achievement, challenge or event. */
export interface ChronicleEntry {
  day: number;
  kind: ChronicleKind;
  ref: string | null;
  amount: Cents | null;
}

/**
 * What a news or a letter is about, frozen when it happened: the listing or the
 * property may be gone since (sold, withdrawn).
 */
export interface InboxSubject {
  /** The property's id, the same from the listing to the deed. */
  propertyId: string;
  /** The listing it was offered by, if it was one. */
  listingId: string | null;
  kind: PropertyKind;
  rooms: number;
  surface: number;
  /** Lots of a building. */
  lots: number;
  cityId: string;
  neighbourhoodId: string;
}

/** Something that happened, for the news (kept a while, then forgotten). */
export interface NewsItem {
  id: number;
  day: number;
  event: NewsEvent;
  subject: InboxSubject | null;
}

interface MailBase {
  id: number;
  day: number;
  subject: InboxSubject | null;
  /** Closed by the player: no longer listed (a listing still shows its seller's last word). */
  dismissed: boolean;
}

/** What a letter says. */
export type MailContent =
  | {
      kind: 'offerReply';
      listingId: string;
      /** `counterDeclined`: the player turned the seller's counter-offer down. */
      outcome: 'accepted' | 'refused' | 'counterExpired' | 'counterDeclined';
      /** The price agreed, the player's offer, or the seller's counter-offer. */
      amount: Cents;
    }
  | {
      kind: 'loanAnswer';
      bankId: string;
      decision: LoanDecision['decision'];
      reason: LoanRefusalCode | null;
      /** Debt ratio the loan would have led to, for a refusal on that ground. */
      debtRatio: number | null;
      amount: Cents | null;
      ratePercent: number | null;
    }
  | {
      kind: 'saleReply';
      /** Rival buyer; null for an anonymous household. */
      buyerId: string | null;
      outcome: 'counterAccepted' | 'counterRefused' | 'expired';
      /** The player's counter-offer, or the buyer's offer that expired. */
      amount: Cents;
    }
  | { kind: 'buyout'; amount: Cents; accepted: boolean }
  | {
      kind: 'catalogEvent';
      event: CatalogEventInstance;
      choiceId: string;
      /** The deadline passed: the default choice applied. */
      auto: boolean;
    }
  | { kind: 'copro'; results: { id: string; passed: boolean; textIndex: number }[] }
  | { kind: 'hazard'; hazardId: string; choice: 'treat' | 'postpone' | 'eco'; cost: Cents };

/** An answer, or a decision that was settled: kept until closed or too old. */
export type MailItem = MailBase & MailContent;

export interface InboxState {
  /** Oldest first; forgotten past the limits of content/rythme.json. */
  news: NewsItem[];
  /** Id of the latest news the player has seen. */
  newsSeenId: number;
  /** Oldest first; dropped past the limits of content/rythme.json. */
  mail: MailItem[];
  /** Ids of the news and mail, apart from `nextId` so the world's ids do not move. */
  nextId: number;
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
  /** The player's SCI; null until he creates one (milestone 8). */
  company: CompanyState | null;
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
  /** Listings the player marked, by id (removed with the listing). */
  favorites: string[];
  /** News and mail kept for the « Décisions » tab (docs/04, section 4.10). */
  inbox: InboxState;
  /** Properties sold, oldest first. */
  soldProperties: SoldProperty[];
  /** Loans that came to an end, oldest first. */
  closedLoans: ClosedLoan[];
  /** The market on the 1st of each month: its rate, and the price level of each neighbourhood. */
  marketHistory: MarketPoint[];
  /** Gérard's tutorial: `step` indexes content/textes/didacticiel.json. */
  tutorial: { enabled: boolean; step: number };
  /** One point on the 1st of each month (and at the start): the wealth curve. */
  history: MonthlyPoint[];
  /** Last monthly statement, for the short monthly review. */
  lastStatement: MonthlyStatement | null;
  /** Game mode (content/modes.json). */
  modeId: string;
  /** Rewinds used so far: kept across rewinds (docs/02, section 2.7). */
  rewinds: number;
  /** Bankruptcy in a mode without fresh start: the game is over. */
  gameOver: { day: number } | null;
  progress: ProgressState;
  chronicle: ChronicleEntry[];
  catalog: CatalogState;
  /** Last yearly review with Yvon Tableur, built on the 1st of January. */
  lastYearReview: YearReview | null;
  /** The reviews kept (docs/04, « Bilans ») : the last statements, and every year. */
  reviews: {
    /** Oldest first, the last ones only (content/rythme.json). */
    statements: MonthlyStatement[];
    /** Each yearly review, with the tax assessed for that year. */
    years: { review: YearReview; assessment: TaxAssessment | null }[];
  };
}

/** A piece of Yvon's advice; the interface picks the text (content/textes/yvon.json). */
export interface Advice {
  kind: AdviceKind;
  propertyId?: string | undefined;
  amount?: Cents | undefined;
  year?: number | undefined;
  ratio?: number | undefined;
}

export interface YearReview {
  year: number;
  netWorthStart: Cents;
  netWorthEnd: Cents;
  /** Sum of the monthly statements of the year. */
  cashFlow: Cents;
  /** Rents of the leases at each month start, summed (charges excluded). */
  rents: Cents;
  reputationStart: number;
  reputationEnd: number;
  rentTax: Cents | null;
  accountantFees: Cents;
  titles: string[];
  achievements: string[];
  advice: Advice[];
}

export interface MonthlyPoint {
  date: CalendarDate;
  netWorth: Cents;
  balance: Cents;
  /** Remaining loans. */
  debt: Cents;
  /** Net flow of the month's statement (0 for the starting point). */
  cashFlow: Cents;
  /** Rents of the current leases, charges excluded. */
  monthlyRent: Cents;
  reputation: number;
}

export interface MonthlyStatement {
  date: CalendarDate;
  lines: StatementLine[];
  balance: Cents;
}

/** What one property earned and cost during the tax year, for the yearly assessment. */
export interface PropertyLedger {
  /** Kind of let this year (the last lease's type); null if never let. */
  category: LeaseType | null;
  regime: TaxRegimeChoice;
  /** Held by the SCI (milestone 8): always at the real regime. */
  company: boolean;
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
  /** Impôt sur la fortune immobilière of 1 January (milestone 8), and its base. */
  wealthTax: Cents;
  taxableWealth: Cents;
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
