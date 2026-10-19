import { expect, test } from '@playwright/test';
import { gameContent } from '@cle/content';
import { toDayNumber } from '@cle/engine';
import {
  capture,
  dismissOverlays,
  fill,
  importState,
  openGame,
  openMenuEntry,
  ownerGame,
  pause,
  referenceGame,
  speed,
  t,
  tab,
  testEngine,
  ui,
} from './helpers.ts';

/**
 * Milestone 6: reviews, titles, progression, events and rewind. Every game
 * is built by the engine and imported, a few game hours before what is
 * tested: the clock then runs at ×1 (one game day a second in test mode).
 */
const MILESTONE = 'jalon-6';
const HOURS_TO_31_OCTOBER_22H = 13 * 24 + 14;

function at(year: number, month: number, day: number, hour: number) {
  return (state: { clock: { date: Parameters<typeof toDayNumber>[0]; hour: number } }) =>
    toDayNumber(state.clock.date) === toDayNumber({ year, month, day }) &&
    state.clock.hour === hour;
}

test('shows the monthly review on the 1st, then lets the game go on', async ({ page }) => {
  await openGame(page);
  const state = testEngine.advanceHours(referenceGame(), HOURS_TO_31_OCTOBER_22H).state;
  await importState(page, state);
  await speed(page, 1);
  const review = page.getByTestId('overlay-month');
  await expect(review).toBeVisible({ timeout: 20_000 });
  await expect(review.getByTestId('monthly-review')).toContainText(t.review.groups.income);
  await capture(page, '01-bilan-mensuel', MILESTONE);
  // The clock waits while the review is open.
  const time = await page.getByTestId('game-time').textContent();
  await page.waitForTimeout(400);
  await expect(page.getByTestId('game-time')).toHaveText(time ?? '');
  await review.getByRole('button', { name: t.review.continue }).click();
  await expect(review).toHaveCount(0);
});

test('reviews the year with Yvon Tableur and shows the progression', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);
  const state = ownerGame(24 * 120, at(2026, 12, 31, 22));
  expect(state.properties.length).toBeGreaterThan(0);
  await importState(page, state);
  await speed(page, 1);
  const review = page.getByTestId('overlay-year');
  await expect(review).toBeVisible({ timeout: 20_000 });
  await expect(review).toContainText(fill(t.review.yearHeading, { year: 2026 }));
  await expect(review).toContainText(t.review.yvon);
  await capture(page, '02-bilan-annuel-yvon', MILESTONE);
  await review.getByRole('button', { name: t.review.continue }).click();
  await pause(page);

  await openMenuEntry(page, t.menu.progression);
  await expect(page.getByTestId('reputation')).toBeVisible();
  await expect(page.getByTestId('title-firstInvestor')).toContainText(
    fill(t.progression.held, { date: '' }).trim(),
  );
  await capture(page, '03-progression-titres', MILESTONE);
  await page.getByRole('button', { name: t.progression.tabs.achievements }).click();
  await expect(page.getByTestId('achievement-firstStone')).toHaveClass(/earned/);
  await capture(page, '04-progression-succes', MILESTONE);
  await page.getByRole('button', { name: t.progression.tabs.chronicle }).click();
  await expect(page.getByTestId('chronicle')).toContainText(t.chronicle.start);
  await capture(page, '05-progression-chronique', MILESTONE);
  await page.getByRole('button', { name: t.progression.tabs.challenges }).click();
  await capture(page, '06-progression-defis', MILESTONE);

  await page.getByRole('button', { name: t.common.back }).click();
  await page.getByRole('button', { name: t.menu.statistics }).click();
  await expect(page.getByTestId('records')).toBeVisible();
  await capture(page, '07-statistiques', MILESTONE);
});

test('celebrates a new title on the deed', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);
  const before = ownerGame(24 * 120, (s) => {
    const purchase = s.purchases[0];
    return (
      purchase !== undefined &&
      purchase.acceptedApplicationId !== null &&
      toDayNumber(s.clock.date) === purchase.deedDay - 1 &&
      s.clock.hour === 22
    );
  });
  expect(before.purchases).toHaveLength(1);
  await importState(page, before);
  await speed(page, 1);
  const celebration = page.getByTestId('overlay-title');
  await expect(celebration).toBeVisible({ timeout: 20_000 });
  const title = gameContent.titles.find((candidate) => candidate.id === 'firstInvestor');
  await expect(celebration).toContainText(title?.name ?? '');
  await capture(page, '08-nouveau-titre', MILESTONE);
  await dismissOverlays(page);
});

test('answers an event of the catalogue', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);
  const state = ownerGame(24 * 300, (s) => s.catalog.pending.length > 0);
  const pending = state.catalog.pending[0];
  expect(pending).toBeDefined();
  await importState(page, state);
  await tab(page, 'decisions');
  await page.getByTestId('decision-catalogEvent').first().click();
  const card = page.getByTestId('catalog-event');
  await expect(card).toBeVisible();
  await capture(page, '09-evenement', MILESTONE);
  const event = gameContent.events.find((candidate) => candidate.id === pending?.eventId);
  // A choice that needs no free time (there may be none left at this hour).
  const choice = event?.choices?.find((c) => c.effects.every((e) => e.type !== 'freeTime'));
  await page.getByTestId(`choice-${choice?.id ?? ''}`).click();
  await expect(page.getByTestId('catalog-event')).toHaveCount(0);
});

test('goes back to the 1st of the month', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);
  const state = testEngine.advanceHours(referenceGame(), HOURS_TO_31_OCTOBER_22H).state;
  await importState(page, state);
  await speed(page, 1);
  // The 1st of November is saved as a rewind point (the monthly review pauses on it).
  const date = page.getByTestId('game-date');
  await expect(page.getByTestId('overlay-month')).toBeVisible({ timeout: 20_000 });
  await dismissOverlays(page);
  // Let a later day come, then stop.
  await expect(date).not.toContainText(/\b1 nov\./, { timeout: 20_000 });
  await pause(page);
  await tab(page, 'menu');
  await page.getByRole('button', { name: t.menu.settings }).click();
  await page.getByRole('button', { name: t.settings.rewind }).click();
  const point = page.getByTestId('rewind-point').first();
  await expect(point).toBeVisible();
  await expect(page.getByTestId('rewinds-left')).toHaveText(fill(t.rewind.left, { count: 3 }));
  await capture(page, '10-retour-en-arriere', MILESTONE);
  await point.getByRole('button', { name: t.rewind.go }).click();
  await point.getByRole('button', { name: t.common.confirm }).click();
  await expect(date).toContainText(/\b1 nov\./);
  await tab(page, 'menu');
  await page.getByRole('button', { name: t.menu.progression }).click();
  await expect(page.getByText(fill(t.progression.rewindsLeft, { count: 2 }))).toBeVisible();
});

test('offers the three game modes on the creation screen', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: ui.title.newGame }).click();
  await page.getByTestId('slot-1').getByRole('button', { name: ui.slots.start }).click();
  for (const mode of gameContent.modes.modes) {
    await expect(page.getByTestId(`mode-${mode.id}`)).toContainText(mode.name);
  }
  await page.getByTestId('mode-demanding').click();
  await expect(page.getByTestId('mode-demanding')).toHaveAttribute('aria-pressed', 'true');
});
