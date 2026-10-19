import {
  type Condition,
  type DpeLabel,
  type Epoch,
  findNeighbourhood,
  type GameContent,
  type ItemKind,
  type ItemRule,
  type SpaceKind,
  type Tier,
} from '../content.ts';
import { CONDITIONS, DPE_LABELS } from '../content-constants.ts';
import { nextNormal, nextRange, type RngState } from '../random.ts';
import type {
  OwnedProperty,
  Property,
  PropertyKind,
  Space,
  WorkItem,
  WorksTask,
} from '../state.ts';

/**
 * The structure of a dwelling (docs/03-systemes/05, « La structure d'un
 * bien »): rooms with their postes, elements of the whole dwelling, each in a
 * state from 1 to 5. This module derives everything the other systems read
 * from it: weighted state, value and rent factors, decency, energy class.
 */

const MIN_STATE = 1;
const MAX_STATE = 5;
const SURFACE_STEP = 0.5;

/**
 * Items and rooms are replaced, never mutated: frozen, they are shared
 * between the copies of the state (see clone.ts) and their derived values
 * stay cached.
 */
export function freezeItems(items: WorkItem[]): WorkItem[] {
  for (const item of items) Object.freeze(item);
  return Object.freeze(items) as WorkItem[];
}

export function freezeSpaces(spaces: Space[]): Space[] {
  for (const space of spaces) Object.freeze(space);
  return Object.freeze(spaces) as Space[];
}

/**
 * Freezes a property's rooms and items, and its small nested data (lots, nuisances, hazards put
 * off, co-ownership): they are replaced, never mutated, so the copies of the state share them.
 */
export function freezeDwelling(property: Property): void {
  property.items = freezeItems(property.items);
  property.spaces = freezeSpaces(property.spaces);
  freezeNested(property);
}

/** Freezes the nested data of a property, not the property itself (its fields change). */
export function freezeNested(property: Property): void {
  for (const lot of property.lots) Object.freeze(lot);
  Object.freeze(property.lots);
  for (const defect of property.defects) Object.freeze(defect);
  Object.freeze(property.defects);
  for (const hazard of property.postponedHazards) Object.freeze(hazard);
  Object.freeze(property.postponedHazards);
  if (property.copro) Object.freeze(property.copro);
}

export type DwellingPropertyKind = 'apartment' | 'house' | 'building';

/** Energy class recorded on a shop, a parking space or land: the housing DPE rules skip them. */
export const OTHER_KIND_DPE: DpeLabel = 'D';

/** Apartments, houses and buildings have rooms and items; shops, parking spaces and land do not. */
export function isDwelling(kind: PropertyKind): kind is DwellingPropertyKind {
  return kind === 'apartment' || kind === 'house' || kind === 'building';
}

export function clampState(state: number): number {
  return Math.min(MAX_STATE, Math.max(MIN_STATE, state));
}

export function itemId(item: Pick<WorkItem, 'kind' | 'spaceId'>): string {
  return item.spaceId === null ? item.kind : `${item.spaceId}.${item.kind}`;
}

export function findItem(property: Property, id: string): WorkItem | undefined {
  return property.items.find((item) => itemId(item) === id);
}

export function itemRule(content: GameContent, kind: ItemKind): ItemRule {
  return content.works.items[kind];
}

/** Value between the five points of a by-state table, for a fractional state. */
export function interpolateByState(table: readonly number[], state: number): number {
  const position = clampState(state) - MIN_STATE;
  const low = Math.floor(position);
  const high = Math.min(table.length - 1, low + 1);
  const a = table[low] ?? 0;
  const b = table[high] ?? a;
  return a + (b - a) * (position - low);
}

function roundSurface(surface: number): number {
  return Math.max(SURFACE_STEP, Math.round(surface / SURFACE_STEP) * SURFACE_STEP);
}

