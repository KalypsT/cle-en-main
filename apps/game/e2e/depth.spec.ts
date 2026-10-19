import { expect, test } from '@playwright/test';
import { capture, newGame, openGame, openMenuEntry, pause, t } from './helpers.ts';

const MILESTONE = 'jalon-8';

/** Milestone 8: the « Banque et SCI » screen, creating the SCI, the new kinds in the listings. */
test('creates the SCI and filters the listings by the new kinds', async ({ page }) => {
  await openGame(page);
  await newGame(page, { tutorialOn: false });
  await pause(page);

  await openMenuEntry(page, t.menu.bank);
  const company = page.getByTestId('company');
  await expect(company).toContainText(t.bank.companyIntro);
  await capture(page, '01-banque-sci', MILESTONE);
  await company.getByRole('button', { name: /Créer la SCI/ }).click();
  await expect(company.getByText(t.bank.properties)).toBeVisible();
  await expect(company.getByText(t.bank.headroom)).toBeVisible();
  await capture(page, '02-sci-creee', MILESTONE);
  await page.getByRole('button', { name: t.common.back }).click();

  // The listings offer the new kinds as filters.
  await openMenuEntry(page, t.menu.cities);
  await page
    .getByTestId('city-sheet-dole')
    .getByRole('button', { name: t.cities.seeListings })
    .click();
  for (const kind of ['commercial', 'parking', 'land'] as const) {
    await expect(
      page.getByRole('button', { name: t.listings.kindShort[kind], exact: true }),
    ).toBeVisible();
  }
  await page.getByRole('button', { name: t.listings.kindShort.parking, exact: true }).click();
  await capture(page, '03-annonces-parkings', MILESTONE);
});
