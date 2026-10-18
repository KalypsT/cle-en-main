import { parseIsoDate, toDayNumber } from '../calendar.ts';
import {
  findAgency,
  findNeighbourhood,
  findTenantProfile,
  type DpeLabel,
  type GameContent,
  type LeaseType,
} from '../content.ts';
import { type Cents, toCents } from '../money.ts';
import { nextFloat, nextInt, nextNormal, nextRange } from '../random.ts';
import type {
  GameState,
  Lease,
  OwnedProperty,
  Property,
  RentalApplication,
  RentalListing,
  WorkItem,
} from '../state.ts';
import {
  heavyWorksInProgress,
  interpolateByState,
  isIndecent,
  tierShare,
  weightedState,
} from './dwelling.ts';
import { realValue } from './valuation.ts';
import type { SystemContext } from './context.ts';
import { addCost, addRent, ledgerOf } from './taxes.ts';
import { drawTenant, visibleReliability } from './tenants.ts';

/**
 * Renting (docs/03-systemes/04-location.md): the owner offers a property for
 * rent, candidates apply, the owner (or his agency) picks one, and the lease
 * lives its life (leases.ts) until the tenant leaves.
 */

export const DAYS_PER_YEAR = 365;
const MONTHS_PER_YEAR = 12;
const RENT_ROUNDING = 100;

export function monthsToDays(months: number): number {
  return Math.round((months * DAYS_PER_YEAR) / MONTHS_PER_YEAR);
}

export type RentRefusal =
  | 'property.unknown'
  | 'sale.agreed'
  | 'rent.isHome'
  | 'rent.alreadyLet'
  | 'rent.indecent'
  | 'rent.dpeBanned'
  | 'rent.invalidRent'
  | 'rent.notListed'
  | 'rent.unknownApplication'
  | 'rent.noLease'
  | 'rent.noIncident'
  | 'rent.repairBooked'
  | 'rent.noSelfRepair'
  | 'agency.unknown'
  | 'home.already'
  | 'home.none'
  | 'time.notEnoughFreeTime'
  | 'account.insufficientFunds'
  | 'works.inProgress';

export function findOwned(state: GameState, propertyId: string): OwnedProperty | undefined {
  return state.properties.find((owned) => owned.property.id === propertyId);
}

function rentPerM2(content: GameContent, property: Property, rooms: number): number {
  const rents = findNeighbourhood(content, property.cityId, property.neighbourhoodId).rentPerM2;
  if (property.kind === 'house') return rents.house;
  return rooms <= content.renting.smallApartmentMaxRooms
    ? rents.smallApartment
    : rents.largeApartment;
}

/** Market rent factor of a neighbourhood: rents follow prices with an elasticity. */
export function rentLevel(content: GameContent, state: GameState, property: Property): number {
  const priceIndex =
    state.market.cities[property.cityId]?.[property.neighbourhoodId]?.priceIndex ?? 1;
  return priceIndex ** content.renting.priceIndexElasticity;
}

/** Co-ownership charges the tenant pays back each month. */
export function recoverableCharges(content: GameContent, property: Property): Cents {
  return Math.round(property.monthlyCharges * content.renting.recoverableChargesShare);
}

/**
 * Monthly rent a tenant would pay today, charges excluded; 0 if the property
 * is indecent. The city's rents per m² include charges: the recoverable
 * charges are taken out. `stateOf` replaces the true state of the items by
 * what the player believes (rent quotes before buying).
 */
