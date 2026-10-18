import {
  type DefectRule,
  type DwellingKind,
  type Epoch,
  findCity,
  findNeighbourhood,
  type GameContent,
  type NeighbourhoodData,
} from '../content.ts';
import { type Cents, toCents } from '../money.ts';
import type { GameState, Property, PropertyKind, WorkItem } from '../state.ts';
import {
  conditionLabel,
  expectedState,
  interpolateByState,
  stateValueFactor,
  tierShare,
  valueCeilingPerM2,
} from './dwelling.ts';

/** Kind whose statistics a property uses: a building is valued flat by flat. */
export function dwellingKindOf(kind: PropertyKind): DwellingKind {
  return kind === 'house' ? 'house' : 'apartment';
}

/** Chance that a property of this epoch and kind has a nuisance. */
export function defectProbability(rule: DefectRule, kind: PropertyKind, epoch: Epoch): number {
  if (!rule.kinds.includes(kind)) return 0;
  const epochMultiplier = rule.epochMultipliers?.[epoch] ?? 1;
  return Math.min(0.95, rule.probability * epochMultiplier);
}

const floorFactorCache = new WeakMap<GameContent, Map<number, number>>();

function floorFactor(content: GameContent, floor: number | null): number {
  if (floor === null) return 1;
  let cache = floorFactorCache.get(content);
  if (!cache) {
    cache = new Map();
    floorFactorCache.set(content, cache);
  }
  const cached = cache.get(floor);
  if (cached !== undefined) return cached;
  const factors = content.market.apartment.floorFactors;
  const known = Object.keys(factors)
    .map(Number)
    .filter((key) => key <= floor);
  const factor = factors[String(Math.max(0, ...known))] ?? 1;
  cache.set(floor, factor);
  return factor;
}

/**
 * Average of the value factors over the distributions listings are drawn
 * from: dividing by it keeps the average generated value on the observed
 * median price per m² (epoch, DPE, condition, floor and nuisances).
 */
/** Two-level cache keyed by content, then by strings (valuation runs for every listing daily). */
function cacheFor<V>(
  caches: WeakMap<GameContent, Map<string, Map<string, V>>>,
  content: GameContent,
  first: string,
): Map<string, V> {
  let byContent = caches.get(content);
  if (!byContent) {
    byContent = new Map();
    caches.set(content, byContent);
  }
  let byFirst = byContent.get(first);
  if (!byFirst) {
    byFirst = new Map();
    byContent.set(first, byFirst);
  }
  return byFirst;
}

const offsetCache = new WeakMap<GameContent, number>();

/** Mean generation offset of the items, weighted by their value (energy offsets average out). */
function averageOffset(content: GameContent): number {
  let cached = offsetCache.get(content);
  if (cached === undefined) {
    const rules = Object.values(content.works.items);
    const total = rules.reduce((sum, rule) => sum + rule.valueWeight, 0);
    cached =
      total > 0
        ? rules.reduce((sum, rule) => sum + rule.valueWeight * rule.generationOffset, 0) / total
        : 0;
    offsetCache.set(content, cached);
  }
  return cached;
}

const normalizationCache = new WeakMap<GameContent, Map<string, Map<string, number>>>();
const neighbourhoodCache = new WeakMap<GameContent, Map<string, Map<string, NeighbourhoodData>>>();

