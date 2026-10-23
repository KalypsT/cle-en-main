import { annuityPayment, type GameState, toCents } from '@cle/engine';
import { expect, test } from '@playwright/test';
import { capture, importState, openGame, openMenuEntry, ownerGame, t, tab } from './helpers.ts';

const MILESTONE = 'notes-partie-b';
/** The decision's title, whatever the bank and the rate. */
const DECISION = new RegExp(t.decisions.kinds.renegotiation.replace(/\{\w+\}/g, '.*'));

/** An owner whose loan costs well above today's offers, with savings to repay some of it. */
function expensiveLoanGame(): GameState {
  const state = structuredClone(ownerGame(24 * 120, (s) => s.loans.length > 0));
  const loan = state.loans[0];
  if (!loan) throw new Error('No loan');
  loan.ratePercent += 2;
  loan.monthlyPayment = annuityPayment(
    loan.remaining,
    loan.ratePercent,
    loan.durationMonths - loan.paymentsMade,
  );
  loan.renegotiationSuggested = true;
  state.player.balance = toCents(40_000);
  return state;
}

/** Notes of a test game: the renegotiation has its screen, and a loan can be repaid early. */
test('renegotiates a loan from its decision, or declines, and repays part of it', async ({
  page,
}) => {
  await openGame(page);
  await importState(page, expensiveLoanGame());

  // The decision opens the loan's screen: the next payment, then the offers.
  await tab(page, 'decisions');
  await page.getByText(DECISION).first().click();
  await expect(page.getByTestId('loan-split')).toContainText(t.loan.splitCapital);
  const offers = page.getByTestId('loan-refinance');
  await expect(offers).toContainText(t.loan.newPayment);
  await capture(page, '01-renegociation', MILESTONE);

  // Declined: no more reminder.
  await page.getByTestId('decline-refinancing').click();
  await expect(offers).toContainText(t.loan.declined);

  // Early repayment: the payment goes down, the same end.
  const payment = page.getByTestId('loan-figures').locator('dd').nth(2);
  const before = await payment.textContent();
  await page.getByTestId('prepay-amount').fill('10000');
  await expect(page.getByTestId('loan-prepay')).toContainText(t.loan.previewSaved);
  await capture(page, '02-remboursement-anticipe', MILESTONE);
  await page.getByTestId('prepay-confirm').click();
  await expect(payment).not.toHaveText(before ?? '');

  // Back in the bank, the loan card leads to the same screen.
  await openMenuEntry(page, t.menu.bank);
  await expect(page.getByTestId('loan-details').first()).toBeVisible();
  await tab(page, 'decisions');
  await expect(page.getByText(DECISION)).toHaveCount(0);
});
