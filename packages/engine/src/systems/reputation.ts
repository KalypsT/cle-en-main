import type { GameContent } from '../content.ts';
import type { GameState } from '../state.ts';
import { changeRenown } from './cities.ts';
import type { SystemContext } from './context.ts';

/**
 * Changes the global reputation, kept between 0 and 100 (docs/02, section 2.8); gains above
 * `diminishingFrom` are scaled down (milestone 8). With a
 * `cityId`, the renown of that city moves too (what happened there is known there).
 */
export function changeReputation(ctx: SystemContext, delta: number, cityId?: string): void {
  if (delta === 0) return;
  if (cityId !== undefined) changeRenown(ctx, cityId, delta);
  const { player } = ctx.state;
  const rules = ctx.content.progression.reputation;
  // The last points are the hardest: gains shrink near 100 (kept to a tenth).
  const scaled =
    delta > 0 && player.reputation >= rules.diminishingFrom
      ? Math.round(((delta * (100 - player.reputation)) / rules.diminishingSpan) * 10) / 10
      : delta;
  const reputation = Math.max(0, Math.min(100, player.reputation + scaled));
  if (reputation === player.reputation) return;
  const applied = reputation - player.reputation;
  player.reputation = reputation;
  ctx.events.push({ type: 'reputationChanged', delta: applied, reputation });
}

function heldTitles(content: GameContent, state: GameState) {
  const held = new Set(state.progress.titles.map((title) => title.id));
  return content.titles.filter((title) => held.has(title.id));
}

/** Margin every bank adds to its rates for this player: reputation, then titles (≤ 0). */
export function progressMarginPercent(content: GameContent, state: GameState): number {
  const reputation = state.player.reputation;
  const tiers = content.progression.effects.bankMargin.filter(
    (tier) => reputation >= tier.minReputation,
  );
  const fromReputation = tiers.reduce((best, tier) => Math.min(best, tier.percent), 0);
  const fromTitles = heldTitles(content, state).reduce(
    (sum, title) => sum + (title.perks.bankMarginPercent ?? 0),
    0,
  );
  return Math.round((fromReputation + fromTitles) * 1000) / 1000;
}

/** Monthly chance that an agent offers an off-market property (reputation and titles). */
export function offMarketChancePerMonth(content: GameContent, state: GameState): number {
  const effects = content.progression.effects;
  const base =
    state.player.reputation >= effects.offMarketFromReputation
      ? effects.offMarketChancePerMonth
      : 0;
  const fromTitles = heldTitles(content, state).reduce(
    (sum, title) => sum + (title.perks.offMarketChancePerMonth ?? 0),
    0,
  );
  return Math.min(1, base + fromTitles);
}
