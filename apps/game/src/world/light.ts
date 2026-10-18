import type { Moment, Season, Weather } from '@cle/engine';
import { mix } from './facade.ts';

/*
 * Colours of the four moments of the day (docs/05, 5.4), softened by the
 * weather. Presentation only: the moment, season and weather come from the
 * engine (engine.ambience, engine.streets).
 */

export interface Light {
  skyTop: number;
  skyBottom: number;
  /** Tint of the buildings and the street (white: daylight). */
  tint: number;
  /** 0 … 1: how much the windows, lamps and headlights glow. */
  glow: number;
  /** Stars and moon. */
  night: boolean;
  /** Sun or moon height, 0 (horizon) … 1. */
  orb: number;
}

const MOMENTS: Record<Moment, Light> = {
  morning: {
    skyTop: 0x9cc3e6,
    skyBottom: 0xf7d9b4,
    tint: 0xfff1e0,
    glow: 0.3,
    night: false,
    orb: 0.35,
  },
  day: { skyTop: 0x78b2e3, skyBottom: 0xdcecf6, tint: 0xffffff, glow: 0, night: false, orb: 0.85 },
  evening: {
    skyTop: 0x4d4f8c,
    skyBottom: 0xe99a72,
    tint: 0xe0c9cf,
    glow: 0.75,
    night: false,
    orb: 0.18,
  },
  night: {
    skyTop: 0x0e1836,
    skyBottom: 0x2b3563,
    tint: 0x6e7596,
    glow: 1,
    night: true,
    orb: 0.7,
  },
};

const GREY_DAY = 0xb9c2cb;
const GREY_NIGHT = 0x1c2230;

export function lightOf(moment: Moment, weather: Weather): Light {
  const base = MOMENTS[moment];
  const overcast =
    weather === 'rain'
      ? 0.6
      : weather === 'snow'
        ? 0.5
        : weather === 'fog'
          ? 0.55
          : weather === 'clouds'
            ? 0.35
            : 0;
  if (overcast === 0) return base;
  const grey = base.night ? GREY_NIGHT : GREY_DAY;
  return {
    ...base,
    skyTop: mix(base.skyTop, grey, overcast),
    skyBottom: mix(base.skyBottom, grey, overcast * 0.8),
    tint: mix(base.tint, base.night ? 0x5c6070 : 0xd4d8dc, overcast * 0.5),
    // Grey days need the lights a bit sooner.
    glow: Math.min(1, base.glow + overcast * 0.15),
  };
}

/** Blends two lights (t = 0: a … 1: b), for the transitions between hours. */
export function blendLight(a: Light, b: Light, t: number): Light {
  return {
    skyTop: mix(a.skyTop, b.skyTop, t),
    skyBottom: mix(a.skyBottom, b.skyBottom, t),
    tint: mix(a.tint, b.tint, t),
    glow: a.glow + (b.glow - a.glow) * t,
    night: t < 0.5 ? a.night : b.night,
    orb: a.orb + (b.orb - a.orb) * t,
  };
}

/**
 * Share of the windows lit at a given hour: people wake up, leave, come home
 * in the evening and go to bed. Decoration only.
 */
const LIT_BY_HOUR = [
  0.14, 0.07, 0.05, 0.05, 0.06, 0.12, 0.3, 0.36, 0.16, 0.05, 0.04, 0.04, 0.05, 0.05, 0.04, 0.04,
  0.08, 0.22, 0.45, 0.6, 0.66, 0.6, 0.45, 0.28,
];

export function litShare(hour: number): number {
  return LIT_BY_HOUR[((hour % 24) + 24) % 24] ?? 0;
}

/** Foliage of the trees by season. */
export function foliage(season: Season): { colors: number[]; bare: boolean; blossom: boolean } {
  switch (season) {
    case 'spring':
      return { colors: [0x8cc46a, 0x9fd27a, 0x7db45d], bare: false, blossom: true };
    case 'summer':
      return { colors: [0x5f9e4f, 0x6aab58, 0x4f8c45], bare: false, blossom: false };
    case 'autumn':
      return { colors: [0xd9822b, 0xc9562c, 0xe0a83a, 0xb5702e], bare: false, blossom: false };
    case 'winter':
      return { colors: [0x7d6a5a], bare: true, blossom: false };
  }
}
