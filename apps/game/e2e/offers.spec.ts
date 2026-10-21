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

/** A refused offer is told, kept on the listing and in the mail until it is closed. */
test('tells a refused offer, on the listing and in the mail', async ({ page }) => {
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

  // The mail of the decisions keeps it until it is closed; the news tell it too.
  await tab(page, 'decisions');
  await page.getByRole('button', { name: new RegExp(`^${t.decisions.sections.mail}`) }).click();
  const letter = page.getByTestId('mail-offerReply');
  await expect(letter).toHaveCount(1);
  await letter.getByRole('button', { name: t.decisions.closeNotice }).click();
  await expect(letter).toHaveCount(0);
  await page.getByRole('button', { name: new RegExp(`^${t.decisions.sections.news}`) }).click();
  await expect(page.getByTestId('news')).toContainText(/refuse votre offre/);

  // The listing still tells it.
  await tab(page, 'assets');
  await expect(page.getByTestId('last-reply')).toBeVisible();
});
