import { expect, test } from '@playwright/test';
import { capture, newGame, openGame, openMenuEntry, pause, streetReady, t } from './helpers.ts';

const MILESTONE = 'jalon-7';

/** Milestone 7: the region map, a city sheet, looking at another city and moving there. */
test('shows the region, looks at Dijon and moves there', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);
  await newGame(page, { tutorialOn: false });
  await pause(page);
  await streetReady(page);

  await openMenuEntry(page, t.menu.cities);
  const map = page.getByTestId('region-map');
  await expect(map).toBeVisible();
  for (const city of ['dole', 'dijon', 'besancon', 'chalon']) {
    await expect(page.getByTestId(`region-city-${city}`)).toBeVisible();
  }
  // The base is Dole: no trip there; Dijon is a round trip away.
  await expect(page.getByTestId('city-sheet-dole')).toContainText(t.cities.noTrip);
  await page.getByTestId('region-city-dijon').click();
  const sheet = page.getByTestId('city-sheet-dijon');
  await expect(sheet).toContainText('Dijon');
  await expect(sheet).not.toContainText(t.cities.noTrip);
  await capture(page, '01-carte-region', MILESTONE);

  // Looking at Dijon's listings, without moving.
  await sheet.getByRole('button', { name: t.cities.seeListings }).click();
  await expect(page.getByRole('heading', { name: /Dijon/ }).first()).toBeVisible();
  await capture(page, '02-annonces-dijon', MILESTONE);
  await page.getByRole('button', { name: t.common.back }).click();

  // The street of Dijon, with its own streets and neighbourhoods.
  await openMenuEntry(page, t.menu.cities);
  await page.getByTestId('region-city-dijon').click();
  await page
    .getByTestId('city-sheet-dijon')
    .getByRole('button', { name: t.cities.seeStreet })
    .click();
  await streetReady(page);
  await expect(page.getByTestId('street-name')).not.toBeEmpty();
  await capture(page, '03-rue-dijon', MILESTONE);
  await page.getByTestId('street-neighbourhood').selectOption({ index: 3 });
  await streetReady(page);
  await capture(page, '04-quartier-dijon', MILESTONE);

  // Moving to Dijon changes the base.
  await openMenuEntry(page, t.menu.cities);
  await page.getByTestId('region-city-dijon').click();
  await page.getByTestId('move-here').click();
  await page.getByTestId('move-confirm').click();
  await openMenuEntry(page, t.menu.cities);
  await expect(page.getByTestId('city-sheet-dijon')).toContainText(t.cities.noTrip);
  await page.getByTestId('region-city-dole').click();
  await expect(page.getByTestId('city-sheet-dole')).not.toContainText(t.cities.noTrip);
  await capture(page, '05-apres-demenagement', MILESTONE);
});
