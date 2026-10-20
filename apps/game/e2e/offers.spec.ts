import { expect, test } from '@playwright/test';
import {
  dismissOverlays,
  newGame,
  openGame,
  pause,
  runClock,
  streetReady,
  t,
  tab,
} from './helpers.ts';

/** A refused offer is told, kept on the listing and in the decisions until it is closed. */
test('tells a refused offer, on the listing and in the decisions', async ({ page }) => {
  test.setTimeout(180_000);
  await openGame(page);
  await newGame(page, { tutorialOn: false });
  await pause(page);
  await streetReady(page);

  await tab(page, 'assets');
  await page.getByRole('button', { name: t.assets.seeListings }).click();
  await page.getByRole('button', { name: /^≤ 90\D000/ }).click();
  await page.locator('[data-testid^="listing-"]').first().click();

  // Far too low: the seller refuses once he answers.
  await page.getByRole('button', { name: t.listing.offer }).click();
  await page.getByTestId('offer-amount').fill('5000');
  await page.getByRole('button', { name: t.listing.send }).click();
  await expect(page.getByTestId('offer-status')).toBeVisible();
  await runClock(page, '');
  await expect(page.getByTestId('last-reply')).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.notice')).toContainText(/refuse votre offre/);
  await pause(page);
  await dismissOverlays(page);

  // The decisions keep it until it is closed.
  await tab(page, 'decisions');
  const notice = page.locator('[data-testid^="notice-"]');
  await expect(notice).toHaveCount(1);
  await notice.getByRole('button', { name: t.decisions.closeNotice }).click();
  await expect(notice).toHaveCount(0);

  // The listing still tells it.
  await tab(page, 'assets');
  await expect(page.getByTestId('last-reply')).toBeVisible();
});
