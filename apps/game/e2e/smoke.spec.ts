import { expect, test } from '@playwright/test';
import uiTexts from '../../../content/textes/interface.json' with { type: 'json' };

const t = uiTexts;

test('starts, creates a game, saves it and loads it back', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: t.app.name })).toBeVisible();

  // New game in slot 1.
  await page.getByRole('button', { name: t.title.newGame }).click();
  await page.getByTestId('slot-1').getByRole('button', { name: t.slots.start }).click();

  // The clock runs at ×1; switch to ×4 and wait for the hour to change.
  const time = page.getByTestId('game-time');
  const startTime = await time.textContent();
  await page.getByRole('button', { name: t.game.speed.replace('{speed}', '4') }).click();
  await expect(time).not.toHaveText(startTime ?? '', { timeout: 5_000 });

  // Pause, roll the demo die, then save.
  await page.getByRole('button', { name: t.game.pause }).click();
  await page.getByRole('button', { name: t.game.rollDie }).click();
  const savedDate = await page.getByTestId('game-date').textContent();
  const savedTime = await time.textContent();
  const savedRoll = await page.getByTestId('last-roll').textContent();
  await page.getByRole('button', { name: t.game.save }).click();
  await expect(page.getByRole('status').filter({ hasText: t.game.saved })).toBeVisible();

  // Reload the page entirely, then continue from slot 1.
  await page.reload();
  await page.getByRole('button', { name: t.title.continue }).click();
  await page.getByTestId('slot-1').getByRole('button', { name: t.slots.load }).click();
  await page.getByRole('button', { name: t.game.pause }).click();

  await expect(page.getByTestId('game-date')).toHaveText(savedDate ?? '');
  await expect(time).toHaveText(savedTime ?? '');
  await expect(page.getByTestId('last-roll')).toHaveText(savedRoll ?? '');
});

test('exports a game and imports it into another slot', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: t.title.newGame }).click();
  await page.getByTestId('slot-2').getByRole('button', { name: t.slots.start }).click();
  await page.getByRole('button', { name: t.game.pause }).click();
  const date = await page.getByTestId('game-date').textContent();
  const time = await page.getByTestId('game-time').textContent();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: t.game.export }).click();
  const download = await downloadPromise;
  const file = await download.path();

  await page.getByRole('button', { name: t.game.menu }).click();
  await page.getByRole('button', { name: t.title.continue }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('slot-3').getByRole('button', { name: t.slots.import }).click();
  await (await chooserPromise).setFiles(file);
  await page.getByRole('button', { name: t.game.pause }).click();
  await expect(page.getByTestId('game-date')).toHaveText(date ?? '');
  await expect(page.getByTestId('game-time')).toHaveText(time ?? '');
});

test('rejects an invalid import file', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: t.title.continue }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('slot-1').getByRole('button', { name: t.slots.import }).click();
  await (
    await chooserPromise
  ).setFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"formatVersion": 1}'),
  });
  await expect(page.getByRole('status').filter({ hasText: t.errors.importFailed })).toBeVisible();
});

test('works offline once the service worker is installed', async ({ page, context }) => {
  await page.goto('./');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: t.app.name })).toBeVisible();
  await page.getByRole('button', { name: t.title.newGame }).click();
  await page.getByTestId('slot-1').getByRole('button', { name: t.slots.start }).click();
  await expect(page.getByTestId('game-date')).toBeVisible();
});
