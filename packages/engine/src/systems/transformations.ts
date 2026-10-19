import { findCity, type GameContent } from '../content.ts';
import { type Cents, toCents } from '../money.ts';
import { nextFloat, nextInt, nextRange } from '../random.ts';
import type { GameState, OwnedProperty, Property, TransformationKind, WorkItem } from '../state.ts';
import type { SystemContext } from './context.ts';
import { crisisFactor } from './crises.ts';
import {
  blankItems,
  calibrateEnergy,
  dpeOf,
  energyNeeds,
  freezeDwelling,
  itemId,
  layoutSpaces,
} from './dwelling.ts';
import { realValue } from './valuation.ts';

/**
 * Transformations (docs/03-systemes/05, milestone 8), always led by the project manager: a
 * house divided into flats, a building sold flat by flat, an attic converted, a house built on
 * a plot. One quote, a deposit, one bill at the end; the result replaces the property, or
 * produces several (the lots).
 */

export type TransformationRefusal =
  | 'property.unknown'
  | 'transformation.notAllowed'
  | 'transformation.noAttic'
  | 'transformation.occupied'
  | 'transformation.forSale'
  | 'transformation.isHome'
  | 'works.inProgress'
  | 'sale.agreed'
  | 'account.insufficientFunds';

/** What a transformation would produce and cost, as quoted by the project manager. */
export interface TransformationQuote {
  kind: TransformationKind;
  /** Works before the project manager, his fee, and the total. */
  works: Cents;
  fee: Cents;
  total: Cents;
  days: number;
  /** Flats produced (division, building sold flat by flat); null when one property stays. */
  lots: { surface: number; rooms: number }[] | null;
  /** Living area once done (the sum of the lots when there are some). */
  surfaceAfter: number;
}

const DAYS_PER_MONTH = 30;

function findOwned(state: GameState, propertyId: string): OwnedProperty | undefined {
  return state.properties.find((owned) => owned.property.id === propertyId);
}

function roomsFor(content: GameContent, cityId: string, kind: 'apartment' | 'house', m2: number) {
  return Math.max(1, Math.round(m2 / findCity(content, cityId).commune.m2PerRoom[kind]));
}

/** The flats a house is cut into: about the target area each, within the bounds of their number. */
function divisionLots(content: GameContent, property: Property) {
  const rules = content.works.transformations;
  const count = Math.min(
    rules.divisionLots.max,
    Math.max(rules.divisionLots.min, Math.round(property.surface / rules.divisionLotSurface)),
  );
  const surface = Math.round(property.surface / count);
  return Array.from({ length: count }, () => ({
    surface,
    rooms: roomsFor(content, property.cityId, 'apartment', surface),
  }));
}

function constructionSurface(content: GameContent, plot: number): number {
  const rules = content.works.transformations.constructionSurface;
  return Math.round(Math.min(rules.max, Math.max(rules.min, plot * rules.share)));
}

export function transformationQuote(
  content: GameContent,
  state: GameState,
  owned: OwnedProperty,
  kind: TransformationKind,
): TransformationQuote | TransformationRefusal {
  const rules = content.works.transformations.rules[kind];
  const { property } = owned;
  if (property.kind !== rules.kind || property.surface < rules.minSurface) {
    return 'transformation.notAllowed';
  }
  if (kind === 'attic' && property.atticSurface <= 0) return 'transformation.noAttic';
  const lots =
    kind === 'division'
      ? divisionLots(content, property)
      : kind === 'splitBuilding'
        ? property.lots.map((lot) => ({ ...lot }))
        : null;
  if (kind === 'splitBuilding' && (lots?.length ?? 0) < 2) return 'transformation.notAllowed';
  const surfaceAfter =
    kind === 'attic'
      ? property.surface + property.atticSurface
      : kind === 'construction'
        ? constructionSurface(content, property.surface)
        : property.surface;
  // Per m² of what is created or redone: the attic itself, the new house, the divided house.
  const area = kind === 'attic' ? property.atticSurface : surfaceAfter;
  const index = content.works.cityCostIndex[property.cityId] ?? 1;
  const value = realValue(content, state, property).value;
  const works = Math.round(
    (toCents(rules.costPerM2 * area + rules.costPerLot * (lots?.length ?? 0)) * index +
      value * rules.costShareOfValue) *
      crisisFactor(state, 'worksCosts'),
  );
  const fee = Math.round(works * content.works.projectManager.feeShare);
  return {
    kind,
    works,
    fee,
    total: works + fee,
    days: rules.months * DAYS_PER_MONTH,
    lots,
    surfaceAfter,
  };
}

/** Pays a transformation from the works envelope first: it counts in the capital gain, not the rents. */
function payTransformation(ctx: SystemContext, owned: OwnedProperty, amount: Cents): void {
  const fund = owned.worksFund;
  const fromFund = fund ? Math.max(0, Math.min(fund.amount, amount)) : 0;
  if (fund) fund.amount -= fromFund;
  ctx.state.player.balance -= amount - fromFund;
  if (owned.works) owned.works.paid += amount;
  owned.worksForCapitalGains += amount;
}

