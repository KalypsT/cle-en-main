import { describe, expect, it } from 'vitest';
import { content, newGame } from '../../test/helpers.ts';
import { trustChange } from './banking.ts';
import { modeOf } from './modes.ts';
import { aggressiveness } from './rivals.ts';

describe('game modes (docs/02, section 2.5)', () => {
  it('scales the rivals and the bankers by the mode, from one table', () => {
    const classic = newGame();
    const serene = newGame({ modeId: 'serene' });
    const demanding = newGame({ modeId: 'demanding' });
    expect(modeOf(content, classic).id).toBe('classic');
    expect(aggressiveness(content, serene)).toBeLessThan(aggressiveness(content, classic));
    expect(aggressiveness(content, demanding)).toBeGreaterThan(aggressiveness(content, classic));
    expect(trustChange(content, serene, 2)).toBeGreaterThan(2);
    expect(trustChange(content, demanding, 2)).toBeLessThan(2);
    // Losses are never scaled.
    expect(trustChange(content, serene, -3)).toBe(-3);
  });

  it('describes every mode with its bankruptcy rule and rewinds', () => {
    const byId = Object.fromEntries(content.modes.modes.map((mode) => [mode.id, mode]));
    expect(byId.serene?.rewinds).toBeNull();
    expect(byId.classic?.rewinds).toBe(3);
    expect(byId.demanding).toMatchObject({ rewinds: 0, bankruptcy: 'gameOver' });
    expect(byId.classic?.freshStart).toMatchObject({ savings: 5000, reputationShare: 0.5 });
  });
});
