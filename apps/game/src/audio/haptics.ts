import type { EffectName } from './effects.ts';

/**
 * A short buzz with some sound effects (docs/05, 5.8): the notary's stamp, the
 * rents. Android phones only; elsewhere the browser has no vibration and this
 * does nothing.
 */
const PATTERNS: Partial<Record<EffectName, number[]>> = {
  stamp: [45],
  kaching: [15, 70, 15],
};

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function vibrateFor(effect: EffectName): void {
  const pattern = PATTERNS[effect];
  if (!pattern || !canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Some browsers refuse a vibration before the first touch: nothing to do.
  }
}
