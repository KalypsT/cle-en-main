import { expect, type Page } from '@playwright/test';
import { gameContent, timeSettings } from '@cle/content';
import { createEngine, type GameState, serializeGame } from '@cle/engine';
import { fileURLToPath } from 'node:url';
import screens from '../../../content/textes/ecrans.json' with { type: 'json' };
import tutorialTexts from '../../../content/textes/didacticiel.json' with { type: 'json' };
import uiTexts from '../../../content/textes/interface.json' with { type: 'json' };

export const ui = uiTexts;
export const t = screens;
export const tutorial = tutorialTexts;

/** Replaces `{name}` placeholders, like the game does. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** Opens the game in test mode: fixed seed and start date, faster clock. */
export async function openGame(page: Page) {
  await page.goto('./?e2e');
  await expect(page.getByRole('heading', { name: ui.app.name })).toBeVisible();
}

/** New game in a slot, through the creation screen. */
export async function newGame(
  page: Page,
  { slot = 1, name = 'Thibaud', tutorialOn = true, captureAs = '' } = {},
) {
  await page.getByRole('button', { name: ui.title.newGame }).click();
  await page.getByTestId(`slot-${slot}`).getByRole('button', { name: ui.slots.start }).click();
  await page.getByTestId('player-name').fill(name);
  if (!tutorialOn) await page.getByRole('checkbox', { name: t.creation.tutorial }).uncheck();
  if (captureAs) await capture(page, captureAs);
  await page.getByRole('button', { name: t.creation.start }).click();
  await expect(page.getByTestId('game-date')).toBeVisible();
}

export async function pause(page: Page) {
  const button = page.getByRole('button', { name: t.status.pause, exact: true });
  const time = page.getByTestId('game-time');
  // A review can open on the 1st while the clock runs, and closing it sets the previous speed
  // again a moment later: pause, then check that the pause holds with no overlay over it.
  await expect(async () => {
    await dismissOverlays(page);
    // Dispatched straight to the button: waiting for it to be « stable » never ends while the
    // street starves the page of frames at ×4.
    if ((await button.getAttribute('aria-pressed')) !== 'true') await button.dispatchEvent('click');
    const before = await time.textContent();
    await page.waitForTimeout(300);
    expect(await page.locator('.overlay').count()).toBe(0);
    await expect(button).toHaveAttribute('aria-pressed', 'true', { timeout: 500 });
    expect(await time.textContent()).toBe(before);
  }).toPass({ timeout: 20_000 });
}

/** The date and the hour on the status bar. */
export async function clockStamp(page: Page): Promise<string> {
  const date = await page.getByTestId('game-date').textContent();
  const time = await page.getByTestId('game-time').textContent();
  return `${date} ${time}`;
}

/**
 * Lets time run at ×4 until the clock moves (reviews and decisions may stop it:
 * they are closed and the speed is set again on each try), leaving it running.
 */
export async function runClock(page: Page, from: string) {
  await expect(async () => {
    await dismissOverlays(page);
    await speed(page, 4);
    expect(await clockStamp(page)).not.toBe(from);
  }).toPass({ timeout: 15_000 });
}

