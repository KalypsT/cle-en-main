import { tutorial, type TutorialTarget, type TutorialTrigger } from '@cle/content';
import type { GameState } from '@cle/engine';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { format } from '../texts.ts';
import { Avatar, CHARACTER_AVATARS } from '../ui/Avatar.tsx';
import { Icon } from '../ui/Icon.tsx';
import { useGame } from './context.tsx';

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

/** Tabs that lead to a step's target: the map holds the listings, the decisions the purchase. */
const TAB_TARGETS: Partial<Record<TutorialTarget, string>> = {
  listings: 'map',
  loan: 'decisions',
  acceptLoan: 'decisions',
};

/** How often the halo looks for its target, which comes and goes with the screens. */
const HALO_REFRESH_MS = 400;

/**
 * Puts a halo on the buttons a step points at (`data-tutorial`), and on the
 * tab that leads to them.
 */
function useHalo(target: TutorialTarget | undefined) {
  useEffect(() => {
    if (!target) return;
    const tab = TAB_TARGETS[target];
    const selector = [
      `[data-tutorial="${target}"]`,
      ...(tab ? [`.tab-bar [data-tab="${tab}"]`] : []),
    ].join(',');
    let lit: Element[] = [];
    const refresh = () => {
      const found = [...document.querySelectorAll(selector)];
      for (const element of lit) if (!found.includes(element)) element.classList.remove('halo');
      for (const element of found) element.classList.add('halo');
      lit = found;
    };
    refresh();
    const timer = setInterval(refresh, HALO_REFRESH_MS);
    return () => {
      clearInterval(timer);
      for (const element of lit) element.classList.remove('halo');
    };
  }, [target]);
}

/** The notices of the app stand just above the bubble, whatever its height. */
function useClearance() {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const root = document.documentElement;
    const measure = () =>
      root.style.setProperty(
        '--tutorial-clearance',
        `${window.innerHeight - element.getBoundingClientRect().top}px`,
      );
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
      root.style.removeProperty('--tutorial-clearance');
    };
  });
  return ref;
}

/**
 * Gérard's tutorial, then Yvon's first review (docs/04, 4.7). A bubble over
 * the bottom of the screen, never blocking: it points at the button to touch,
 * folds into a small chip, and the player can skip a step or stop it.
 */
export function TutorialBubble({ shownStep }: { shownStep: string | null }) {
  const { state, act } = useGame();
  const step = currentStep(state);
  const visible = step !== undefined && tutorialVisible(state, shownStep);
  const [foldedStep, setFoldedStep] = useState<string | null>(null);
  useHalo(step && visible ? step.target : undefined);
  const clearance = useClearance();
  if (!step || !visible) return null;
  const speaker = tutorial.speakers[step.speaker];
  const portrait = CHARACTER_AVATARS[step.speaker];
  const next = () => act({ type: 'tutorial/set', step: state.tutorial.step + 1 });

  // A folded bubble opens again at the next step.
  if (foldedStep === step.id) {
    return (
      <aside className="tutorial folded" data-testid="tutorial" ref={clearance}>
        <button
          type="button"
          className="tutorial-chip"
          onClick={() => setFoldedStep(null)}
          aria-label={format(tutorial.unfold, { name: speaker.name })}
        >
          {portrait && <Avatar parts={portrait} size={36} />}
          <Icon name="info" size={18} />
        </button>
      </aside>
    );
  }

  return (
    <aside className="tutorial" aria-live="polite" data-testid="tutorial" ref={clearance}>
      {portrait && (
        <span className="tutorial-face">
          <Avatar parts={portrait} size={40} />
        </span>
      )}
      <div className="stack tight grow">
        <div className="tutorial-head">
          <p className="small">
            <span className="strong">{speaker.name}</span>
            <span className="muted"> · {speaker.role}</span>
          </p>
          <button
            type="button"
            className="icon-button tutorial-fold"
            aria-label={tutorial.fold}
            onClick={() => setFoldedStep(step.id)}
          >
            <Icon name="chevron" size={18} />
          </button>
        </div>
        <p className="small">{step.text}</p>
        <div className="tutorial-actions">
          <button
            type="button"
            className="link-button small"
            onClick={() => act({ type: 'tutorial/set', enabled: false })}
          >
            {tutorial.disable}
          </button>
          <button type="button" className="link-button small" onClick={next}>
            {step.next === 'ok' ? tutorial.ok : tutorial.skip}
          </button>
        </div>
      </div>
    </aside>
  );
}
