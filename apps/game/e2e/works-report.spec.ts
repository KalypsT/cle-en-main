import type { GameState } from '@cle/engine';
import { expect, test } from '@playwright/test';
import {
  capture,
  importState,
  openGame,
  ownerGame,
  pause,
  speed,
  t,
  tab,
  testEngine,
} from './helpers.ts';

/**
 * A game where the works of the first property end within the next hours: the state is the
 * one just before they do. `inside`: the walls of a room painted by the player; otherwise the
 * windows changed by an artisan, which the street sees.
 */
function eveOfWorksEnd(inside: boolean): GameState {
  let state = ownerGame(24 * 120, (s) => s.properties.length > 0);
  const owned = state.properties[0];
  if (!owned) throw new Error('No property');
  const propertyId = owned.property.id;
  const send = (action: Parameters<typeof testEngine.dispatch>[1]) => {
    const result = testEngine.dispatch(state, action);
    if (!result.ok) throw new Error(`${action.type} refused: ${result.reason.code}`);
    state = result.state;
  };
  if (inside) {
    const walls = owned.property.items.find((item) => item.kind === 'walls' && item.spaceId);
    if (!walls?.spaceId) throw new Error('No walls to paint');
    send({
      type: 'works/start',
      propertyId,
      quoteIds: [],
      diy: [{ itemId: `${walls.spaceId}.walls`, tier: 'standard' }],
    });
  } else {
    // Windows are asked from the carpenter of the book; his quote comes at once.
    send({
      type: 'works/quote',
      propertyId,
      artisanId: 'fenetresSurDole',
      items: [{ itemId: 'windows', tier: 'premium' }],
    });
    const quote = state.properties[0]?.quotes[0];
    if (!quote) throw new Error('No quote');
    send({ type: 'works/start', propertyId, quoteIds: [quote.id], diy: [] });
  }
  for (let hour = 0; hour < 24 * 90; hour++) {
    const next = testEngine.advanceHours(state, 1);
    if (next.events.some((event) => event.type === 'worksCompleted')) return state;
    state = next.state;
  }
  throw new Error('The works did not end');
}

test('shows the property before and after at the end of the works', async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page);
  await importState(page, eveOfWorksEnd(false));
  await speed(page, 1);

  // The scene of the end of the works comes over the game.
  const scene = page.getByTestId('overlay-works');
  await expect(scene).toBeVisible({ timeout: 30_000 });
  await expect(scene).toContainText(t.worksReport.kicker);
  const report = scene.getByTestId('works-report');
  // The windows are seen from the street: the slider compares the two façades.
  await expect(report.getByTestId('before-after')).toBeVisible();
  await expect(report).toContainText(t.worksReport.changes);
  await capture(page, '01-avant-apres', 'renover');

  // The slider moves with the keyboard.
  const slider = report.getByRole('slider', { name: t.worksReport.compare });
  await slider.focus();
  await slider.press('Home');
  await expect(slider).toHaveValue('0');
  await scene.getByRole('button', { name: t.worksReport.continue }).click();
  await expect(scene).toHaveCount(0);
  await pause(page);

  // The property keeps its last works: a card, and the same screen.
  await tab(page, 'assets');
  await page.locator('[data-testid^="property-"]').first().click();
  const card = page.getByTestId('last-works');
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: t.worksReport.open }).click();
  await expect(page.getByTestId('works-report')).toBeVisible();
  await capture(page, '02-dernier-chantier', 'renover');
});

test('shows the rooms, without a slider, when the works are inside', async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page);
  await importState(page, eveOfWorksEnd(true));
  await speed(page, 1);
  const scene = page.getByTestId('overlay-works');
  await expect(scene).toBeVisible({ timeout: 30_000 });
  // The façade is the same: nothing to slide, but the room is told.
  await expect(scene.getByTestId('before-after')).toHaveCount(0);
  await expect(scene.getByText(t.worksReport.rooms)).toBeVisible();
  await capture(page, '03-avant-apres-interieur', 'renover');
});
