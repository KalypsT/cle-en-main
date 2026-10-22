import { expect, test } from '@playwright/test';
import { newGame, openFilters, openGame, pause, streetReady, t, tab } from './helpers.ts';

/** The tabs keep their screens, and the listings keep their filters. */
test('keeps the listings screen and its filters across tabs and listings', async ({ page }) => {
  test.setTimeout(120_000);
  await openGame(page);
  await newGame(page, { tutorialOn: false });
  await pause(page);
  await streetReady(page);

  await tab(page, 'assets');
  await page.getByRole('button', { name: t.assets.seeListings }).click();
  const heading = page.getByRole('heading', { name: /Annonces/ });
  await expect(heading).toBeVisible();
  await openFilters(page);
  const kind = page.getByRole('button', { name: t.listings.kindShort.apartment, exact: true });
  await kind.click();
  await expect(kind).toHaveAttribute('aria-pressed', 'true');

  // Another tab and back: the same screen.
  await tab(page, 'decisions');
  await tab(page, 'assets');
  await expect(heading).toBeVisible();
  await expect(kind).toHaveAttribute('aria-pressed', 'true');

  // A listing and back: the same filters.
  await page.locator('[data-testid^="listing-"]').first().click();
  await page.getByRole('button', { name: t.common.back }).first().click();
  await expect(heading).toBeVisible();
  await expect(kind).toHaveAttribute('aria-pressed', 'true');

  // Touching the tab already shown goes back to its root.
  await tab(page, 'assets');
  await expect(heading).toBeHidden();
});
