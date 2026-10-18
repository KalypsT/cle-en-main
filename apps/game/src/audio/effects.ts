/*
 * Discreet interface effects (docs/05, 5.8), synthesised: « ka-ching » for
 * the rents, the notary's stamp, the drill of works starting, a soft pop for
 * a new bubble.
 */

export type EffectName = 'kaching' | 'stamp' | 'drill' | 'pop';

function tone(
  context: AudioContext,
  output: AudioNode,
  frequency: number,
  start: number,
  duration: number,
  peak: number,
  type: OscillatorType = 'sine',
): void {
  const osc = context.createOscillator();
  osc.type = type;
  osc.frequency.value = frequency;
  const gain = context.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(output);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function thump(context: AudioContext, output: AudioNode, start: number): void {
  const osc = context.createOscillator();
  osc.frequency.setValueAtTime(160, start);
  osc.frequency.exponentialRampToValueAtTime(50, start + 0.12);
  const gain = context.createGain();
  gain.gain.setValueAtTime(0.5, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
  osc.connect(gain).connect(output);
  osc.start(start);
  osc.stop(start + 0.2);
}

export function playEffect(context: AudioContext, output: AudioNode, name: EffectName): void {
  const now = context.currentTime;
  switch (name) {
    case 'kaching':
      // The drawer's bell, then two coins.
      tone(context, output, 2093, now, 0.5, 0.12, 'triangle');
      tone(context, output, 2637, now + 0.06, 0.6, 0.1, 'triangle');
      tone(context, output, 3136, now + 0.16, 0.25, 0.06);
      tone(context, output, 3520, now + 0.24, 0.25, 0.05);
      break;
    case 'stamp':
      thump(context, output, now);
      thump(context, output, now + 0.22);
      break;
    case 'drill': {
      const osc = context.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(120, now);
      osc.frequency.linearRampToValueAtTime(260, now + 0.25);
      osc.frequency.setValueAtTime(260, now + 0.7);
      osc.frequency.linearRampToValueAtTime(140, now + 0.9);
      const low = context.createBiquadFilter();
      low.type = 'lowpass';
      low.frequency.value = 1600;
      const gain = context.createGain();
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.06, now + 0.05);
      gain.gain.setValueAtTime(0.06, now + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
      osc.connect(low).connect(gain).connect(output);
      osc.start(now);
      osc.stop(now + 1);
      break;
    }
    case 'pop':
      tone(context, output, 880, now, 0.09, 0.05);
      tone(context, output, 1320, now + 0.04, 0.08, 0.04);
      break;
  }
}
