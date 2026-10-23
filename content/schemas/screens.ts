import { z } from 'zod';

const text = z.string().min(1);

type TextTree = string | string[] | { [key: string]: TextTree };

const textTree: z.ZodType<TextTree> = z.lazy(() =>
  z.union([text, z.array(text).min(1), z.record(z.string(), textTree)]),
);

/**
 * Texts of the management screens (milestone 4): nested groups of non-empty
 * texts. The interface reads them with the JSON file's own type, so a missing
 * key fails the type check; this schema checks that no text is empty.
 */
export const screenTextsSchema = z.record(z.string(), textTree);

export const TUTORIAL_SPEAKERS = ['gerard', 'yvon'] as const;

/**
 * What moves the tutorial to its next step: the player's « OK », a screen
 * opened, or an engine event.
 */
export const TUTORIAL_TRIGGERS = [
  'ok',
  'screen:listings',
  'screen:listing',
  'screen:financing',
  'event:visitDone',
  'event:offerMade',
  'event:compromisSigned',
  'event:loanRequested',
  'event:deedSigned',
  'event:monthlyStatement',
] as const;

/**
 * What a step points at: the buttons marked `data-tutorial` with this name
 * get a halo while the step is shown.
 */
export const TUTORIAL_TARGETS = [
  'pause',
  'listings',
  'visit',
  'financing',
  'offer',
  'loan',
  'acceptLoan',
] as const;

/** Gérard's tutorial, then Yvon's first review (docs/04, section 4.7). */
export const tutorialSchema = z
  .object({
    speakers: z.record(z.enum(TUTORIAL_SPEAKERS), z.object({ name: text, role: text }).strict()),
    skip: text,
    disable: text,
    ok: text,
    /** Folds the bubble into a small chip, and opens it again. */
    fold: text,
    unfold: text,
    steps: z
      .array(
        z
          .object({
            id: z.string().regex(/^[a-z][a-zA-Z0-9]*$/),
            speaker: z.enum(TUTORIAL_SPEAKERS),
            text: text,
            /** Shown only once this happens (the step waits silently before). */
            showOn: z.enum(TUTORIAL_TRIGGERS).optional(),
            next: z.enum(TUTORIAL_TRIGGERS),
            target: z.enum(TUTORIAL_TARGETS).optional(),
          })
          .strict(),
      )
      .min(1),
  })
  .strict();

export type Tutorial = z.infer<typeof tutorialSchema>;
export type TutorialTrigger = (typeof TUTORIAL_TRIGGERS)[number];
export type TutorialTarget = (typeof TUTORIAL_TARGETS)[number];
