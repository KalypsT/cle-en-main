import { toDayNumber } from '../calendar.ts';
import type { DpeLabel, GameContent, ItemKind, Tier, Trade } from '../content.ts';
import { TIERS } from '../content-constants.ts';
import type { Cents } from '../money.ts';
import type { GameState, OwnedProperty, Property, WorkItem } from '../state.ts';
import { dpeOf, energyNeeds, itemId, itemRule } from './dwelling.ts';
import { lettingBlock, marketRent } from './renting.ts';
import { believedState, estimateValue } from './valuation.ts';
import {
  buildTasks,
  diyAllowed,
  diyCost,
  type ItemChoice,
  planSchedule,
  referenceCost,
  referenceDays,
} from './works.ts';

/** What the interface and the bots read about works: no state change here. */

export interface CatalogItem {
  id: string;
  kind: ItemKind;
  spaceId: string | null;
  /** State known to the player; null if not seen yet. */
  state: number | null;
  /** What the player can expect when the state is unknown. */
  expectedState: number;
  tier: Tier;
  /** Null: only the co-ownership can renovate it. */
  trade: Trade | null;
  phase: number;
  /** Possible with a tenant in place. */
  occupied: boolean;
  /** Reference price (TTC, before the artisan) and days of each tier. */
  tiers: Record<Tier, { cost: Cents; days: number }>;
  /** Doing it oneself: allowed, free time and materials of each tier. */
  diy: { allowed: boolean; tiers: Record<Tier, { minutes: number; materials: Cents }> } | null;
}

export function worksCatalog(
  content: GameContent,
  state: GameState,
  property: Property,
): CatalogItem[] {
  const believed = believedState(content, property);
  return property.items.map((item) => {
    const rule = itemRule(content, item.kind);
    const expected = believed(item);
    const tiers = Object.fromEntries(
      TIERS.map((tier) => [
        tier,
        {
          cost: referenceCost(content, property, item, tier, Math.round(expected)),
          days: Math.ceil(referenceDays(content, property, item, tier)),
        },
      ]),
    ) as CatalogItem['tiers'];
    const diy = rule.works?.diy
      ? {
          allowed: diyAllowed(content, state, item),
          tiers: Object.fromEntries(
            TIERS.map((tier) => [tier, diyCost(content, property, item, tier)]),
          ) as Record<Tier, { minutes: number; materials: Cents }>,
        }
      : null;
    return {
      id: itemId(item),
      kind: item.kind,
      spaceId: item.spaceId,
      state: item.known ? item.state : null,
      expectedState: expected,
      tier: item.tier,
      trade: rule.works?.trade ?? null,
      phase: rule.works?.phase ?? 0,
      occupied: rule.works?.occupied ?? false,
      tiers,
      diy,
    };
  });
}

export interface WorksEstimate {
  /** Reference cost (before the artisans' prices and hazards). */
  cost: Cents;
  /** Days of works if every artisan were free now (phases one after the other). */
  days: number;
  dpeBefore: DpeLabel;
  /** Class estimated after the works (shown before validating, docs/03-systemes/05). */
  dpeAfter: DpeLabel;
  energyBefore: number;
  energyAfter: number;
  valueBefore: Cents;
  valueAfter: Cents;
  rentBefore: Cents;
  rentAfter: Cents;
  /** Why a new lease would still be impossible after the works. */
  blockAfter: 'rent.indecent' | 'rent.dpeBanned' | null;
}

/** Items after renovation at the chosen tiers (state 5), the others as the player believes them. */
function renovatedView(
  content: GameContent,
  property: Property,
  choices: readonly ItemChoice[],
): Property {
  const believed = believedState(content, property);
  const chosen = new Map(choices.map((choice) => [choice.itemId, choice.tier]));
  const items: WorkItem[] = property.items.map((item) => {
    const tier = chosen.get(itemId(item));
    if (tier && itemRule(content, item.kind).works) {
      return { ...item, state: 5, tier, known: true };
    }
    return item.known ? item : { ...item, state: believed(item), known: true };
  });
  const view = { ...property, items };
  return { ...view, dpe: dpeOf(content, energyNeeds(content, view)) };
}

export function worksEstimate(
  content: GameContent,
  state: GameState,
  property: Property,
  choices: readonly ItemChoice[],
): WorksEstimate {
  const believed = believedState(content, property);
  let cost = 0;
  const phases = new Map<number, Map<Trade, number>>();
  for (const choice of choices) {
    const item = property.items.find((candidate) => itemId(candidate) === choice.itemId);
    const works = item ? itemRule(content, item.kind).works : null;
    if (!item || !works) continue;
    cost += referenceCost(content, property, item, choice.tier, Math.round(believed(item)));
    const byTrade = phases.get(works.phase) ?? new Map<Trade, number>();
    byTrade.set(
      works.trade,
      (byTrade.get(works.trade) ?? 0) + referenceDays(content, property, item, choice.tier),
    );
    phases.set(works.phase, byTrade);
  }
  const days = [...phases.values()].reduce(
    (sum, byTrade) => sum + Math.ceil(Math.max(0, ...byTrade.values())),
    0,
  );
  const before = renovatedView(content, property, []);
  const after = renovatedView(content, property, choices);
  const today = toDayNumber(state.clock.date);
  return {
    cost,
    days,
    dpeBefore: property.dpe,
    dpeAfter: after.dpe,
    energyBefore: Math.round(energyNeeds(content, before)),
    energyAfter: Math.round(energyNeeds(content, after)),
    valueBefore: estimateValue(content, state, property, true).estimate,
    valueAfter: estimateValue(content, state, after, true).estimate,
    rentBefore: marketRent(content, state, property, 'bare', believed),
    rentAfter: marketRent(content, state, after, 'bare'),
    blockAfter: lettingBlock(content, after, today),
  };
}

export interface PlannedTask {
  taskId: string;
  artisanId: string | null;
  trade: Trade;
  phase: number;
  itemIds: string[];
  status: 'waiting' | 'running' | 'done';
  startDay: number;
  endDay: number;
}

/** The schedule of the project in progress, or of a project with these quotes. */
export function worksPlan(
  content: GameContent,
  state: GameState,
  owned: OwnedProperty,
  quoteIds?: readonly string[],
  diy: readonly ItemChoice[] = [],
): PlannedTask[] {
  const today = toDayNumber(state.clock.date);
  let counter = 0;
  const tasks =
    quoteIds === undefined
      ? (owned.works?.tasks ?? [])
      : buildTasks(
          { content, state },
          owned,
          owned.quotes.filter((quote) => quoteIds.includes(quote.id)),
          diy,
          () => `planned-${++counter}`,
        );
  const schedule = planSchedule(content, state, tasks, today);
  return tasks.map((task) => {
    const planned = schedule.find((entry) => entry.taskId === task.id);
    return {
      taskId: task.id,
      artisanId: task.artisanId,
      trade: task.trade,
      phase: task.phase,
      itemIds: task.items.map((line) => line.itemId),
      status: task.status,
      startDay: planned?.startDay ?? today,
      endDay: planned?.endDay ?? today,
    };
  });
}
