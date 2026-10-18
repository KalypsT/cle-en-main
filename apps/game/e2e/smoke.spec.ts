import { expect, test } from '@playwright/test';
import { fill, newGame, openGame, pause, speed, t, tab, ui } from './helpers.ts';

test('starts, creates a game, saves it and loads it back', async ({ page }) => {
  await openGame(page);
  await newGame(page, { name: 'Thibaud' });
  await expect(page.getByText(fill(t.street.hello, { name: 'Thibaud' }))).toBeVisible();

  // The clock runs; ×4, then wait for the hour to change.
  const time = page.getByTestId('game-time');
  const startTime = await time.textContent();
  await speed(page, 4);
  await expect(time).not.toHaveText(startTime ?? '', { timeout: 5_000 });

  // Pause, then save from the menu.
  await pause(page);
  const savedDate = await page.getByTestId('game-date').textContent();
  const savedTime = await time.textContent();
  const savedBalance = await page.getByTestId('balance').textContent();
  await tab(page, 'menu');
  await page.getByRole('button', { name: t.menu.save }).click();
  await expect(page.getByRole('status').filter({ hasText: t.menu.saved })).toBeVisible();

  // Reload the page entirely, then continue from slot 1.
  await page.reload();
  await page.getByRole('button', { name: ui.title.continue }).click();
  await page.getByTestId('slot-1').getByRole('button', { name: ui.slots.load }).click();
  await pause(page);
  await expect(page.getByTestId('game-date')).toHaveText(savedDate ?? '');
  await expect(time).toHaveText(savedTime ?? '');
  await expect(page.getByTestId('balance')).toHaveText(savedBalance ?? '');
  await expect(page.getByText(fill(t.street.hello, { name: 'Thibaud' }))).toBeVisible();
});

test('exports a game and imports it into another slot', async ({ page }) => {
  await openGame(page);
  await newGame(page, { slot: 2, name: 'Margot', tutorialOn: false });
  await pause(page);
  const date = await page.getByTestId('game-date').textContent();
  const time = await page.getByTestId('game-time').textContent();

  await tab(page, 'menu');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: t.menu.export }).click();
  const download = await downloadPromise;
  const file = await download.path();

  await page.getByRole('button', { name: t.menu.quit }).click();
  await page.getByRole('button', { name: ui.title.continue }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('slot-3').getByRole('button', { name: ui.slots.import }).click();
  await (await chooserPromise).setFiles(file);
  await pause(page);
  await expect(page.getByTestId('game-date')).toHaveText(date ?? '');
  await expect(page.getByTestId('game-time')).toHaveText(time ?? '');
  await expect(page.getByText(fill(t.street.hello, { name: 'Margot' }))).toBeVisible();
  // The tutorial stays off, as chosen at creation.
  await expect(page.getByTestId('tutorial')).toHaveCount(0);
});

test('rejects an invalid import file', async ({ page }) => {
  await openGame(page);
  await page.getByRole('button', { name: ui.title.continue }).click();
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByTestId('slot-1').getByRole('button', { name: ui.slots.import }).click();
  await (
    await chooserPromise
  ).setFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"formatVersion": 1}'),
  });
  await expect(page.getByRole('status').filter({ hasText: ui.errors.importFailed })).toBeVisible();
});

test('works offline once the service worker is installed', async ({ page, context }) => {
  await openGame(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: ui.app.name })).toBeVisible();
  await newGame(page);
  await expect(page.getByTestId('game-date')).toBeVisible();
});