export function marketRent(
  content: GameContent,
  state: GameState,
  property: Property,
  leaseType: LeaseType = 'bare',
  stateOf?: (item: WorkItem) => number,
): Cents {
  const rules = content.renting;
  if (isIndecent(content, property, stateOf)) return 0;
  const tiers = tierShare(content, property, 'rent', stateOf);
  // The tiers' rent bonus stops where their value bonus does (the neighbourhood's ceiling).
  const ceiling = tiers > 0 ? realValue(content, state, property).tierCeilingShare : 1;
  const factor =
    interpolateByState(rules.stateRentFactors, weightedState(content, property, stateOf)) *
    (1 + tiers * ceiling);
  const lots =
    property.kind === 'building'
      ? property.lots
      : [{ surface: property.surface, rooms: property.rooms }];
  const base = lots.reduce(
    (sum, lot) => sum + lot.surface * rentPerM2(content, property, lot.rooms),
    0,
  );
  const withCharges = toCents(
    base *
      factor *
      rules.dpeFactors[property.dpe] *
      rentLevel(content, state, property) *
      rules.leaseTypes[leaseType].rentFactor,
  );
  const rent = rules.dataRentsIncludeCharges
    ? withCharges - recoverableCharges(content, property)
    : withCharges;
  return Math.max(RENT_ROUNDING, Math.round(rent / RENT_ROUNDING) * RENT_ROUNDING);
}

/** Rents the player may ask today, around the market rent. */
export function rentRange(
  content: GameContent,
  state: GameState,
  property: Property,
  leaseType: LeaseType,
  stateOf?: (item: WorkItem) => number,
): { min: Cents; market: Cents; max: Cents } {
  const market = marketRent(content, state, property, leaseType, stateOf);
  const { min, max } = content.renting.rentRange;
  const round = (amount: number) => Math.round(amount / RENT_ROUNDING) * RENT_ROUNDING;
  return { min: round(market * min), market, max: round(market * max) };
}

/** First day a new lease is forbidden for this DPE class (null: never). */
export function letBanDay(content: GameContent, dpe: DpeLabel): number | null {
  const iso = content.renting.dpe.letBanFrom[dpe];
  const date = iso ? parseIsoDate(iso) : null;
  return date ? toDayNumber(date) : null;
}

/** Why a new lease cannot be signed on `day`, or null if it can. */
export function lettingBlock(
  content: GameContent,
  property: Property,
  day: number,
  stateOf?: (item: WorkItem) => number,
): 'rent.indecent' | 'rent.dpeBanned' | null {
  if (isIndecent(content, property, stateOf)) return 'rent.indecent';
  const ban = letBanDay(content, property.dpe);
  return ban !== null && day >= ban ? 'rent.dpeBanned' : null;
}

export function furnitureCost(content: GameContent, property: Property): Cents {
  const rules = content.renting.furniture;
  return toCents(
    Math.min(rules.maximum, Math.max(rules.minimum, Math.round(property.surface * rules.perM2))),
  );
}

/** Landlord insurance (propriétaire non occupant), per month. */
export function ownerInsurance(content: GameContent, property: Property): Cents {
  const rules = content.renting.ownerInsurance;
  return Math.round(toCents(rules.base + rules.perM2 * property.surface) / MONTHS_PER_YEAR);
}

/** Rents currently paid by tenants, charges excluded: the banks retain a share of them. */
export function currentRents(state: GameState): Cents {
  return state.properties.reduce((sum, owned) => sum + (owned.lease?.monthlyRent ?? 0), 0);
}

/** Security deposits held for the tenants (owed back to them). */
export function depositsHeld(state: GameState): Cents {
  return state.properties.reduce((sum, owned) => sum + (owned.lease?.deposit ?? 0), 0);
}

export interface RentalTerms {
  leaseType: LeaseType;
  monthlyRent: Cents;
  agencyId: string | null;
  insured: boolean;
}

