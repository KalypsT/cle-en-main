import { expect, type Page } from '@playwright/test';
import { gameContent, timeSettings } from '@cle/content';
import { createEngine, serializeGame } from '@cle/engine';
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
  const button = page.getByRole('button', { name: t.status.pause });
  await button.click();
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  // Let React render the last hour ticked before the pause: the time stops changing.
  const time = page.getByTestId('game-time');
  await expect(async () => {
    const before = await time.textContent();
    await page.waitForTimeout(150);
    expect(await time.textContent()).toBe(before);
  }).toPass();
}

export async function speed(page: Page, value: number) {
  await page.getByRole('button', { name: fill(t.status.speed, { speed: value }) }).click();
}

export async function tab(page: Page, name: keyof typeof t.tabs) {
  await page.getByRole('navigation').getByRole('button', { name: t.tabs[name] }).click();
}

/**
 * Lets time run at ×4 until `locator` shows up on the Décisions tab (the game
 * may pause itself for a decision: speed is set again on each try).
 */
export async function waitForDecision(page: Page, kind: string, timeout = 90_000) {
  await tab(page, 'decisions');
  const row = page.getByTestId(`decision-${kind}`).first();
  await expect(async () => {
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
  const engine = createEngine(gameContent);
  let state = engine.createGame({
    seed: 20261018,
    startDate: { year: 2026, month: 10, day: 18 },
    startHour: timeSettings.startHour,
    name: 'Thibaud',
    tutorial: false,
  });
  const hours = (hour - state.clock.hour + 24) % 24;
  state = engine.advanceHours(state, hours).state;
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
