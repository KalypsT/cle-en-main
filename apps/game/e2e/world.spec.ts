import { expect, type Page, test } from '@playwright/test';
import {
  capture,
  clockStamp,
  importGameAt,
  newGame,
  openGame,
  pause,
  speed,
  streetReady,
  t,
  tab,
} from './helpers.ts';

const MILESTONE = 'jalon-5';

/** Milestone 5: the living street, its bubbles and the cross-section. */
test('shows the living street, opens a sheet from a bubble and a cross-section', async ({
  page,
}) => {
  await openGame(page);
  await newGame(page, { tutorialOn: false });
  await pause(page);
  const street = page.getByTestId('street');
  await streetReady(page);
  await expect(street).toHaveAttribute('data-moment', 'morning');
  await expect(page.getByTestId('street-name')).not.toBeEmpty();
  await capture(page, '01-rue-matin', MILESTONE);

  // The former dashboard lives in the drawer over the street.
  const drawer = page.getByTestId('street-drawer');
  await drawer.getByRole('button', { name: t.street.openDashboard }).click();
  await expect(drawer.getByText(t.street.opportunities)).toBeVisible();
  await capture(page, '02-tableau-de-bord', MILESTONE);
  await drawer.getByRole('button', { name: t.street.closeDashboard }).click();

  // A « À vendre » bubble opens the listing sheet.
  const bubble = page.getByTestId('bubble-forSale').first();
  await bubble.scrollIntoViewIfNeeded();
  await bubble.click();
  await expect(page.getByTestId('asking-price')).toBeVisible();
  await page.getByRole('button', { name: t.common.back }).click();

  // Touching a building opens its cross-section, then the listed flat its sheet.
  await streetReady(page);
  const building = page.locator('[data-testid^="building-"]').first();
  await building.click();
  await expect(page.getByTestId('section')).toBeVisible();
  await capture(page, '03-coupe', MILESTONE);
  await page.getByRole('button', { name: t.common.back }).click();

  // Another street of the neighbourhood, then another neighbourhood.
  const name = await page.getByTestId('street-name').textContent();
  await page.getByRole('button', { name: t.street.nextStreet }).click();
  await expect(page.getByTestId('street-name')).not.toHaveText(name ?? '');
  await page.getByTestId('street-neighbourhood').selectOption({ index: 1 });
  await streetReady(page);
  await capture(page, '04-autre-quartier', MILESTONE);
});

test('lights up the windows at night and follows the dark theme', async ({ page }) => {
  await openGame(page);
  await importGameAt(page, 23);
  const street = page.getByTestId('street');
  await expect(street).toHaveAttribute('data-moment', 'night');
  await streetReady(page);
  await capture(page, '05-rue-nuit', MILESTONE);

  // « Automatique »: dark during the game's night.
  await tab(page, 'menu');
  await page.getByRole('button', { name: t.menu.settings }).click();
  const themes = page.getByRole('group', { name: t.settings.theme });
  await themes.getByRole('button', { name: t.settings.themes.auto }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await themes.getByRole('button', { name: t.settings.themes.light }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await themes.getByRole('button', { name: t.settings.themes.dark }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await capture(page, '06-reglages-sombre', MILESTONE);
  await tab(page, 'street');
  await streetReady(page);
  await capture(page, '07-rue-theme-sombre', MILESTONE);
});

test('turns the street into a panorama when the phone is held sideways', async ({ page }) => {
  await openGame(page);
  await newGame(page, { tutorialOn: false });
  await pause(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await streetReady(page);
  await expect(page.getByRole('navigation')).toBeHidden();
  await expect(page.getByTestId('street-drawer')).toBeHidden();
  await capture(page, '08-panorama', MILESTONE);

  // Any other screen asks to turn the phone back.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByTestId('bubble-forSale').first().click();
  await page.setViewportSize({ width: 844, height: 390 });
  await expect(page.getByText(t.common.rotate)).toBeVisible();
});

/**
 * Fluidity, as an indication: the frame times of the street with the CPU
 * slowed down four times. The container draws WebGL in software, far slower
 * than a phone's GPU: the real check is the counter on Thibaud's phone.
 */
test('measures the frame rate of the street', async ({ page, browserName }, testInfo) => {
  test.skip(browserName !== 'chromium', 'CPU throttling needs Chromium');
  await openGame(page);
  await newGame(page, { tutorialOn: false });
  await page.getByRole('button', { name: t.status.pause, exact: true }).click();
  await streetReady(page);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // Long enough for the automatic quality to step down if the frames are slow.
  await page.waitForTimeout(10_000);
  const stats = await page.evaluate(() => {
    const read = (window as { __streetStats?: () => { fps: number; p95: number } | null })
      .__streetStats;
    return read?.() ?? null;
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  testInfo.annotations.push({ type: 'fluidité', description: JSON.stringify(stats) });
  console.log(`Fluidité de la rue (processeur ×4 plus lent) : ${JSON.stringify(stats)}`);
  expect(stats).not.toBeNull();
  expect(stats?.fps ?? 0).toBeGreaterThan(0);
});

interface Actors {
  people: number;
  cars: number;
  birds: number;
}

async function streetActors(page: Page): Promise<Actors | null> {
  return page.evaluate(() => {
    const read = (window as { __streetStats?: () => { actors: Actors } | null }).__streetStats;
    return read?.()?.actors ?? null;
  });
}

/**
 * The passers-by of a new moment of the day come in as the others leave: the street never
 * fills up, however many moments go by (here about forty a second at ×1, the test clock).
 * At ×4 and faster, the street keeps its moment of the day.
 */
test('keeps the crowd of the street steady and holds the moment at high speed', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  // Without the automatic acceleration, ×1 stays ×1 and the moments go by.
  await page.addInitScript(() =>
    localStorage.setItem('cle-en-main.settings', JSON.stringify({ autoSpeed: false })),
  );
  await openGame(page);
  await newGame(page, { tutorialOn: false });
  await streetReady(page);
  await speed(page, 1);
  let most = { people: 0, cars: 0, birds: 0 };
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(1_000);
    const actors = await streetActors(page);
    expect(actors).not.toBeNull();
    if (!actors) return;
    most = {
      people: Math.max(most.people, actors.people),
      cars: Math.max(most.cars, actors.cars),
      birds: Math.max(most.birds, actors.birds),
    };
  }
  console.log(`Acteurs de la rue, au plus : ${JSON.stringify(most)}`);
  expect(most.people).toBeLessThanOrEqual(20);
  expect(most.cars).toBeLessThanOrEqual(6);
  expect(most.birds).toBeLessThanOrEqual(8);

  const street = page.getByTestId('street');
  await speed(page, 4);
  await page.waitForTimeout(300);
  const moment = await street.getAttribute('data-moment');
  const before = await clockStamp(page);
  await expect.poll(() => clockStamp(page), { timeout: 10_000 }).not.toBe(before);
  await page.waitForTimeout(1_000);
  await expect(street).toHaveAttribute('data-moment', moment ?? '');
});
