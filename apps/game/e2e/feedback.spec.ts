import type { GameState } from '@cle/engine';
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
  testEngine,
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
  await expect(loan).toContainText(t.bank.end);
  await loan.getByTestId('loan-details').click();
  await expect(page.getByTestId('loan-figures')).toContainText(t.bank.interestLeft);
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
  const owner = ownerGame(24 * 120, (s) => s.properties.some((o) => o.lease !== null));
  // The game stops at any hour: give the free time the talk with the tenant takes.
  await importState(page, { ...owner, player: { ...owner.player, freeTimeMinutes: 600 } });
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

/** A game whose first property was sold (its loan repaid with it) after a few months. */
function sellerGame(): GameState {
  let state = ownerGame(24 * 150, (s) => s.properties.some((o) => o.lease !== null));
  const owned = state.properties[0];
  if (!owned) throw new Error('No property');
  const propertyId = owned.property.id;
  const listed = testEngine.dispatch(state, {
    type: 'sale/list',
    propertyId,
    askingPrice: testEngine.estimate(state, propertyId)?.estimate ?? owned.purchasePrice,
    mode: 'agency',
  });
  if (listed.ok) state = listed.state;
  for (let hour = 0; hour < 24 * 400 && state.soldProperties.length === 0; hour++) {
    state = testEngine.tick(state).state;
    const offer = state.properties[0]?.sale?.offers[0];
    if (offer && !state.properties[0]?.sale?.agreement) {
      const accepted = testEngine.dispatch(state, {
        type: 'sale/acceptOffer',
        propertyId,
        offerId: offer.id,
      });
      if (accepted.ok) state = accepted.state;
    }
  }
  return state;
}

/** A property sold stays readable, its loan among the closed ones, and each banker has a history. */
test('keeps the properties sold, the closed loans and the history of each bank', async ({
  page,
}) => {
  await openGame(page);
  await importState(page, sellerGame());
  await tab(page, 'assets');
  const sold = page.getByTestId('sold-properties').getByRole('button').first();
  await sold.scrollIntoViewIfNeeded();
  await sold.click();
  await expect(page.getByTestId('sold-summary')).toContainText(t.soldProperty.net);
  await capture(page, '11-bien-vendu', MILESTONE);
  await page.getByRole('button', { name: t.soldProperty.tabs.history }).click();
  await expect(page.getByTestId('property-history')).toBeVisible();

  await openMenuEntry(page, t.menu.bank);
  const closed = page.getByTestId('closed-loan').first();
  await closed.scrollIntoViewIfNeeded();
  await expect(closed).toContainText(t.bank.closedReasons.sold);
  await capture(page, '12-credits-soldes', MILESTONE);
  await page.getByTestId('banker-tirelire').click();
  await expect(page.getByTestId('bank-log')).toBeVisible();
  await expect(page.getByTestId('banker').locator('svg').first()).toBeVisible();
  await capture(page, '13-banquier', MILESTONE);
});

/** The months and the years are kept, and a property tells its whole story. */
test('browses the past reviews and the full history of a property', async ({ page }) => {
  await openGame(page);
  await importState(page, ownerGame(24 * 450));
  await tab(page, 'assets');
  await page.locator('[data-testid^="property-"]').first().click();
  await page.getByRole('button', { name: t.property.tabs.history }).click();
  const history = page.getByTestId('property-history');
  await expect(history.locator('li[data-kind="bought"]')).toHaveCount(1);
  await capture(page, '14-historique-du-bien', MILESTONE);
  await history.getByRole('button', { name: t.property.history.filters.market }).click();
  await expect(history.locator('li[data-kind="tenantIn"]')).toHaveCount(0);
  await expect(history.locator('li[data-kind="bought"]')).toHaveCount(1);

  await openMenuEntry(page, t.menu.statement);
  const heading = page.getByTestId('monthly-review').locator('h2').first();
  const last = await heading.textContent();
  await page.getByRole('button', { name: t.review.previous }).click();
  await expect(heading).not.toHaveText(last ?? '');
  await expect(page.getByText(t.review.pastMonthHint)).toBeVisible();
  await capture(page, '15-bilan-passe', MILESTONE);

  await openMenuEntry(page, t.menu.yearReview);
  await expect(page.getByTestId('year-review')).toBeVisible();
});

/** Former tenants, market curves and the trend of a neighbourhood on a listing. */
test('shows the former tenants, the market curves and the trend of a neighbourhood', async ({
  page,
}) => {
  await openGame(page);
  await importState(page, ownerGame(24 * 450));
  await tab(page, 'assets');
  await page.locator('[data-testid^="property-"]').first().click();
  await page.getByRole('button', { name: t.property.tabs.rental }).click();
  const former = page.getByTestId('former-tenants');
  await former.scrollIntoViewIfNeeded();
  await expect(former).toBeVisible();
  await capture(page, '16-anciens-locataires', MILESTONE);

  await openMenuEntry(page, t.menu.statistics);
  const prices = page.getByTestId('neighbourhood-prices');
  await prices.scrollIntoViewIfNeeded();
  await expect(prices.locator('svg')).toBeVisible();
  await expect(page.getByTestId('rate-curve').locator('svg')).toBeVisible();
  await capture(page, '17-courbes-de-marche', MILESTONE);

  // The city sheet shows the same curves; then a listing tells its neighbourhood's trend.
  await openMenuEntry(page, t.menu.cities);
  await page.getByRole('button', { name: t.cities.seeListings }).click();
  await page.locator('[data-testid^="listing-"]').first().click();
  await expect(page.getByTestId('neighbourhood-trend')).toBeVisible();
});
