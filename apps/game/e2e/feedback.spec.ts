import { expect, test } from '@playwright/test';
import {
  capture,
  importState,
  newGame,
  openGame,
  openMenuEntry,
  ownerGame,
  pause,
  t,
  tab,
  ui,
} from './helpers.ts';

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

  // The loan of the purchase, in detail.
  await openMenuEntry(page, t.menu.bank);
  const loan = page.getByTestId('loan').first();
  await expect(loan).toContainText(t.bank.interestLeft);
  await expect(loan).toContainText(t.bank.end);
  await capture(page, '04-banque', MILESTONE);
});

test('draws the value curve of a property owned for a few months', async ({ page }) => {
  await openGame(page);
  await importState(page, ownerGame(24 * 200));
  await tab(page, 'assets');
  await page.locator('[data-testid^="property-"]').first().click();
  await page.getByRole('button', { name: t.property.tabs.finances }).click();
  const curve = page.getByTestId('value-curve');
  await expect(curve.locator('svg')).toBeVisible();
  await expect(curve).toContainText(t.property.valueCurve.equity);
  await curve.scrollIntoViewIfNeeded();
  await capture(page, '05-valeur-du-bien', MILESTONE);
});

test('shows the version of the game and looks for an update', async ({ page }) => {
  await openGame(page);
  await newGame(page, { tutorialOn: false });
  await pause(page);
  await openMenuEntry(page, t.menu.settings);
  const version = page.getByTestId('version');
  await expect(version).toContainText('Version');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await version.getByRole('button', { name: t.settings.checkUpdate }).click();
  await expect(version.getByText(t.settings.upToDate)).toBeVisible();
  await version.scrollIntoViewIfNeeded();
  await capture(page, '06-version', MILESTONE);
});

test('sells a let flat at a discount, or pays the tenant to leave', async ({ page }) => {
  await openGame(page);
  await importState(
    page,
    ownerGame(24 * 120, (s) => s.properties.some((o) => o.lease !== null)),
  );
  await tab(page, 'assets');
  await page.locator('[data-testid^="property-"]').first().click();

  // For sale with its tenant: the buyers take a discount.
  await page.getByRole('button', { name: t.property.sell }).click();
  await expect(page.getByText(t.sale.tenant)).toBeVisible();
  await expect(page.getByText(/les acheteurs en retirent/)).toBeVisible();
  await page.getByRole('button', { name: t.common.back }).click();

  // A generous indemnity: the tenant leaves in a month.
  await page.getByRole('button', { name: t.property.tabs.rental }).click();
  const buyout = page.getByTestId('buyout');
  await buyout.scrollIntoViewIfNeeded();
  await capture(page, '07-depart-negocie', MILESTONE);
  await buyout.getByTestId('buyout-amount').fill('5000');
  await buyout.getByRole('button', { name: /Proposer/ }).click();
  await expect(page.getByText(/Préavis donné/)).toBeVisible();
});

/** The « Décisions » tab keeps the mail and the news in the save (docs/04, section 4.10). */
test('keeps the mail and the news of the decisions across a reload', async ({ page }) => {
  await openGame(page);
  await importState(page, ownerGame(24 * 200));
  await tab(page, 'decisions');
  await capture(page, '08-decisions', MILESTONE);

  await page.getByRole('button', { name: new RegExp(`^${t.decisions.sections.mail}`) }).click();
  const letters = page.locator('[data-testid^="mail-"]');
  await expect(letters.first()).toBeVisible();
  await capture(page, '09-courrier', MILESTONE);

  await page.getByRole('button', { name: new RegExp(`^${t.decisions.sections.news}`) }).click();
  const news = page.getByTestId('news').locator('li');
  await expect(news.first()).toBeVisible();
  await capture(page, '10-actualites', MILESTONE);
  // A filter keeps one family only.
  const all = await news.count();
  await page.getByRole('button', { name: t.decisions.newsFilters.progress }).click();
  await expect.poll(() => news.count()).toBeLessThan(all);

  // Saved with the game: still there once it is loaded again.
  await tab(page, 'menu');
  await page.getByRole('button', { name: t.menu.save }).click();
  await page.reload();
  await page.getByRole('button', { name: ui.title.continue }).click();
  await page.getByTestId('slot-1').getByRole('button', { name: ui.slots.load }).click();
  await pause(page);
  await tab(page, 'decisions');
  await page.getByRole('button', { name: new RegExp(`^${t.decisions.sections.mail}`) }).click();
  await expect(letters.first()).toBeVisible();
});
