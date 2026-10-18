import { music as musicContent, type MusicSlot } from '@cle/content';
import type { Volumes } from '../settings.ts';
import { Ambience, type AmbienceScene } from './ambience.ts';
import { type EffectName, playEffect } from './effects.ts';

/*
 * The game's sound (docs/05, 5.8): three separate volumes (music, ambiences,
 * effects) over Web Audio. Ambiences and effects are synthesised by code (no
 * file to download, works offline); music plays the files listed in
 * content/musique.json, and nothing at all while the slots are empty.
 * Browsers only allow sound after a touch: the mixer starts on the first one.
 */

const RAMP_SECONDS = 0.4;

export class AudioMixer {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private buses: Record<keyof Volumes, GainNode> | null = null;
  private ambience: Ambience | null = null;
  private volumes: Volumes;
  private scene: AmbienceScene | null = null;
  private slot: MusicSlot | null = null;
  private track: { element: HTMLAudioElement; gain: GainNode } | null = null;
  private trackIndex = 0;

  constructor(volumes: Volumes) {
    this.volumes = volumes;
  }

  /** Starts the sound on a user gesture (call it from a pointer or key event). */
  unlock(): void {
    if (this.context) {
      if (this.context.state === 'suspended') void this.context.resume();
      return;
    }
    const Context =
      window.AudioContext ??
      (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Context) return;
    const context = new Context();
    this.context = context;
    this.master = context.createGain();
    this.master.connect(context.destination);
    const bus = () => {
      const gain = context.createGain();
      gain.connect(this.master as GainNode);
      return gain;
    };
    this.buses = { music: bus(), ambience: bus(), effects: bus() };
    this.setVolumes(this.volumes);
    this.ambience = new Ambience(context, this.buses.ambience);
    if (this.scene) this.ambience.update(this.scene);
    if (this.slot) this.playSlot(this.slot, true);
  }

  get started(): boolean {
    return this.context !== null;
  }

  setVolumes(volumes: Volumes): void {
    this.volumes = volumes;
    if (!this.context || !this.buses) return;
    const now = this.context.currentTime;
    for (const key of ['music', 'ambience', 'effects'] as const) {
      // A perceptual curve: half the slider is a quarter of the power.
      this.buses[key].gain.setTargetAtTime(volumes[key] ** 2, now, 0.05);
    }
  }

  /** What the street sounds like now (null: no ambience, the street is hidden). */
  setScene(scene: AmbienceScene | null): void {
    this.scene = scene;
    this.ambience?.update(scene);
  }

  /** Bells ring now (the hour of the engine's ambience). */
  bells(strikes: number): void {
    this.ambience?.bells(strikes);
  }

  effect(name: EffectName): void {
    if (!this.context || !this.buses) return;
    playEffect(this.context, this.buses.effects, name);
  }

  /** Music of a slot: the moment of the day, or a celebration. */
  setMusic(slot: MusicSlot): void {
    if (slot === this.slot) return;
    this.slot = slot;
    if (this.context) this.playSlot(slot, false);
  }

  private playSlot(slot: MusicSlot, immediate: boolean): void {
    const context = this.context;
    const bus = this.buses?.music;
    if (!context || !bus) return;
    const tracks = musicContent.slots[slot];
    const previous = this.track;
    this.track = null;
    const fade = immediate ? 0.01 : musicContent.crossfadeSeconds;
    if (previous) {
      previous.gain.gain.setTargetAtTime(0, context.currentTime, fade / 3);
      setTimeout(
        () => {
          previous.element.pause();
          previous.gain.disconnect();
        },
        fade * 1000 + 200,
      );
    }
    if (tracks.length === 0) return;
    const name = tracks[this.trackIndex++ % tracks.length] ?? '';
    const element = new Audio(
      `${import.meta.env.BASE_URL}${musicContent.folder}/${slot}/${encodeURIComponent(name)}`,
    );
    element.loop = tracks.length === 1;
    element.crossOrigin = 'anonymous';
    const gain = context.createGain();
    gain.gain.value = 0;
    context.createMediaElementSource(element).connect(gain);
    gain.connect(bus);
    gain.gain.setTargetAtTime(1, context.currentTime, Math.max(RAMP_SECONDS, fade / 3));
    // Several tracks in a slot: the next one when this one ends.
    element.addEventListener('ended', () => {
      if (this.slot === slot && this.track?.element === element) {
        this.slot = null;
        this.setMusic(slot);
      }
    });
    void element.play().catch(() => {
      // Missing file or blocked autoplay: the game goes on without music.
    });
    this.track = { element, gain };
  }
}
