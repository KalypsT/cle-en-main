import { z } from 'zod';

const text = z.string().min(1);

/** Every text displayed by the interface. Placeholders use the `{name}` syntax. */
export const uiTextsSchema = z
  .object({
    app: z.object({ name: text, shortName: text, description: text }).strict(),
    title: z.object({ tagline: text, newGame: text, continue: text }).strict(),
    slots: z
      .object({
        newGameHeading: text,
        continueHeading: text,
        slotLabel: text,
        empty: text,
        gameDate: text,
        savedAt: text,
        start: text,
        load: text,
        import: text,
        confirmOverwrite: text,
        back: text,
      })
      .strict(),
    game: z
      .object({
        speedControls: text,
        pause: text,
        speed: text,
        save: text,
        saved: text,
        export: text,
        menu: text,
        demoHeading: text,
        rollDie: text,
        lastRoll: text,
        noRollYet: text,
        latestEvent: text,
      })
      .strict(),
    calendar: z
      .object({
        weekdays: z.array(text).length(7),
        months: z.array(text).length(12),
        date: text,
        time: text,
      })
      .strict(),
    events: z
      .object({ dayStarted: text, weekendStarted: text, monthStarted: text, yearStarted: text })
      .strict(),
    refusals: z.object({ 'demo.invalidSides': text }).strict(),
    errors: z
      .object({ importFailed: text, loadFailed: text, saveFailed: text, storageUnavailable: text })
      .strict(),
    pwa: z.object({ offlineReady: text, updateAvailable: text, reload: text }).strict(),
  })
  .strict();

export type UiTexts = z.infer<typeof uiTextsSchema>;
