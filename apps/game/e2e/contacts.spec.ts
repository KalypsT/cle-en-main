import { expect, test } from '@playwright/test';
import { importState, openGame, openMenuEntry, ownerGame, t, tab } from './helpers.ts';

/** PR 5 of the fixes of 2026-10-25: the address book, and the tax of each regime. */
test('opens the address book: artisans, agencies, bankers and rivals', async ({ page }) => {
  await openGame(page);
  await importState(page, ownerGame(24 * 60));
  await openMenuEntry(page, t.menu.contacts);
  await expect(page.getByTestId('contacts')).toBeVisible();
  await expect(page.getByTestId('contacts-artisans-dole')).toContainText(/fiabilité/);
  await expect(page.getByTestId('contacts-agencies')).toContainText('Immo Zen');
  await expect(page.getByTestId('contacts-rivals')).toContainText('Monique Delaporte');
});

test('tells the tax of the year in each regime on a let property', async ({ page }) => {
  await openGame(page);
  await importState(
    page,
    ownerGame(24 * 150, (s) =>
      s.properties.some((o) => o.lease !== null && o.lease.rentsReceived > 0),
    ),
  );
  await tab(page, 'assets');
  await page.locator('[data-testid^="property-"]').first().click();
  await page.getByRole('button', { name: t.property.tabs.finances }).click();
  await expect(page.getByTestId('regime-estimate')).toContainText(t.property.regimes.real);
});