/** Signs the project manager's quote: the property must be empty, the deposit is paid now. */
export function startTransformation(
  ctx: SystemContext,
  propertyId: string,
  kind: TransformationKind,
): TransformationRefusal | null {
  const { content, state } = ctx;
  const owned = findOwned(state, propertyId);
  if (!owned) return 'property.unknown';
  if (owned.works) return 'works.inProgress';
  if (owned.sale?.agreement) return 'sale.agreed';
  if (owned.sale) return 'transformation.forSale';
  if (owned.lease) return 'transformation.occupied';
  // One lives in a house whose attic is converted, not in a house one divides.
  if (state.player.homePropertyId === propertyId && kind !== 'attic') {
    return 'transformation.isHome';
  }
  const quote = transformationQuote(content, state, owned, kind);
  if (typeof quote === 'string') return quote;
  const deposit = Math.round(quote.total * content.works.quotes.depositShare);
  const available = Math.max(0, state.player.balance) + (owned.worksFund?.amount ?? 0);
  if (available < deposit) return 'account.insufficientFunds';
  if (owned.rental) {
    owned.rental = null;
    ctx.events.push({ type: 'rentalWithdrawn', propertyId });
  }
  const rules = content.works.transformations.overrun;
  const overrun =
    nextFloat(state.rng) < rules.chance
      ? nextRange(state.rng, rules.share.min, rules.share.max)
      : 0;
  const endDay = ctx.today + quote.days;
  owned.works = {
    id: `works-${state.nextId++}`,
    startDay: ctx.today,
    tasks: [],
    managed: true,
    transformation: { kind, total: quote.total, endDay, overrun },
    hazard: null,
    dpeBefore: owned.property.dpe,
    paid: 0,
  };
  payTransformation(ctx, owned, deposit);
  ctx.events.push({
    type: 'transformationStarted',
    propertyId,
    kind,
    total: quote.total,
    endDay,
  });
  return null;
}

/** Every item new, standard range, known. */
function newItems(content: GameContent, property: Property): WorkItem[] {
  return blankItems(content, property.kind, property.spaces).map((item) => ({
    ...item,
    state: 5,
    tier: 'standard',
    known: true,
  }));
}

/** A property after its rooms changed: items kept where they were, new ones fresh. */
function relaid(content: GameContent, property: Property, kept: readonly WorkItem[]): Property {
  const byId = new Map(kept.map((item) => [itemId(item), item]));
  const items = newItems(content, property).map((item) => byId.get(itemId(item)) ?? item);
  const next = { ...property, items };
  return { ...next, dpe: dpeOf(content, energyNeeds(content, next)) };
}

/** One flat of a divided house or of a building sold flat by flat. */
function flatOf(
  ctx: SystemContext,
  source: Property,
  lot: { surface: number; rooms: number },
  floor: number,
  count: number,
  items: (flat: Property) => WorkItem[],
): Property {
  const { content, state } = ctx;
  const spaces = layoutSpaces(content, 'apartment', lot.surface, lot.rooms, []);
  const base: Property = {
    id: `property-${state.nextId++}`,
    cityId: source.cityId,
    neighbourhoodId: source.neighbourhoodId,
    kind: 'apartment',
    surface: lot.surface,
    rooms: lot.rooms,
    floor,
    lots: [],
    epoch: source.epoch,
    dpe: source.dpe,
    spaces,
    items: [],
    energyFactor: source.energyFactor,
    atticSurface: 0,
    copro: { lots: count, meetingMonth: nextInt(state.rng, 1, 12) },
    postponedHazards: [],
    defects: source.defects.map((defect) => ({ ...defect })),
    annualPropertyTax: toCents(
      Math.round(lot.surface * content.market.ownership.propertyTaxPerM2.apartment),
    ),
    monthlyCharges: toCents(
      Math.round(lot.surface * content.market.ownership.coOwnershipChargesPerM2),
    ),
  };
  const flat = { ...base, items: items(base) };
  return { ...flat, dpe: dpeOf(content, energyNeeds(content, flat)) };
}

/** The flats of a building: each keeps its own rooms' items and the building's common ones. */
function buildingFlatItems(content: GameContent, building: Property, index: number) {
  const prefix = `l${index + 1}-`;
  return (flat: Property): WorkItem[] =>
    blankItems(content, 'apartment', flat.spaces).map((item) => {
      const source = building.items.find((candidate) =>
        item.spaceId === null
          ? candidate.spaceId === null && candidate.kind === item.kind
          : candidate.spaceId === `${prefix}${item.spaceId}` && candidate.kind === item.kind,
      );
      return source ? { ...item, state: source.state, tier: source.tier, known: true } : item;
    });
}