/** Offers a property for rent, or changes the terms of its offer (candidates are lost). */
export function listForRent(
  ctx: SystemContext,
  propertyId: string,
  terms: RentalTerms,
): RentRefusal | null {
  const { content, state } = ctx;
  const owned = findOwned(state, propertyId);
  if (!owned) return 'property.unknown';
  if (state.player.homePropertyId === propertyId) return 'rent.isHome';
  if (owned.lease) return 'rent.alreadyLet';
  if (owned.sale?.agreement) return 'sale.agreed';
  const block = lettingBlock(content, owned.property, ctx.today);
  if (block) return block;
  if (heavyWorksInProgress(content, owned)) return 'works.inProgress';
  if (terms.agencyId !== null && !findAgency(content, terms.agencyId)) return 'agency.unknown';
  const range = rentRange(content, state, owned.property, terms.leaseType);
  if (
    !Number.isInteger(terms.monthlyRent) ||
    terms.monthlyRent < range.min ||
    terms.monthlyRent > range.max
  ) {
    return 'rent.invalidRent';
  }
  if (terms.leaseType === 'furnished' && !owned.furniture) {
    const cost = furnitureCost(content, owned.property);
    if (state.player.balance < cost) return 'account.insufficientFunds';
    state.player.balance -= cost;
    owned.furniture = { cost, boughtDay: ctx.today };
    ctx.events.push({ type: 'furnitureBought', propertyId, cost });
  }
  owned.rental = { ...terms, listedDay: ctx.today, applications: [] };
  ledgerOf(state, owned).category = terms.leaseType;
  ctx.events.push({ type: 'rentalListed', propertyId, ...terms });
  return null;
}

export function withdrawRental(ctx: SystemContext, propertyId: string): RentRefusal | null {
  const owned = findOwned(ctx.state, propertyId);
  if (!owned) return 'property.unknown';
  if (!owned.rental) return 'rent.notListed';
  owned.rental = null;
  ctx.events.push({ type: 'rentalWithdrawn', propertyId });
  return null;
}

/** Changes the management of a let or listed property (owner or agency). */
export function changeManagement(
  ctx: SystemContext,
  propertyId: string,
  agencyId: string | null,
): RentRefusal | null {
  const owned = findOwned(ctx.state, propertyId);
  if (!owned) return 'property.unknown';
  if (agencyId !== null && !findAgency(ctx.content, agencyId)) return 'agency.unknown';
  const target = owned.lease ?? owned.rental;
  if (!target) return 'rent.notListed';
  target.agencyId = agencyId;
  return null;
}

function moveIn(ctx: SystemContext, owned: OwnedProperty, application: RentalApplication) {
  const { content, state } = ctx;
  const rental = owned.rental;
  if (!rental) return;
  const rules = content.renting.leaseTypes[rental.leaseType];
  const profile = findTenantProfile(content, application.tenant.profileId);
  const termMonths =
    profile.contract === 'student' && rules.studentTermMonths !== null
      ? rules.studentTermMonths
      : rules.termMonths;
  const deposit = rental.monthlyRent * rules.depositMonths;
  const lease: Lease = {
    leaseType: rental.leaseType,
    tenant: application.tenant,
    monthlyRent: rental.monthlyRent,
    startDay: ctx.today,
    termDay: ctx.today + monthsToDays(termMonths),
    anniversaryDay: ctx.today + DAYS_PER_YEAR,
    revisionFactor: rentLevel(content, state, owned.property),
    deposit,
    agencyId: rental.agencyId,
    insured: rental.insured,
    satisfaction: content.renting.satisfaction.initial,
    noticeEndDay: null,
    incident: null,
    arrears: null,
  };
  state.player.balance += deposit;
  owned.lease = lease;
  owned.rental = null;
  ledgerOf(state, owned).category = lease.leaseType;
  ctx.events.push({
    type: 'tenantMovedIn',
    propertyId: owned.property.id,
    leaseType: lease.leaseType,
    monthlyRent: lease.monthlyRent,
    tenantName: `${lease.tenant.firstName} ${lease.tenant.lastName}`,
    agencyId: lease.agencyId,
  });
}