/** Lets time run until the date changes, then pauses (free time is renewed each day). */
export async function waitNextDay(page: Page) {
  const date = page.getByTestId('game-date');
  const before = (await date.textContent()) ?? '';
  await expect(async () => {
    await dismissOverlays(page);
    await speed(page, 4);
    await expect(date).not.toHaveText(before, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await pause(page);
}

export async function speed(page: Page, value: number) {
  await page.getByRole('button', { name: fill(t.status.speed, { speed: value }) }).click();
}

export async function tab(page: Page, name: keyof typeof t.tabs) {
  await dismissOverlays(page);
  await page.getByRole('navigation').getByRole('button', { name: t.tabs[name] }).click();
}

/** The tab's root screen: a tab shows the screen it was left on, touching it again goes back to its root. */
export async function rootTab(page: Page, name: keyof typeof t.tabs) {
  await tab(page, name);
  await tab(page, name);
}

/** Opens an entry of the « Menu » tab. */
export async function openMenuEntry(page: Page, label: string) {
  await rootTab(page, 'menu');
  await page.getByRole('button', { name: label }).click();
}

/** Closes the monthly review, the yearly review or a title's celebration if one is open. */
export async function dismissOverlays(page: Page) {
  const overlay = page.locator('.overlay');
  for (let i = 0; i < 5 && (await overlay.count()) > 0; i++) {
    await overlay.first().locator('button.primary').last().click();
  }
}

/**
 * Lets time run at ×4 until `locator` shows up on the Décisions tab (the game
 * may pause itself for a decision: speed is set again on each try).
 */
export async function waitForDecision(page: Page, kind: string, timeout = 90_000) {
  await rootTab(page, 'decisions');
  const row = page.getByTestId(`decision-${kind}`).first();
  await expect(async () => {
    await dismissOverlays(page);
    if (!(await row.isVisible())) await speed(page, 4);
    await expect(row).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout });
  await pause(page);
  return row;
}

/** Where `CAPTURES=1 pnpm test:e2e` writes the 390 × 844 screenshots. */
const CAPTURES_DIR = fileURLToPath(new URL('../../../docs/captures/', import.meta.url));

/** A screenshot of the screen as the player sees it, only when CAPTURES is set. */
export async function capture(page: Page, name: string, milestone = 'jalon-4') {
  if (!process.env.CAPTURES) return;
  await page.screenshot({
    path: `${CAPTURES_DIR}${milestone}/${name}.png`,
    scale: 'css',
    animations: 'disabled',
  });
}

/**
 * A game saved at a given hour, built by the engine itself and imported like
 * a player's file: the clock of the end-to-end tests runs too fast to stop it
 * at a precise hour.
 */
export async function importGameAt(page: Page, hour: number, slot = 1) {
  let state = referenceGame();
  const hours = (hour - state.clock.hour + 24) % 24;
  state = testEngine.advanceHours(state, hours).state;
  await importState(page, state, slot);
}

export const testEngine = createEngine(gameContent);

/** The game the end-to-end tests start from, built by the engine. */
export function referenceGame(): GameState {
  return testEngine.createGame({
    seed: 20261018,
    startDate: { year: 2026, month: 10, day: 18 },
    startHour: timeSettings.startHour,
    name: 'Thibaud',
    tutorial: false,
  });
}

/** Imports a game built by the engine into a slot, like a player's file, and pauses it. */
export async function importState(page: Page, state: GameState, slot = 1) {
  await page.getByRole('button', { name: ui.title.continue }).click();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId(`slot-${slot}`).getByRole('button', { name: ui.slots.import }).click();
  await (
    await chooser
  ).setFiles({
    name: 'nuit.json',
    mimeType: 'application/json',
    buffer: Buffer.from(serializeGame(state)),
  });
  await expect(page.getByTestId('game-date')).toBeVisible();
  await pause(page);
}

/** The street drew its first frames (WebGL, or PixiJS's canvas renderer). */
export async function streetReady(page: Page) {
  await expect(page.getByTestId('street').locator('.street-canvas canvas')).toBeVisible();
  // Give the passers-by and the light a moment to settle.
  await page.waitForTimeout(800);
}

/**
 * A game played by the engine until `hours` have passed: the player buys the
 * cheapest affordable flat on credit, lets it bare at the market rent to the
 * first candidate, and takes up the challenges.
 */
export function ownerGame(hours: number, until?: (state: GameState) => boolean): GameState {
  const engine = testEngine;
  let state = referenceGame();
  const act = (action: Parameters<typeof engine.dispatch>[1]) => {
    const result = engine.dispatch(state, action);
    if (result.ok) state = result.state;
  };
  for (let hour = 0; hour < hours; hour++) {
    const { state: next, events } = engine.tick(state);
    state = next;
    for (const event of events) {
      const purchase = state.purchases[0];
      if (event.type === 'compromisSigned' && purchase) {
        act({
          type: 'purchase/requestLoan',
          purchaseId: purchase.id,
          bankId: 'tirelire',
          amount: purchase.price,
          durationYears: 20,
        });
      }
      if (event.type === 'loanAnswered' && event.decision !== 'refused' && purchase) {
        act({
          type: 'purchase/acceptLoan',
          purchaseId: purchase.id,
          applicationId: event.applicationId,
        });
      }
    }
    if (state.clock.hour === 18) {
      if (state.properties.length === 0 && state.purchases.length === 0) {
        const listing = [...state.listings]
          .filter((l) => l.property.cityId === 'dole')
          .filter((l) => l.property.kind === 'apartment' && !l.offer && l.askingPrice < 70_000_00)
          .filter((l) => !engine.rentQuote(state, l.id, 'bare')?.block)
          .sort((a, b) => a.askingPrice - b.askingPrice)[0];
        if (listing)
          act({ type: 'market/offer', listingId: listing.id, amount: listing.askingPrice });
      }
      for (const owned of state.properties) {
        if (!owned.lease && !owned.rental) {
          const quote = engine.rentQuote(state, owned.property.id, 'bare');
          if (quote && !quote.block) {
            act({
              type: 'rent/list',
              propertyId: owned.property.id,
              leaseType: 'bare',
              monthlyRent: quote.market,
              agencyId: null,
              insured: false,
            });
          }
        }
        const application = owned.rental?.applications[0];
        if (application) {
          act({
            type: 'rent/accept',
            propertyId: owned.property.id,
            applicationId: application.id,
          });
        }
      }
      if (state.progress.challenge && !state.progress.challenge.accepted) {
        act({ type: 'challenge/answer', accept: true });
      }
    }
    if (until?.(state)) break;
  }
  return state;
}
