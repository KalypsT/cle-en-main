import { tutorial, type TutorialTrigger } from '@cle/content';
import type { GameState } from '@cle/engine';
import { Avatar, CHARACTER_AVATARS } from '../ui/Avatar.tsx';
import { useGame, useNav } from './context.tsx';

/** The tutorial step the game is at, if the tutorial is on and not finished. */
export function currentStep(state: GameState) {
  return state.tutorial.enabled ? tutorial.steps[state.tutorial.step] : undefined;
}

export function tutorialVisible(state: GameState, shownStep: string | null): boolean {
  const step = currentStep(state);
  return step !== undefined && (!step.showOn || shownStep === step.id);
}

/**
 * What a batch of triggers does to the tutorial: show a waiting step, or move
 * to the next one.
 */
export function tutorialReaction(
  state: GameState,
  triggers: readonly TutorialTrigger[],
  shownStep: string | null,
): { show: string } | { advance: number } | null {
  const step = currentStep(state);
  if (!step) return null;
  if (step.showOn && shownStep !== step.id) {
    return triggers.includes(step.showOn) ? { show: step.id } : null;
  }
  if (step.next !== 'ok' && triggers.includes(step.next)) {
    return { advance: state.tutorial.step + 1 };
  }
  return null;
}

/**
 * Gérard's tutorial, then Yvon's first review (docs/04, 4.7). A bubble above
 * the tabs, never blocking: the player can skip a step or stop it.
 */
export function TutorialBubble({ shownStep }: { shownStep: string | null }) {
  const { state, act } = useGame();
  const nav = useNav();
  const step = currentStep(state);
  if (!step || !tutorialVisible(state, shownStep)) return null;
  const speaker = tutorial.speakers[step.speaker];
  const portrait = CHARACTER_AVATARS[step.speaker];
  const next = () => act({ type: 'tutorial/set', step: state.tutorial.step + 1 });

  return (
    <aside className="tutorial" aria-live="polite" data-testid="tutorial">
      {portrait && (
        <span className="tutorial-face">
          <Avatar parts={portrait} size={48} />
        </span>
      )}
      <div className="stack tight grow">
        <p className="small">
          <span className="strong">{speaker.name}</span>
          <span className="muted"> · {speaker.role}</span>
        </p>
        <p className="small">{step.text}</p>
        <div className="tutorial-actions">
          <button
            type="button"
            className="link-button small"
            onClick={() => act({ type: 'tutorial/set', enabled: false })}
          >
            {tutorial.disable}
          </button>
          {step.open && (
            <button
              type="button"
              className="link-button small"
              onClick={() => step.open && nav.push({ name: step.open.screen })}
            >
              {step.open.label}
            </button>
          )}
          <button type="button" className="link-button small" onClick={next}>
            {step.next === 'ok' ? tutorial.ok : tutorial.skip}
          </button>
        </div>
      </div>
    </aside>
  );
}
