import type { Moment, Season, Weather } from '@cle/engine';

/*
 * Ambiences synthesised with Web Audio (docs/05, 5.8): the rumble of the
 * town, rain, water along the quays, birds in the morning, crickets on summer
 * nights, works, and the church bells. Discreet by design.
 */

export interface AmbienceScene {
  moment: Moment;
  weather: Weather;
  season: Season;
  /** The street runs along water. */
  quay: boolean;
  /** Works in the street in view. */
  works: boolean;
}

const RUMBLE: Record<Moment, number> = { morning: 0.16, day: 0.22, evening: 0.17, night: 0.06 };
const TICK_MS = 250;

function noiseBuffer(context: AudioContext, brown: boolean): AudioBuffer {
  const length = context.sampleRate * 2;
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    } else {
      data[i] = white;
    }
  }
  return buffer;
}

/** A looping noise through filters, with its own gain. */
function noiseLayer(
  context: AudioContext,
  output: AudioNode,
  buffer: AudioBuffer,
  filters: BiquadFilterNode[],
): GainNode {
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const gain = context.createGain();
  gain.gain.value = 0;
  let node: AudioNode = source;
  for (const filter of filters) {
    node.connect(filter);
    node = filter;
  }
  node.connect(gain);
  gain.connect(output);
  source.start();
  return gain;
}

function filter(context: AudioContext, type: BiquadFilterType, frequency: number, q = 0.7) {
  const node = context.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.Q.value = q;
  return node;
}

export class Ambience {
  private readonly rumble: GainNode;
  private readonly rain: GainNode;
  private readonly water: GainNode;
  private readonly white: AudioBuffer;
  private scene: AmbienceScene | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly context: AudioContext,
    private readonly output: AudioNode,
  ) {
    this.white = noiseBuffer(context, false);
    const brown = noiseBuffer(context, true);
    this.rumble = noiseLayer(context, output, brown, [filter(context, 'lowpass', 380)]);
    this.rain = noiseLayer(context, output, this.white, [
      filter(context, 'highpass', 900),
      filter(context, 'lowpass', 6500),
    ]);
    this.water = noiseLayer(context, output, brown, [filter(context, 'bandpass', 520, 1.2)]);
  }

  update(scene: AmbienceScene | null): void {
    this.scene = scene;
    const now = this.context.currentTime;
    const set = (gain: GainNode, value: number) => gain.gain.setTargetAtTime(value, now, 0.8);
    set(this.rumble, scene ? RUMBLE[scene.moment] : 0);
    set(this.rain, scene?.weather === 'rain' ? 0.2 : 0);
    set(this.water, scene?.quay ? 0.1 : 0);
    if (scene && !this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
    if (!scene && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Random events of the scene: birds, crickets, hammer and drill. */
  private tick(): void {
    const scene = this.scene;
    if (!scene || this.context.state !== 'running') return;
    const dry = scene.weather !== 'rain' && scene.weather !== 'snow';
    const daylight = scene.moment === 'morning' || scene.moment === 'day';
    if (dry && daylight && scene.season !== 'winter') {
      if (Math.random() < (scene.moment === 'morning' ? 0.16 : 0.06)) this.bird();
    }
    if (
      dry &&
      scene.season === 'summer' &&
      (scene.moment === 'evening' || scene.moment === 'night')
    ) {
      if (Math.random() < 0.3) this.cricket();
    }
    if (scene.works && daylight) {
      const roll = Math.random();
      if (roll < 0.08) this.hammer();
      else if (roll < 0.1) this.drill();
    }
  }

  private envelope(peak: number, attack: number, release: number): GainNode {
    const gain = this.context.createGain();
    const now = this.context.currentTime;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + attack + release);
    gain.connect(this.output);
    return gain;
  }

  private bird(): void {
    const notes = 2 + Math.floor(Math.random() * 3);
    const base = 2600 + Math.random() * 1800;
    for (let i = 0; i < notes; i++) {
      const start = this.context.currentTime + i * 0.13;
      const osc = this.context.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(base, start);
      osc.frequency.exponentialRampToValueAtTime(base * 1.45, start + 0.05);
      osc.frequency.exponentialRampToValueAtTime(base * 0.9, start + 0.1);
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.05, start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.11);
      osc.connect(gain).connect(this.output);
      osc.start(start);
      osc.stop(start + 0.12);
    }
  }

  private cricket(): void {
    for (let i = 0; i < 3; i++) {
      const start = this.context.currentTime + i * 0.06;
      const osc = this.context.createOscillator();
      osc.frequency.value = 4400;
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.012, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.04);
      osc.connect(gain).connect(this.output);
      osc.start(start);
      osc.stop(start + 0.05);
    }
  }

  private hammer(): void {
    for (let i = 0; i < 3; i++) {
      const start = this.context.currentTime + i * 0.32;
      const source = this.context.createBufferSource();
      source.buffer = this.white;
      const band = filter(this.context, 'bandpass', 1300, 4);
      const gain = this.context.createGain();
      gain.gain.setValueAtTime(0.25, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.07);
      source.connect(band).connect(gain).connect(this.output);
      source.start(start, Math.random());
      source.stop(start + 0.08);
    }
  }

  private drill(): void {
    const osc = this.context.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 190;
    const lfo = this.context.createOscillator();
    lfo.frequency.value = 22;
    const depth = this.context.createGain();
    depth.gain.value = 25;
    lfo.connect(depth).connect(osc.frequency);
    const low = filter(this.context, 'lowpass', 1400);
    const gain = this.envelope(0.03, 0.08, 1.4);
    osc.connect(low).connect(gain);
    osc.start();
    lfo.start();
    osc.stop(this.context.currentTime + 1.6);
    lfo.stop(this.context.currentTime + 1.6);
  }

  /** The Collégiale's bell: a few strikes, low and long. */
  bells(strikes: number): void {
    const partials = [0.5, 1, 1.19, 1.5, 2, 2.74];
    const base = 196;
    for (let i = 0; i < strikes; i++) {
      const start = this.context.currentTime + i * 1.7;
      for (const [k, ratio] of partials.entries()) {
        const osc = this.context.createOscillator();
        osc.frequency.value = base * ratio;
        const gain = this.context.createGain();
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.05 / (k + 1), start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 3.2 - k * 0.3);
        osc.connect(gain).connect(this.output);
        osc.start(start);
        osc.stop(start + 3.3);
      }
    }
  }
}