/** Splits one flat or house into rooms (deterministic from its area and number of rooms). */
function layoutDwelling(
  content: GameContent,
  surface: number,
  rooms: number,
  prefix: string,
  withGarden: boolean,
): Space[] {
  const layout = content.works.layout;
  const sized = (rule: { share: number; min: number; max: number }) =>
    Math.min(rule.max, Math.max(rule.min, surface * rule.share));
  const parts: { kind: SpaceKind; surface: number }[] = [
    { kind: 'entry', surface: sized(layout.entry) },
    { kind: 'kitchen', surface: sized(layout.kitchen) },
    { kind: 'bathroom', surface: sized(layout.bathroom) },
  ];
  if (surface >= layout.wc.fromSurface) parts.push({ kind: 'wc', surface: layout.wc.surface });
  for (let i = 1; i < rooms; i++) parts.push({ kind: 'bedroom', surface: sized(layout.bedroom) });
  const others = parts.reduce((sum, part) => sum + part.surface, 0);
  const livingMin = surface * layout.livingMinShare;
  const scale = surface - others < livingMin ? (surface - livingMin) / others : 1;
  for (const part of parts) part.surface = roundSurface(part.surface * scale);
  const living = Math.max(
    SURFACE_STEP,
    surface - parts.reduce((sum, part) => sum + part.surface, 0),
  );
  parts.splice(1, 0, { kind: 'living', surface: roundSurface(living) });
  if (withGarden) {
    parts.push({ kind: 'garden', surface: Math.round(surface * layout.gardenPerM2) });
  }
  const counts: Partial<Record<SpaceKind, number>> = {};
  return parts.map((part) => {
    const count = (counts[part.kind] ?? 0) + 1;
    counts[part.kind] = count;
    const name = part.kind === 'bedroom' ? `bedroom${count}` : part.kind;
    return { id: `${prefix}${name}`, kind: part.kind, surface: part.surface };
  });
}

/** Rooms of a property: one layout per flat for a whole building. */
export function layoutSpaces(
  content: GameContent,
  kind: PropertyKind,
  surface: number,
  rooms: number,
  lots: readonly { surface: number; rooms: number }[],
): Space[] {
  if (kind === 'building') {
    return lots.flatMap((lot, i) =>
      layoutDwelling(content, lot.surface, lot.rooms, `l${i + 1}-`, false),
    );
  }
  return layoutDwelling(content, surface, rooms, '', kind === 'house');
}

/** The items of a property, all at `state` (the caller sets each one). */
export function blankItems(
  content: GameContent,
  kind: PropertyKind,
  spaces: readonly Space[],
): WorkItem[] {
  const items: WorkItem[] = [];
  if (!isDwelling(kind)) return items;
  const rules = content.works.items;
  for (const space of spaces) {
    for (const itemKind of content.works.spaces[space.kind]) {
      if (!rules[itemKind].kinds.includes(kind)) continue;
      items.push({ kind: itemKind, spaceId: space.id, state: 3, tier: 'standard', known: true });
    }
  }
  for (const [itemKind, rule] of Object.entries(rules) as [ItemKind, ItemRule][]) {
    if (rule.scope === 'space' || !rule.kinds.includes(kind)) continue;
    items.push({ kind: itemKind, spaceId: null, state: 3, tier: 'standard', known: true });
  }
  return items;
}

/** Rooms of frozen layouts by id (items look up their room for every cost and weight). */
const spaceIndex = new WeakMap<readonly Space[], Map<string, Space>>();

function spaceOf(property: Property, spaceId: string | null): Space | undefined {
  if (spaceId === null) return undefined;
  const { spaces } = property;
  if (!Object.isFrozen(spaces)) return spaces.find((space) => space.id === spaceId);
  let index = spaceIndex.get(spaces);
  if (!index) {
    index = new Map();
    // The first room of an id wins, as with find().
    for (const space of spaces) if (!index.has(space.id)) index.set(space.id, space);
    spaceIndex.set(spaces, index);
  }
  return index.get(spaceId);
}

/** Quantity of an item's cost basis: m², windows or units. */
export function itemQuantity(content: GameContent, property: Property, item: WorkItem): number {
  const works = itemRule(content, item.kind).works;
  const areas = content.works.areas;
  const { kind } = property;
  if (!isDwelling(kind)) return 0;
  switch (works?.basis) {
    case 'space':
      return spaceOf(property, item.spaceId)?.surface ?? 0;
    case 'surface':
      return property.surface;
    case 'insulation':
      return property.surface * areas.insulation[kind];
    case 'roof':
      return property.surface * areas.roof[kind];
    case 'facade':
      return property.surface * areas.facade[kind];
    case 'windows':
      return Math.max(areas.minWindows, Math.round(property.surface * areas.windowsPerM2));
    case 'unit':
      return item.spaceId === null ? Math.max(1, property.lots.length) : 1;
    case undefined:
      return 0;
  }
}

const weightCache = new WeakMap<Property['items'], number[]>();

/**
 * Weight of each item in the value: its kind's weight, split between the
 * rooms by area (or equally for equipment).
 */
