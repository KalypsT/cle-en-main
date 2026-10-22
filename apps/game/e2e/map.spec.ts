import { expect, test } from '@playwright/test';
import { newGame, openGame, pause, streetReady, t, tab } from './helpers.ts';

/** The city map zooms and pans, gathers crowded pins and keeps its view across tabs. */
test('zooms the city map, gathers pins and keeps the view', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);
  await newGame(page, { tutorialOn: false });
  await pause(page);
  await streetReady(page);

  await tab(page, 'map');
  const svg = page.locator('svg.map');
  const zoom = async () => Number(await svg.getAttribute('data-zoom'));
  const frame = page.getByTestId('map-frame');
  await expect(frame).toBeVisible();
  expect(await zoom()).toBe(1);
  const clusters = page.getByTestId('map-cluster');
  const crowded = await clusters.count();
  expect(crowded).toBeGreaterThan(0);

  // The buttons zoom, the whole-city button comes back.
  await page.getByRole('button', { name: t.map.zoomIn, exact: true }).click();
  await expect.poll(zoom).toBeCloseTo(2, 1);
  // Single listings show their price, coloured by the verdict.
  await expect(page.locator('[data-testid^="map-tag-"]').first()).toBeVisible();
  await page.getByRole('button', { name: t.map.zoomIn, exact: true }).click();
  await expect.poll(zoom).toBeCloseTo(4, 1);

  // The wheel zooms on the pointer; a drag pans.
  const box = await frame.boundingBox();
  if (!box) throw new Error('No map frame');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -300);
  await expect.poll(zoom).toBeGreaterThan(4.5);
  const viewBefore = await svg.getAttribute('viewBox');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 5 });
  await page.mouse.up();
  expect(await svg.getAttribute('viewBox')).not.toBe(viewBefore);

  // Zoomed in, the crowd comes apart into single pins.
  for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -400);
  await expect.poll(zoom).toBeGreaterThan(10);
  expect(await clusters.count()).toBeLessThanOrEqual(crowded);

  // Another tab and back: the same view.
  const kept = await zoom();
  await tab(page, 'decisions');
  await tab(page, 'map');
  expect(await zoom()).toBeCloseTo(kept, 1);

  await page.getByRole('button', { name: t.map.recenter, exact: true }).click();
  await expect.poll(zoom).toBeCloseTo(1, 1);
});
