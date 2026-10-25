import { expect, test } from '@playwright/test';
import { importState, openGame, openMenuEntry, referenceGame, rootTab, t } from './helpers.ts';

/** PR 4 of the fixes of 2026-10-25: the banker's meeting, the « Moi » screen, resigning. */
test('meets the banker, then resigns and looks for the job again', async ({ page }) => {
  await openGame(page);
  const start = referenceGame();
  // The game stops at any hour: give the meeting the free time it takes.
  await importState(page, { ...start, player: { ...start.player, freeTimeMinutes: 600 } });

  await openMenuEntry(page, t.menu.bank);
  await page.getByTestId('banker-tirelire').click();
  const meeting = page.getByTestId('banker-meeting');
  await meeting.getByRole('button', { name: t.bank.banker.meet }).click();
  // Held at once: the next one waits a month.
  await expect(meeting.getByRole('button', { name: t.bank.banker.meet })).toBeDisabled();
  await expect(meeting).toContainText(/Prochain rendez-vous possible/);
  await expect(page.getByTestId('bank-log')).toContainText(/Rendez-vous/);

  page.on('dialog', (dialog) => void dialog.accept());
  await rootTab(page, 'menu');
  // « Moi » alone: other buttons say « Moi-même ».
  await page.getByRole('button', { name: t.menu.me, exact: true }).click();
  const work = page.getByTestId('me-work');
  await work.getByRole('button', { name: t.me.resign }).click();
  await expect(page.getByTestId('me')).toContainText(t.me.noJob);
  await work.getByRole('button', { name: t.me.seek }).click();
  await expect(work).toContainText(/retour au travail le/);
});
