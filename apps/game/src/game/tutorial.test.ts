import { tutorial } from '@cle/content';
import { describe, expect, it } from 'vitest';
import { engine } from '../engine.ts';
import { tutorialReaction } from './Tutorial.tsx';

function atStep(id: string) {
  const state = engine.createGame({
    seed: 1,
    startDate: { year: 2026, month: 10, day: 18 },
    startHour: 8,
  });
  state.tutorial.step = tutorial.steps.findIndex((step) => step.id === id);
  return state;
}

describe("Gérard's tutorial", () => {
  it('goes back to looking for a listing when the purchase falls through', () => {
    const spot = tutorial.steps.findIndex((step) => step.id === 'spot');
    for (const id of ['loan', 'deed']) {
      const state = atStep(id);
      expect(tutorialReaction(state, ['event:purchaseCancelled'], null)).toEqual({
        advance: spot,
      });
    }
  });

  it('stays on its step while another purchase goes on', () => {
    const state = atStep('deed');
    state.purchases = [{ id: 'purchase-1' } as (typeof state.purchases)[number]];
    expect(tutorialReaction(state, ['event:purchaseCancelled'], null)).toBeNull();
  });
});