export function itemWeights(content: GameContent, property: Property): number[] {
  const cached = weightCache.get(property.items);
  if (cached) return cached;
  const totals = new Map<ItemKind, { surface: number; count: number }>();
  for (const item of property.items) {
    const total = totals.get(item.kind) ?? { surface: 0, count: 0 };
    total.surface += spaceOf(property, item.spaceId)?.surface ?? 0;
    total.count += 1;
    totals.set(item.kind, total);
  }
  const weights = property.items.map((item) => {
    const rule = itemRule(content, item.kind);
    const total = totals.get(item.kind) ?? { surface: 0, count: 1 };
    if (rule.scope === 'space' && rule.works?.basis === 'space' && total.surface > 0) {
      return (rule.valueWeight * (spaceOf(property, item.spaceId)?.surface ?? 0)) / total.surface;
    }
    return rule.valueWeight / total.count;
  });
  weightCache.set(property.items, weights);
  return weights;
}

/** Expected state of an item the player has not seen, given the announced condition and DPE. */
export function expectedState(
  content: GameContent,
  property: Property,
  item: WorkItem,
  condition: Condition,
): number {
  const rule = itemRule(content, item.kind);
  const energyOffset = rule.energy ? content.works.energy.generationOffsets[property.dpe] : 0;
  return clampState(
    content.market.conditions[condition].meanState + rule.generationOffset + energyOffset,
  );
}

const stateCache = new WeakMap<Property['items'], number>();

/** Weighted state of the dwelling, 1 … 5 (cached per array of items). */
export function weightedState(content: GameContent, property: Property): number {
  const cached = stateCache.get(property.items);
  if (cached !== undefined) return cached;
  const weights = itemWeights(content, property);
  let total = 0;
  let sum = 0;
  property.items.forEach((item, i) => {
    const weight = weights[i] ?? 0;
    total += weight;
    sum += weight * item.state;
  });
  const state = total > 0 ? sum / total : 3;
  stateCache.set(property.items, state);
  return state;
}

/** Condition announced for a dwelling: the one whose mean state is the closest. */
export function conditionLabel(content: GameContent, property: Property): Condition {
  const state = weightedState(content, property);
  let best: Condition = 'toRefresh';
  let gap = Number.POSITIVE_INFINITY;
  for (const condition of CONDITIONS) {
    const distance = Math.abs(content.market.conditions[condition].meanState - state);
    if (distance < gap) {
      gap = distance;
      best = condition;
    }
  }
  return best;
}

const tierCaches = {
  value: new WeakMap<Property['items'], number>(),
  rent: new WeakMap<Property['items'], number>(),
};

/** Weighted bonus (value or rent) of the tiers of the renovated items (state 4 or 5). */
export function tierShare(content: GameContent, property: Property, key: 'value' | 'rent'): number {
  const cache = tierCaches[key];
  const cached = cache.get(property.items);
  if (cached !== undefined) return cached;
  const weights = itemWeights(content, property);
  let total = 0;
  let sum = 0;
  property.items.forEach((item, i) => {
    const weight = weights[i] ?? 0;
    total += weight;
    if (item.state >= 4) sum += weight * content.works.tiers[item.tier][key];
  });
  const share = total > 0 ? sum / total : 0;
  cache.set(property.items, share);
  return share;
}

/** Indecent: too run-down overall, or a critical item (electricity, heating, water) at state 1. */
export function isIndecent(content: GameContent, property: Property): boolean {
  if (weightedState(content, property) < content.renting.indecentBelowState) return true;
  return property.items.some(
    (item) => item.state < MIN_STATE + 0.5 && itemRule(content, item.kind).critical,
  );
}

const believedCache = new WeakMap<Property['items'], WorkItem[]>();

/**
 * The property as the player sees it: unknown items at the state the
 * announced condition and the DPE suggest (fractional), known ones as they
 * are. Cached per array of items.
 */
export function believedView(content: GameContent, property: Property): Property {
  let items = believedCache.get(property.items);
  if (!items) {
    if (property.items.every((item) => item.known)) {
      items = property.items;
    } else {
      const condition = conditionLabel(content, property);
      items = freezeItems(
        property.items.map((item) =>
          item.known ? item : { ...item, state: expectedState(content, property, item, condition) },
        ),
      );
    }
    believedCache.set(property.items, items);
  }
  return items === property.items ? property : { ...property, items };
}