/** Owned flats from one owned property, its cost and works shared by area. */
function shareOwnership(
  owned: OwnedProperty,
  flats: Property[],
): { flats: OwnedProperty[]; firstId: string } {
  const total = flats.reduce((sum, flat) => sum + flat.surface, 0);
  const share = (amount: Cents, flat: Property) => Math.round((amount * flat.surface) / total);
  const result = flats.map((flat, i) => ({
    ...owned,
    property: flat,
    purchasePrice: share(owned.purchasePrice, flat),
    acquisitionCost: share(owned.acquisitionCost, flat),
    purchaseDate: { ...owned.purchaseDate },
    sale: null,
    rental: null,
    lease: null,
    furniture: null,
    taxRegime: owned.taxRegime,
    furnishedTax: {
      deferredDepreciation: 0,
      deficitCarry: 0,
      buildingDepreciationDeducted: share(owned.furnishedTax.buildingDepreciationDeducted, flat),
      works: [],
    },
    quotes: [],
    works: null,
    // What is left of the works envelope goes with the first flat (and its loan).
    worksFund: i === 0 ? owned.worksFund : null,
    worksForCapitalGains: share(owned.worksForCapitalGains, flat),
    coproMeeting: null,
    coproCalls: [],
  }));
  return { flats: result, firstId: flats[0]?.id ?? owned.property.id };
}

/** The bill is paid and the property becomes what the project made of it. */
export function finishTransformation(ctx: SystemContext, owned: OwnedProperty): void {
  const { content, state } = ctx;
  const project = owned.works;
  const transformation = project?.transformation;
  if (!project || !transformation) return;
  const bill = Math.round(transformation.total * (1 + transformation.overrun));
  payTransformation(ctx, owned, Math.max(0, bill - project.paid));
  owned.works = null;
  const source = owned.property;
  const quote = transformationQuote(content, state, owned, transformation.kind);
  let produced: string[] = [source.id];
  switch (transformation.kind) {
    case 'attic': {
      const surface = source.surface + source.atticSurface;
      const rooms = source.rooms + 1;
      const spaces = layoutSpaces(content, 'house', surface, rooms, []);
      owned.property = relaid(
        content,
        {
          ...source,
          surface,
          rooms,
          atticSurface: 0,
          spaces,
          annualPropertyTax: Math.round((source.annualPropertyTax * surface) / source.surface),
        },
        source.items,
      );
      break;
    }
    case 'construction': {
      const surface = constructionSurface(content, source.surface);
      const rooms = roomsFor(content, source.cityId, 'house', surface);
      const spaces = layoutSpaces(content, 'house', surface, rooms, []);
      const built: Property = {
        ...source,
        kind: 'house',
        surface,
        rooms,
        epoch: 'after2012',
        dpe: content.works.transformations.constructionDpe,
        spaces,
        items: [],
        energyFactor: 1,
        annualPropertyTax: toCents(
          Math.round(surface * content.market.ownership.propertyTaxPerM2.house),
        ),
        monthlyCharges: 0,
      };
      const withItems = { ...built, items: newItems(content, built) };
      // Built to its target class: the energy model is calibrated on it.
      owned.property = { ...withItems, energyFactor: calibrateEnergy(content, withItems) };
      break;
    }
    case 'division':
    case 'splitBuilding': {
      const lots = typeof quote === 'string' ? [] : (quote.lots ?? []);
      const flats = lots.map((lot, i) =>
        flatOf(
          ctx,
          source,
          lot,
          i,
          lots.length,
          transformation.kind === 'division'
            ? (flat) => newItems(content, flat)
            : buildingFlatItems(content, source, i),
        ),
      );
      if (flats.length === 0) break;
      const { flats: ownedFlats, firstId } = shareOwnership(owned, flats);
      for (const flat of ownedFlats) freezeDwelling(flat.property);
      state.properties = state.properties.flatMap((candidate) =>
        candidate === owned ? ownedFlats : [candidate],
      );
      // The loan follows the first flat: it is repaid when that one is sold.
      for (const loan of state.loans) if (loan.propertyId === source.id) loan.propertyId = firstId;
      produced = flats.map((flat) => flat.id);
      break;
    }
  }
  if (produced.length === 1 && produced[0] === source.id) freezeDwelling(owned.property);
  state.worksDone[source.cityId] = (state.worksDone[source.cityId] ?? 0) + 1;
  ctx.events.push({
    type: 'transformationCompleted',
    propertyId: source.id,
    kind: transformation.kind,
    cost: bill,
    propertyIds: produced,
  });
}

/** Daily: a transformation whose end has come is finished. */
export function runDailyTransformations(ctx: SystemContext): void {
  for (const owned of [...ctx.state.properties]) {
    const transformation = owned.works?.transformation;
    if (transformation && ctx.today >= transformation.endDay) finishTransformation(ctx, owned);
  }
}
