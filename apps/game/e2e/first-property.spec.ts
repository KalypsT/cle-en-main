import { expect, test } from '@playwright/test';
import {
  capture,
  newGame,
  openGame,
  pause,
  speed,
  t,
  tab,
  tutorial,
  waitForDecision,
} from './helpers.ts';

/** Milestone 4: a game played through the interface up to the first let property. */
test('plays from the tutorial to the first let property', async ({ page }) => {
  test.setTimeout(240_000);
  await openGame(page);
  await newGame(page, { captureAs: '01-creation' });
  await pause(page);
  await capture(page, '02-rue-didacticiel');

  // Gérard welcomes the player, then waits for a listing to be opened.
  const bubble = page.getByTestId('tutorial');
  await expect(bubble).toContainText(tutorial.steps[0]?.text ?? '');
  await bubble.getByRole('button', { name: tutorial.ok }).click();
  await expect(bubble).toContainText(tutorial.steps[1]?.text ?? '');

  // Spot: the listings of the map, affordable ones, best gross yield first.
  await tab(page, 'map');
  await capture(page, '03-carte');
  await page.getByRole('button', { name: /annonce\(s\)$/ }).click();
  // « ≤ 90 000 € » (the thousands separator is a narrow no-break space).
  await page.getByRole('button', { name: /^≤ 90\D000/ }).click();
  await page.getByRole('button', { name: t.listings.sortYield }).click();
  await capture(page, '04-annonces');
  await page.locator('[data-testid^="listing-"]').first().click();
  await expect(bubble).toContainText(tutorial.steps[2]?.text ?? '');
  await capture(page, '05-fiche-annonce');

  // Visit, then simulate the financing.
  await page.getByRole('button', { name: /^Visiter/ }).click();
  await expect(page.getByRole('button', { name: t.listing.visitDone })).toBeVisible();
  await expect(bubble).toContainText(tutorial.steps[3]?.text ?? '');
  await page.getByRole('button', { name: t.financing.open }).click();
  await expect(page.getByTestId('financing-monthly')).toBeVisible();
  await page.getByTestId('financing').scrollIntoViewIfNeeded();
  await capture(page, '06-financement');
  await expect(bubble).toContainText(tutorial.steps[4]?.text ?? '');

  // Offer the asking price.
  const asking = (await page.getByTestId('asking-price').textContent()) ?? '';
  const amount = asking.replace(/\D/g, '');
  await page.getByRole('button', { name: t.listing.offer }).click();
  await page.getByTestId('offer-amount').fill(amount);
  await capture(page, '07-offre');
  await page.getByRole('button', { name: t.listing.send }).click();
  await expect(page.getByTestId('offer-status')).toBeVisible();
  await expect(bubble).toContainText(tutorial.steps[5]?.text ?? '');

  // The seller accepts: compromis signed, a loan to ask for.
  const loanNeeded = await waitForDecision(page, 'loanNeeded');
  await loanNeeded.click();
  await expect(bubble).toContainText(tutorial.steps[6]?.text ?? '');
  await page.getByRole('button', { name: t.purchase.request }).click();
  await capture(page, '08-demande-de-pret');
  await page.getByRole('button', { name: t.purchase.send }).click();
  await expect(bubble).toContainText(tutorial.steps[7]?.text ?? '');

  // The bank answers: accept its offer.
  const answer = await waitForDecision(page, 'loanAnswer');
  await answer.click();
  await page.getByRole('button', { name: t.purchase.accept }).click();
  await expect(page.getByText(t.purchase.chosen)).toBeVisible();
  await capture(page, '09-compromis');

  // The deed: the property is ours and empty.
  const vacant = await waitForDecision(page, 'vacant');
  await capture(page, '10-decisions-bien-vide');
  await vacant.click();
  await page.getByRole('button', { name: t.property.rent }).click();
  await expect(page.getByTestId('rent-amount')).toBeVisible();
  await capture(page, '11-mise-en-location');
  await page.getByRole('button', { name: t.rent.publish }).click();

  // A candidate applies: choose them.
  const candidates = await waitForDecision(page, 'candidates');
  await candidates.click();
  const candidate = page.getByTestId('candidate').first();
  await capture(page, '12-candidatures');
  await candidate.getByRole('button', { name: t.rent.accept }).click();

  // The property is let.
  await tab(page, 'assets');
  await expect(page.getByText(t.assets.status.let)).toBeVisible();
  await capture(page, '13-patrimoine');
  await page.locator('[data-testid^="property-"]').first().click();
  await capture(page, '14-fiche-bien');
  await tab(page, 'decisions');
  await capture(page, '15-decisions');
  await speed(page, 4);
  await pause(page);
});