/** The owner picks a candidate; managing it himself, he shows the home and does the inventory. */
export function acceptApplication(
  ctx: SystemContext,
  propertyId: string,
  applicationId: string,
): RentRefusal | null {
  const { content, state } = ctx;
  const owned = findOwned(state, propertyId);
  if (!owned) return 'property.unknown';
  const rental = owned.rental;
  if (!rental) return 'rent.notListed';
  const application = rental.applications.find((a) => a.id === applicationId);
  if (!application) return 'rent.unknownApplication';
  if (rental.agencyId === null) {
    const minutes = content.renting.selfManagement.moveInMinutes;
    if (state.player.freeTimeMinutes < minutes) return 'time.notEnoughFreeTime';
    state.player.freeTimeMinutes -= minutes;
  }
  moveIn(ctx, owned, application);
  return null;
}

export function rejectApplication(
  ctx: SystemContext,
  propertyId: string,
  applicationId: string,
): RentRefusal | null {
  const owned = findOwned(ctx.state, propertyId);
  if (!owned) return 'property.unknown';
  const rental = owned.rental;
  if (!rental) return 'rent.notListed';
  if (!rental.applications.some((a) => a.id === applicationId)) return 'rent.unknownApplication';
  rental.applications = rental.applications.filter((a) => a.id !== applicationId);
  return null;
}

/** Candidates arrive (fewer when the rent is high), expire, or are picked by the agency. */
export function runDailyRentalListings(ctx: SystemContext): void {
  const { content, state } = ctx;
  const rules = content.renting.applications;
  for (const owned of state.properties) {
    const rental = owned.rental;
    if (!rental) continue;
    const propertyId = owned.property.id;
    // A sale is agreed: the buyer gets the property empty.
    if (owned.sale?.agreement) {
      owned.rental = null;
      ctx.events.push({ type: 'rentalWithdrawn', propertyId });
      continue;
    }
    const block = lettingBlock(content, owned.property, ctx.today);
    if (block) {
      owned.rental = null;
      ctx.events.push({ type: 'rentalBlocked', propertyId, reason: block });
      continue;
    }
    rental.applications = rental.applications.filter((a) => {
      if (a.expiresDay > ctx.today) return true;
      ctx.events.push({ type: 'applicationExpired', propertyId, applicationId: a.id });
      return false;
    });
    const agency = rental.agencyId === null ? undefined : findAgency(content, rental.agencyId);
    const market = marketRent(content, state, owned.property, rental.leaseType);
    if (rental.applications.length < rules.maxPending && market > 0) {
      const chance =
        rules.dailyProbability *
        (agency?.applicationRate ?? 1) *
        Math.exp(-rules.rentSensitivity * (rental.monthlyRent / market - 1));
      if (nextFloat(state.rng) < Math.min(1, chance))
        receiveApplication(ctx, owned, rental, market);
    }
    if (
      agency &&
      rental.applications.length > 0 &&
      ctx.today - rental.listedDay >= agency.selectionDays
    ) {
      // The agency ranks candidates on their file, with its own judgement errors.
      let best: { application: RentalApplication; score: number } | null = null;
      for (const application of rental.applications) {
        const score =
          visibleReliability(content, application.tenant, rental.monthlyRent) +
          agency.judgementNoise * nextNormal(state.rng);
        if (!best || score > best.score) best = { application, score };
      }
      if (best) moveIn(ctx, owned, best.application);
    }
  }
}

function receiveApplication(
  ctx: SystemContext,
  owned: OwnedProperty,
  rental: RentalListing,
  market: Cents,
): void {
  const { content, state } = ctx;
  const propertyId = owned.property.id;
  // Managing it himself, the owner shows the home to each candidate.
  if (rental.agencyId === null) {
    const minutes = content.renting.selfManagement.visitMinutes;
    if (state.player.freeTimeMinutes < minutes) {
      ctx.events.push({ type: 'rentalVisitMissed', propertyId });
      return;
    }
    state.player.freeTimeMinutes -= minutes;
  }
  const agency = rental.agencyId === null ? undefined : findAgency(content, rental.agencyId);
  const { validityDays } = content.renting.applications;
  const application: RentalApplication = {
    id: `application-${state.nextId++}`,
    tenant: drawTenant(ctx, rental.leaseType, rental.monthlyRent, market, agency),
    expiresDay: ctx.today + nextInt(state.rng, validityDays.min, validityDays.max),
  };
  rental.applications.push(application);
  ctx.events.push({ type: 'applicationReceived', propertyId, applicationId: application.id });
}

