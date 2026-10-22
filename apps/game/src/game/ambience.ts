import { gameContent, timeSettings } from '@cle/content';
import type { Ambience } from '@cle/engine';
import { useState } from 'react';
import { engine } from '../engine.ts';
import type { SessionSnapshot } from '../session/game-session.ts';

export interface ShownAmbience {
  ambience: Ambience;
  /** The clock runs too fast to follow the day: the moment and the weather hold still. */
  still: boolean;
}

/** True when the clock really runs at `stillAmbienceSpeed` or faster. */
export function isFast(snapshot: SessionSnapshot): boolean {
  const speed = snapshot.accelerated ? gameContent.rhythm.autoSpeed.speed : snapshot.speed;
  return snapshot.speed > 0 && speed >= timeSettings.stillAmbienceSpeed;
}

/**
 * The ambience the world shows (street, « Automatique » theme, music): the engine's, except
 * at high speed, where it keeps the one it had when the clock sped up. A game day lasts
 * 2.5 seconds at ×8: the day, the night and the music would flash by.
 */
export function useShownAmbience(snapshot: SessionSnapshot, cityId: string): ShownAmbience {
  const live = engine.ambience(snapshot.state, cityId);
  const fast = isFast(snapshot);
  const [held, setHeld] = useState<{ cityId: string; ambience: Ambience } | null>(null);
  // Adjusted while rendering (React's pattern for state derived from props).
  if (fast && held?.cityId !== cityId) setHeld({ cityId, ambience: live });
  else if (!fast && held !== null) setHeld(null);
  const ambience = fast && held?.cityId === cityId ? held.ambience : live;
  return { ambience, still: fast };
}
