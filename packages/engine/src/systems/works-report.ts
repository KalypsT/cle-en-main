import type { DpeLabel, GameContent, SpaceKind, Tier } from '../content.ts';
import type { Cents } from '../money.ts';
import type { GameState, OwnedProperty, Property, WorksSnapshot } from '../state.ts';
import { itemId, weightedState } from './dwelling.ts';
import { marketRent } from './renting.ts';
import { estimateValue } from './valuation.ts';

/** Items the street sees: they make the look of a building. */
export const VISIBLE_ITEMS: ReadonlySet<string> = new Set([
  'facade',
  'windows',
  'roof',
  'commonParts',
]);

/** What the street sees of a property: the state of its façade, windows and roof. */
export function facadeOf(
  content: GameContent,
  property: Property,
): { facadeState: number; newWindows: boolean } {
  const visible = property.items.filter((item) => VISIBLE_ITEMS.has(item.kind));
  const facadeState =
    visible.length > 0
      ? visible.reduce((sum, item) => sum + item.state, 0) / visible.length
      : weightedState(content, property);
  const windows = property.items.find((item) => item.kind === 'windows');
  return {
    facadeState: Math.round(facadeState * 10) / 10,
    newWindows: windows ? windows.state >= 5 || windows.tier === 'premium' : false,
  };
}

/** The property as it is now: what the « avant / après » of the works compares. */
export function snapshotOf(
  content: GameContent,
  state: GameState,
  property: Property,
): WorksSnapshot {
  return {
    dpe: property.dpe,
    value: estimateValue(content, state, property, true).estimate,
    rent: marketRent(content, state, property, 'bare'),
    ...facadeOf(content, property),
    items: property.items.map((item) => ({
      id: itemId(item),
      state: item.state,
      tier: item.tier,
    })),
  };
}

/** What the end of some works records on the property, with the snapshot taken at the start. */
export function worksReportOf(
  content: GameContent,
  state: GameState,
  owned: OwnedProperty,
  day: number,
  cost: number,
): NonNullable<OwnedProperty['lastWorks']> | null {
  const before = owned.works?.before;
  if (!before) return null;
  return { day, cost, before, after: snapshotOf(content, state, owned.property) };
}

/** A change of state or range of one item, with the room it is in. */
export interface WorksChange {
  itemId: string;
  kind: string;
  spaceId: string | null;
  stateFrom: number;
  stateTo: number;
  tierFrom: Tier;
  tierTo: Tier;
}

/** The before and after of the last works of a property (game feel, lot 4). */
export interface WorksBeforeAfter {
  day: number;
  cost: Cents;
  dpe: { before: DpeLabel; after: DpeLabel };
  value: { before: Cents; after: Cents };
  /** 0 when the dwelling cannot be let (indecent). */
  rent: { before: Cents; after: Cents };
  facade: {
    before: { state: number; newWindows: boolean };
    after: { state: number; newWindows: boolean };
  };
  /** Items worked on, the most improved first. */
  changes: WorksChange[];
  /** Mean state of each room, before and after (the cross-section's colours). */
  rooms: { spaceId: string; kind: SpaceKind; before: number; after: number }[];
}

function meanState(
  items: readonly { id: string; state: number }[],
  spaceId: string,
): number | null {
  const mine = items.filter((item) => item.id.startsWith(`${spaceId}.`));
  return mine.length > 0 ? mine.reduce((sum, item) => sum + item.state, 0) / mine.length : null;
}

/**
 * Before and after of the last works finished on a property, or null if none
 * was recorded (works begun before save format 21 have no picture of the before).
 */
export function worksBeforeAfter(owned: OwnedProperty): WorksBeforeAfter | null {
  const report = owned.lastWorks;
  if (!report) return null;
  const { before, after } = report;
  const byId = new Map(before.items.map((item) => [item.id, item]));
  const changes: WorksChange[] = [];
  for (const item of after.items) {
    const was = byId.get(item.id);
    if (!was || (was.state === item.state && was.tier === item.tier)) continue;
    const real = owned.property.items.find((candidate) => itemId(candidate) === item.id);
    changes.push({
      itemId: item.id,
      kind: real?.kind ?? item.id,
      spaceId: real?.spaceId ?? null,
      stateFrom: was.state,
      stateTo: item.state,
      tierFrom: was.tier,
      tierTo: item.tier,
    });
  }
  changes.sort((a, b) => b.stateTo - b.stateFrom - (a.stateTo - a.stateFrom));
  const rooms = owned.property.spaces
    .filter((space) => space.kind !== 'garden')
    .flatMap((space) => {
      const from = meanState(before.items, space.id);
      const to = meanState(after.items, space.id);
      return from === null || to === null
        ? []
        : [
            {
              spaceId: space.id,
              kind: space.kind,
              before: Math.round(from * 10) / 10,
              after: Math.round(to * 10) / 10,
            },
          ];
    });
  return {
    day: report.day,
    cost: report.cost,
    dpe: { before: before.dpe, after: after.dpe },
    value: { before: before.value, after: after.value },
    rent: { before: before.rent, after: after.rent },
    facade: {
      before: { state: before.facadeState, newWindows: before.newWindows },
      after: { state: after.facadeState, newWindows: after.newWindows },
    },
    changes,
    rooms,
  };
}
