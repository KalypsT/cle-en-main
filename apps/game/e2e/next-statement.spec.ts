import { type GameState, toDayNumber } from '@cle/engine';
import { expect, test } from '@playwright/test';
import { capture, importState, openGame, ownerGame, t, tab } from './helpers.ts';

const MILESTONE = 'notes-partie-c';

/** A landlord a statement after the tenant came, whose rent was just lowered by agreement. */
function loweredRentGame(): GameState {
  const state = structuredClone(
    ownerGame(
      24 * 240,
      (s) => s.lastStatement?.lines.some((l) => l.kind === 'rentalIncome') ?? false,
    ),
  );
  const owned = state.properties.find((o) => o.lease);
  const lease = owned?.lease;
  const subject = state.inbox.news.find(
    (n) => n.subject?.propertyId === owned?.property.id,
  )?.subject;
  if (!owned || !lease || !subject) throw new Error('No let property');
  const previousRent = lease.monthlyRent;
  lease.monthlyRent -= 30_00;
  state.inbox.news.push({
    id: state.inbox.nextId++,
    day: toDayNumber(state.clock.date),
    event: {
      type: 'rentAdjusted',
      propertyId: owned.property.id,
      monthlyRent: lease.monthlyRent,
      previousRent,
    },
    subject,
  });
  return state;
}

/** Notes of a test game: the next statement says what moved since the last one, and why. */
test('details the next statement and explains what moved', async ({ page }) => {
  await openGame(page);
  const state = loweredRentGame();
  await importState(page, state);
  await tab(page, 'assets');
  await page.getByRole('button', { name: new RegExp(t.assets.monthlyBudget) }).click();
  await expect(page.getByTestId('next-statement')).toContainText(t.nextStatement.net);
  const owned = state.properties.find((o) => o.lease);
  const card = page.getByTestId(`next-statement-${owned?.property.id}`);
  await expect(card).toContainText(t.nextStatement.kinds.rentalIncome);
  await expect(card.getByTestId('next-statement-why')).toBeVisible();
  await card.scrollIntoViewIfNeeded();
  await capture(page, '01-prochain-bilan', MILESTONE);
});
