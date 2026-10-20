import { expect, test } from '@playwright/test';
import { capture, importState, openGame, ownerGame, t, tab } from './helpers.ts';

const MILESTONE = 'retours-jalon-8';

/** Feedback after milestone 8: the sale and the works screens of an owned property. */
test('lists a property for sale, then paints a room oneself', async ({ page }) => {
  await openGame(page);
  await importState(
    page,
    ownerGame(24 * 120, (s) => s.properties.length > 0),
  );
  await tab(page, 'assets');
  await page.locator('[data-testid^="property-"]').first().click();

  // For sale, then withdrawn.
  await page.getByRole('button', { name: t.property.sell }).click();
  await expect(page.getByText(t.sale.net)).toBeVisible();
  await capture(page, '01-vente', MILESTONE);
  await page.getByRole('button', { name: t.sale.list }).click();
  await expect(page.getByTestId('sale-offers')).toBeVisible();
  await page.getByRole('button', { name: t.sale.withdraw }).click();
  await expect(page.getByRole('button', { name: t.sale.list })).toBeVisible();
  await page.getByRole('button', { name: t.common.back }).click();

  // The walls of the first room, painted oneself.
  await page.getByRole('button', { name: t.property.works }).click();
  const walls = page.locator('[data-testid$=".walls"]').first();
  await walls.getByRole('checkbox').first().check();
  await walls.getByRole('checkbox', { name: new RegExp(t.works.diy) }).check();
  await expect(page.getByText(t.works.summary)).toBeVisible();
  await capture(page, '02-travaux', MILESTONE);
  await page.getByRole('button', { name: t.works.start, exact: true }).click();
  await expect(page.getByTestId('works-running')).toContainText(t.works.you);
  await capture(page, '03-chantier', MILESTONE);
});