/**
 * The tenant leaves: exit inventory, damages taken from the deposit, the
 * rest given back. The property goes back on the rental market with the same
 * terms when the law allows it.
 */
export function moveOut(
  ctx: SystemContext,
  owned: OwnedProperty,
  reason: 'notice' | 'evicted' | 'endOfTerm' | 'dpe',
): void {
  const { content, state } = ctx;
  const lease = owned.lease;
  if (!lease) return;
  const rules = content.renting;
  const tenant = lease.tenant;
  const damages =
    nextFloat(state.rng) < rules.damages.probability * (1 - tenant.reliability)
      ? toCents(
          Math.round(
            owned.property.surface *
              nextRange(state.rng, rules.damages.perM2.min, rules.damages.perM2.max),
          ),
        )
      : 0;
  // Unpaid rents covered by the insurer are no longer the owner's to recover.
  const owed = lease.arrears && !lease.insured ? lease.arrears.amount : 0;
  const keptForDamages = Math.min(lease.deposit, damages);
  const keptForRent = Math.min(lease.deposit - keptForDamages, owed);
  const returned = lease.deposit - keptForDamages - keptForRent;
  state.player.balance -= returned + damages;
  addCost(state, owned, damages - keptForDamages);
  addRent(state, owned, keptForRent);
  owned.lease = null;
  const propertyId = owned.property.id;
  ctx.events.push({ type: 'tenantLeft', propertyId, reason, damages, depositReturned: returned });
  if (state.player.homePropertyId === propertyId || owned.sale?.agreement) return;
  const block = lettingBlock(content, owned.property, ctx.today);
  if (block) {
    ctx.events.push({ type: 'rentalBlocked', propertyId, reason: block });
    return;
  }
  owned.rental = {
    leaseType: lease.leaseType,
    monthlyRent: lease.monthlyRent,
    agencyId: lease.agencyId,
    insured: lease.insured,
    listedDay: ctx.today,
    applications: [],
  };
  // The old rent may have left the allowed range: it is brought back inside.
  const range = rentRange(content, state, owned.property, lease.leaseType);
  owned.rental.monthlyRent = Math.min(range.max, Math.max(range.min, lease.monthlyRent));
  ctx.events.push({ type: 'rentalListed', propertyId, ...termsOf(owned.rental) });
}

function termsOf(rental: RentalListing): RentalTerms {
  const { leaseType, monthlyRent, agencyId, insured } = rental;
  return { leaseType, monthlyRent, agencyId, insured };
}

/** The player moves into one of his properties (résidence principale): no more rent to pay. */
export function moveIntoHome(ctx: SystemContext, propertyId: string): RentRefusal | null {
  const { state } = ctx;
  const owned = findOwned(state, propertyId);
  if (!owned) return 'property.unknown';
  if (state.player.homePropertyId === propertyId) return 'home.already';
  if (owned.lease) return 'rent.alreadyLet';
  if (owned.sale?.agreement) return 'sale.agreed';
  owned.rental = null;
  state.player.homePropertyId = propertyId;
  state.player.monthlyRent = 0;
  ctx.events.push({ type: 'movedIntoHome', propertyId });
  return null;
}

/** The player leaves his own home and rents again. */
export function moveOutOfHome(ctx: SystemContext): RentRefusal | null {
  const { content, state } = ctx;
  const propertyId = state.player.homePropertyId;
  if (propertyId === null) return 'home.none';
  state.player.homePropertyId = null;
  state.player.monthlyRent = toCents(content.start.monthlyRent);
  ctx.events.push({ type: 'movedOutOfHome', propertyId });
  return null;
}