function neighbourhoodOf(content: GameContent, cityId: string, id: string): NeighbourhoodData {
  const cache = cacheFor(neighbourhoodCache, content, cityId);
  let found = cache.get(id);
  if (!found) {
    found = findNeighbourhood(content, cityId, id);
    cache.set(id, found);
  }
  return found;
}
export function valueNormalization(
  content: GameContent,
  cityId: string,
  neighbourhood: NeighbourhoodData,
  kind: PropertyKind,
): number {
  const cache = cacheFor(normalizationCache, content, cityId);
  const key = kind === 'apartment' ? neighbourhood.id : `${neighbourhood.id}/${kind}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const rules = content.market;
  const dwelling = dwellingKindOf(kind);
  const city = findCity(content, cityId);
  let total = 0;
  for (const [epoch, epochShare] of Object.entries(neighbourhood.epochShares[dwelling]) as [
    Epoch,
    number,
  ][]) {
    const dpeTable = city.commune.dpeByEpoch[dwelling][epoch];
    const dpe = Object.entries(dpeTable).reduce(
      (sum, [label, share]) =>
        sum + share * rules.dpeFactors[label as keyof typeof rules.dpeFactors],
      0,
    );
    const weights = rules.conditionWeights[epoch];
    const weightTotal = Object.values(weights).reduce((a, b) => a + b, 0);
    let conditions = 0;
    for (const [condition, weight] of Object.entries(weights) as [keyof typeof weights, number][]) {
      // Items are drawn around the condition's mean state (see dwelling.drawDwelling).
      const state = rules.conditions[condition].meanState + averageOffset(content);
      conditions += (weight / weightTotal) * interpolateByState(content.works.valueByState, state);
    }
    let defects = 1;
    for (const rule of rules.defects) {
      defects *= 1 - defectProbability(rule, kind, epoch) * rule.valueImpactShare;
    }
    conditions *= defects;
    total += epochShare * rules.epochFactors[epoch] * dpe * conditions;
  }
  if (kind === 'apartment') {
    let floors = 0;
    for (let floor = 0; floor <= rules.apartment.maxFloor; floor++)
      floors += floorFactor(content, floor);
    total *= floors / (rules.apartment.maxFloor + 1);
  }
  cache.set(key, total);
  return total;
}

/** How the engine reached a value, for the interface's « pourquoi ce montant ? ». */
export interface ValueBreakdown {
  /** Observed median price per m² of the neighbourhood (data date). */
  medianPricePerM2: number;
  priceIndex: number;
  surfaceFactor: number;
  epochFactor: number;
  dpeFactor: number;
  /** Factor of the dwelling's weighted state (rooms and elements). */
  stateFactor: number;
  /** Bonus of the renovations' tiers, within the neighbourhood's ceiling. */
  tierFactor: number;
  /** Share of the tiers' bonus the ceiling lets through (1: all of it). */
  tierCeilingShare: number;
  floorFactor: number;
  /** Product of (1 − impact) over the nuisances counted. */
  defectsFactor: number;
  normalization: number;
  /** Discount for selling a whole building at once. */
  buildingFactor: number;
  value: Cents;
}

function surfaceValue(
  content: GameContent,
  property: Property,
  dwelling: DwellingKind,
  surface: number,
): number {
  const city = findCity(content, property.cityId);
  const neighbourhood = neighbourhoodOf(content, property.cityId, property.neighbourhoodId);
  const stats = neighbourhood.sales[dwelling];
  const elasticity = city.commune.surfaceElasticity[dwelling];
  return surface * (surface / stats.medianSurface) ** elasticity;
}

/**
 * Value of a property given the state of its items (`stateOf` lets the
 * estimate replace unknown items by their expectation) and a factor for its
 * nuisances.
 */
function valueWith(
  content: GameContent,
  state: GameState,
  property: Property,
  stateOf: ((item: WorkItem) => number) | undefined,
  defectsFactor: number,
): ValueBreakdown {
  const rules = content.market;
  const dwelling = dwellingKindOf(property.kind);
  const neighbourhood = neighbourhoodOf(content, property.cityId, property.neighbourhoodId);
  const median = neighbourhood.sales[dwelling].pricePerM2.median;
  const priceIndex =
    state.market.cities[property.cityId]?.[property.neighbourhoodId]?.priceIndex ?? 1;
  const lots = property.kind === 'building' ? property.lots : [{ surface: property.surface }];
  const weightedSurface = lots.reduce(
    (sum, lot) => sum + surfaceValue(content, property, dwelling, lot.surface),
    0,
  );
  const surfaceFactor = property.surface > 0 ? weightedSurface / property.surface : 1;
  const epochFactor = rules.epochFactors[property.epoch];
  const dpeFactor = rules.dpeFactors[property.dpe];
  const stateFactor = stateValueFactor(content, property, stateOf);
  const floor = floorFactor(content, property.floor);
  const normalization = valueNormalization(content, property.cityId, neighbourhood, property.kind);
  const buildingFactor = property.kind === 'building' ? rules.building.valueFactor : 1;
  const base =
    (property.surface *
      median *
      priceIndex *
      surfaceFactor *
      epochFactor *
      dpeFactor *
      stateFactor *
      floor *
      defectsFactor *
      buildingFactor) /
    normalization;
  // Premium in a modest neighbourhood: the bonus stops at the neighbourhood's ceiling.
  const tiers = tierShare(content, property, 'value', stateOf);
  let tierFactor = 1 + tiers;
  let tierCeilingShare = 1;
  if (tiers > 0) {
    const ceiling =
      property.surface *
      valueCeilingPerM2(content, property) *
      priceIndex *
      surfaceFactor *
      buildingFactor;
    const bonus = Math.min(base * tiers, Math.max(0, ceiling - base));
    tierCeilingShare = bonus / (base * tiers);
    tierFactor = 1 + bonus / base;
  }
  return {
    medianPricePerM2: median,
    priceIndex,
    surfaceFactor,
    epochFactor,
    dpeFactor,
    stateFactor,
    tierFactor,
    tierCeilingShare,
    floorFactor: floor,
    defectsFactor,
    normalization,
    buildingFactor,
    value: toCents(Math.round(base * tierFactor)),
  };
}

function impactOf(content: GameContent, defectId: string): number {
  return content.market.defects.find((rule) => rule.id === defectId)?.valueImpactShare ?? 0;
}

/** Real value, hidden states and nuisances included: what the market would pay with full knowledge. */
export function realValue(
  content: GameContent,
  state: GameState,
  property: Property,
): ValueBreakdown {
  const defects = property.defects.reduce(
    (product, d) => product * (1 - impactOf(content, d.id)),
    1,
  );
  return valueWith(content, state, property, undefined, defects);
}

export interface Estimate {
  estimate: Cents;
  low: Cents;
  high: Cents;
  breakdown: ValueBreakdown;
}

/** The player's view of an item: its state if known, otherwise its expectation. */
export function believedState(
  content: GameContent,
  property: Property,
): (item: WorkItem) => number {
  const condition = conditionLabel(content, property);
  return (item) => (item.known ? item.state : expectedState(content, property, item, condition));
}

/**
 * Estimate from what the player knows: known items at their state, the
 * others at the expectation of the announced condition; revealed nuisances
 * count fully, the others by their probability given what visits have (not)
 * shown.
 */
export function estimateValue(
  content: GameContent,
  state: GameState,
  property: Property,
  visited: boolean,
): Estimate {
  let factor = 1;
  for (const rule of content.market.defects) {
    const defect = property.defects.find((d) => d.id === rule.id);
    if (defect?.revealed) {
      factor *= 1 - rule.valueImpactShare;
      continue;
    }
    const prior = defectProbability(rule, property.kind, property.epoch);
    // Bayes: not revealed by a visit makes the nuisance less likely.
    const chance = visited
      ? (prior * (1 - rule.revealChanceOnVisit)) / (1 - prior * rule.revealChanceOnVisit)
      : prior;
    factor *= 1 - chance * rule.valueImpactShare;
  }
  const breakdown = valueWith(content, state, property, believedState(content, property), factor);
  const spread = content.market.pricing.estimateSpread;
  return {
    estimate: breakdown.value,
    low: Math.round(breakdown.value * (1 - spread)),
    high: Math.round(breakdown.value * (1 + spread)),
    breakdown,
  };
}
