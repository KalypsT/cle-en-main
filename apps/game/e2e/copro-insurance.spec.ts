import { type GameState, toDayNumber } from '@cle/engine';
import { expect, test } from '@playwright/test';
import { capture, importState, openGame, ownerGame, t, tab } from './helpers.ts';

const MILESTONE = 'notes-partie-d';

/** A landlord whose building held its meeting: a facade voted, a lift refused. */
function afterMeetingGame(): GameState {
  const state = structuredClone(ownerGame(24 * 240, (s) => s.properties.some((o) => o.lease)));
  const owned = state.properties.find((o) => o.lease);
  if (!owned) throw new Error('No let property');
  owned.property.copro = { lots: 12, meetingMonth: 3 };
  owned.coproMeeting = null;
  owned.lastCoproMeeting = {
    day: toDayNumber(state.clock.date) - 20,
    attended: true,
    resolutions: [
      {
        id: 'facadeRenovation',
        cost: 1_200_00,
        vote: 'for',
        passed: true,
        textIndex: 0,
        monthly: 100_00,
        months: 12,
      },
      {
        id: 'elevator',
        cost: 2_500_00,
        vote: 'against',
        passed: false,
        textIndex: 1,
        monthly: 0,
        months: 0,
      },
    ],
    dpeBefore: owned.property.dpe,
    dpeAfter: owned.property.dpe,
  };
  owned.coproCalls = [{ monthly: 100_00, monthsLeft: 11, resolutionId: 'facadeRenovation' }];
  owned.unpaidRentInsurance = { premiums: 180_00, paidOut: 1_300_00 };
  return state;
}

/** Notes of a test game: what the meeting decided, and what the insurance brought. */
test('recaps the last general meeting and the unpaid-rent insurance', async ({ page }) => {
  await openGame(page);
  const state = afterMeetingGame();
  await importState(page, state);
  await tab(page, 'assets');
  const owned = state.properties.find((o) => o.lease);
  await page.getByTestId(`property-${owned?.property.id}`).click();
  const recap = page.getByTestId('copro-last-meeting');
  await expect(recap).toContainText(t.coproMeeting.passed);
  await expect(recap).toContainText(t.coproMeeting.rejected);
  await expect(recap).toContainText(t.coproMeeting.callLeft.replace('{months}', '11'));
  await recap.scrollIntoViewIfNeeded();
  await capture(page, '01-derniere-assemblee', MILESTONE);

  await page.getByRole('button', { name: t.property.tabs.rental }).click();
  const insurance = page.getByTestId('unpaid-rent-insurance');
  await expect(insurance).toContainText(t.property.insurancePaidOut);
  await insurance.scrollIntoViewIfNeeded();
  await capture(page, '02-assurance-impayes', MILESTONE);
});

/** A candidate's risk of unpaid rent, against the premium, before accepting. */
test('weighs the unpaid-rent insurance on each candidate', async ({ page }) => {
  await openGame(page);
  const state = structuredClone(
    ownerGame(24 * 240, (s) => s.properties.some((o) => (o.rental?.applications.length ?? 0) > 0)),
  );
  const owned = state.properties.find((o) => (o.rental?.applications.length ?? 0) > 0);
  if (!owned) throw new Error('No candidate');
  await importState(page, state);
  await tab(page, 'assets');
  await page.getByTestId(`property-${owned.property.id}`).click();
  const count = String(owned.rental?.applications.length ?? 0);
  await page
    .getByRole('button', { name: t.property.seeCandidates.replace('{count}', count) })
    .first()
    .click();
  const advice = page.getByTestId('candidate').first().getByTestId('insurance-advice');
  await expect(advice).toContainText(t.rent.risk.split('{')[0] ?? '');
  await advice.scrollIntoViewIfNeeded();
  await capture(page, '03-conseil-assurance', MILESTONE);
});
