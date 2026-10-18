import { gameContent } from '@cle/content';
import {
  createEngine,
  type GameAction,
  type GameEvent,
  type GameState,
  serializeGame,
} from '@cle/engine';
import { expect, test } from '@playwright/test';
import { capture, openGame, pause, t, tab, ui } from './helpers.ts';

const engine = createEngine(gameContent);

/** Advances day by day until an event matches. */
function until(state: GameState, match: (event: GameEvent) => boolean): GameState {
  let current = state;
  for (let day = 0; day < 120; day++) {
    const result = engine.advanceHours(current, 24);
    current = result.state;
    if (result.events.some(match)) return current;
  }
  throw new Error('Expected event did not happen');
}

function act(state: GameState, action: GameAction): GameState {
  const result = engine.dispatch(state, action);
  if (!result.ok) throw new Error(`${action.type} refused: ${result.reason.code}`);
  return result.state;
}

/** A game where the player owns a vacant flat bought with a Tirelire loan. */
function gameWithProperty(): GameState {
  let state = engine.createGame({
    seed: 4242,
    startDate: { year: 2026, month: 10, day: 18 },
    startHour: 8,
    name: 'Thibaud',
    tutorial: false,
  });
  const listing = [...state.listings]
    .filter((l) => l.property.kind === 'apartment' && l.askingPrice <= 90_000_00)
    .filter((l) => !engine.rentQuote(state, l.id, 'bare')?.block)
    .sort((a, b) => a.askingPrice - b.askingPrice)[0];
  if (!listing) throw new Error('No listing');
  state = act(state, { type: 'market/offer', listingId: listing.id, amount: listing.askingPrice });
  state = until(state, (e) => e.type === 'compromisSigned');
  const purchase = state.purchases[0];
  if (!purchase) throw new Error('No compromis');
  state = act(state, {
    type: 'purchase/requestLoan',
    purchaseId: purchase.id,
    bankId: 'tirelire',
    amount: purchase.price,
    durationYears: 20,
  });
  state = until(state, (e) => e.type === 'loanAnswered');
  const application = state.purchases[0]?.applications[0];
  if (!application) throw new Error('No application');
  state = act(state, {
    type: 'purchase/acceptLoan',
    purchaseId: purchase.id,
    applicationId: application.id,
  });
  return until(state, (e) => e.type === 'deedSigned');
}

test('manages a property: works, resale, bank, taxes, statement, agenda, contacts', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const save = serializeGame(gameWithProperty());

  // Import the game into slot 1.
  await openGame(page);
  await page.getByRole('button', { name: ui.title.continue }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('slot-1').getByRole('button', { name: ui.slots.import }).click();
  await (
    await chooser
  ).setFiles({ name: 'partie.json', mimeType: 'application/json', buffer: Buffer.from(save) });
  await pause(page);

  // The property sheet: overview, rooms, finances.
  await tab(page, 'assets');
  await page.locator('[data-testid^="property-"]').first().click();
  await capture(page, '20-fiche-bien-vide');
  await page.getByRole('button', { name: t.property.tabs.finances }).click();
  await expect(page.getByText(t.property.lines.loanPayment)).toBeVisible();
  await capture(page, '21-finances-bien');
  await page.getByRole('button', { name: t.property.tabs.overview }).click();

  // Works: walls of the living room, standard range, a quote, then start.
  await page.getByRole('button', { name: t.property.works }).click();
  const living = page
    .locator('details.items-group')
    .filter({ hasText: /Séjour/ })
    .first();
  await living.locator('summary').click();
  await living.getByRole('combobox', { name: 'Murs et plafonds' }).selectOption('standard');
  await expect(page.getByTestId('works-estimate')).toBeVisible();
  await capture(page, '22-plan-travaux');
  await page
    .getByRole('button', { name: /^Devis de / })
    .first()
    .click();
  const quote = page.getByTestId('quote').first();
  await expect(quote).toBeVisible();
  await quote.getByRole('checkbox').check();
  await expect(page.getByTestId('works-schedule')).toBeVisible();
  await capture(page, '23-devis-et-frise');
  await page.getByRole('button', { name: t.works.start }).click();
  await expect(page.getByText(t.works.inProgress).first()).toBeVisible();
  await capture(page, '24-chantier-en-cours');

  // Resale preview.
  await page.getByRole('button', { name: t.common.back }).click();
  await page.getByRole('button', { name: t.property.sell }).click();
  await expect(page.getByText(t.sale.net)).toBeVisible();
  await capture(page, '25-revente');

  // Menu: bank (loans, simulator, renegotiation), taxes, agenda, contacts.
  await tab(page, 'menu');
  await page.getByRole('button', { name: t.menu.bank }).click();
  await expect(page.getByTestId('loan')).toBeVisible();
  await capture(page, '26-banque');
  await page.getByTestId('loan').getByRole('button', { name: t.bank.renegotiate }).click();
  await expect(page.getByRole('dialog')).toContainText(t.bank.newRate);
  await page.getByRole('button', { name: t.common.close }).click();
  await page.getByRole('button', { name: t.common.back }).click();
  await page.getByRole('button', { name: t.menu.taxes }).click();
  await expect(page.getByTestId('tax-estimate')).toBeVisible();
  await capture(page, '27-impots');
  await page.getByRole('button', { name: t.common.back }).click();
  await page.getByRole('button', { name: t.menu.agenda }).click();
  await expect(page.getByText(/^Chantier : /).first()).toBeVisible();
  await capture(page, '28-agenda');
  await page.getByRole('button', { name: t.common.back }).click();
  await page.getByRole('button', { name: t.menu.contacts }).click();
  await expect(page.getByText(t.contacts.rivals)).toBeVisible();
  await capture(page, '29-carnet');

  // The monthly statement of the 1st (the deed came after it).
  await page.getByRole('button', { name: t.common.back }).click();
  await page.getByRole('button', { name: t.menu.statement }).click();
  await expect(page.getByText(t.statement.net)).toBeVisible();
  await capture(page, '30-bilan-du-mois');
});