/** Energy needs (kWh/m²/year) before the property's calibration factor. */
function rawEnergy(
  content: GameContent,
  epoch: Epoch,
  items: readonly WorkItem[],
  overrides?: ReadonlyMap<WorkItem, { state: number; tier: Tier }>,
): number {
  let energy = content.works.energy.baseByEpoch[epoch];
  for (const item of items) {
    const model = itemRule(content, item.kind).energy;
    if (!model) continue;
    const { state, tier } = overrides?.get(item) ?? item;
    energy *= interpolateByState(model.byState, state) * model.tiers[tier];
  }
  return energy;
}

export function energyNeeds(
  content: GameContent,
  property: Property,
  overrides?: ReadonlyMap<WorkItem, { state: number; tier: Tier }>,
): number {
  return rawEnergy(content, property.epoch, property.items, overrides) * property.energyFactor;
}

export function dpeOf(content: GameContent, energy: number): DpeLabel {
  const limits = content.works.energy.classMax;
  for (const label of DPE_LABELS) if (energy <= limits[label]) return label;
  return 'G';
}

/** Energy factor that puts the property's model in the middle of its current class. */
export function calibrateEnergy(content: GameContent, property: Property): number {
  const limits = content.works.energy.classMax;
  const index = DPE_LABELS.indexOf(property.dpe);
  const previous = DPE_LABELS[index - 1];
  const low = previous ? limits[previous] : limits.A / 2;
  return (low + limits[property.dpe]) / 2 / rawEnergy(content, property.epoch, property.items);
}

/** Fresh fittings in every item, at a tier (a rival's renovation, tests). */
export function renovatedItem(item: WorkItem, tier: Tier): WorkItem {
  return { ...item, state: MAX_STATE, tier };
}

/**
 * Draws the rooms and the state of every item of a new listing, around the
 * announced condition and consistent with the DPE drawn from the data.
 */
export function drawDwelling(
  content: GameContent,
  rng: RngState,
  draft: Pick<Property, 'kind' | 'surface' | 'rooms' | 'lots' | 'epoch' | 'dpe'>,
  condition: Condition,
): Pick<Property, 'spaces' | 'items' | 'energyFactor'> {
  const spaces = layoutSpaces(content, draft.kind, draft.surface, draft.rooms, draft.lots);
  const mean = content.market.conditions[condition].meanState;
  const spread = content.market.stateStdDev;
  const dpeOffset = content.works.energy.generationOffsets[draft.dpe];
  const items = blankItems(content, draft.kind, spaces).map((item) => {
    const rule = itemRule(content, item.kind);
    const offset = rule.generationOffset + (rule.energy ? dpeOffset : 0);
    const state = clampState(Math.round(mean + offset + spread * nextNormal(rng)));
    return { ...item, state, known: false };
  });
  // Calibration: the model lands inside the drawn class.
  const limits = content.works.energy.classMax;
  const index = DPE_LABELS.indexOf(draft.dpe);
  const previous = DPE_LABELS[index - 1];
  const low = previous ? limits[previous] : limits.A / 2;
  const target = nextRange(rng, low, limits[draft.dpe]);
  const energyFactor = target / rawEnergy(content, draft.epoch, items);
  return { spaces: freezeSpaces(spaces), items: freezeItems(items), energyFactor };
}

/** Value factor of the dwelling's state (before the tiers' bonus). */
export function stateValueFactor(content: GameContent, property: Property): number {
  return interpolateByState(content.works.valueByState, weightedState(content, property));
}

/** Ceiling per m² of a neighbourhood for the tiers' bonus. */
export function valueCeilingPerM2(content: GameContent, property: Property): number {
  const neighbourhood = findNeighbourhood(content, property.cityId, property.neighbourhoodId);
  const stats = neighbourhood.sales[property.kind === 'house' ? 'house' : 'apartment'].pricePerM2;
  return stats[content.works.valueCeiling];
}

/** Tasks not done yet that need the home empty (no tenant during heavy works). */
export function needsVacant(
  content: GameContent,
  property: Property,
  tasks: readonly WorksTask[],
): boolean {
  return tasks.some(
    (task) =>
      task.status !== 'done' &&
      task.items.some((line) => {
        const item = findItem(property, line.itemId);
        return item ? !itemRule(content, item.kind).works?.occupied : false;
      }),
  );
}

/** Heavy works in progress: the home cannot be let meanwhile. */
export function heavyWorksInProgress(content: GameContent, owned: OwnedProperty): boolean {
  return owned.works !== null && needsVacant(content, owned.property, owned.works.tasks);
}
