import type { Avatar as AvatarParts } from '@cle/engine';
import { useId, type ReactNode } from 'react';

/**
 * The player's composed avatar (docs/05, section 5.5), drawn by code.
 *
 * The saved avatar keeps four indices (face, hair, skin, outfit). Two of them
 * pack a second choice so that the save format stays the same: `hair` is
 * `style + HAIR_STYLES.length * colour` and `outfit` is
 * `outfit + OUTFITS.length * accessory`. Use `AVATAR_CONTROLS` to read and
 * write the six choices offered to the player.
 *
 * Hair is drawn in two layers: a back layer behind the head (volume, length,
 * bun, tail) and a front layer clipped to the head (fringe, temples), so that
 * every style follows every face shape.
 */
const SKINS = ['#f3d2b5', '#e8b98f', '#c98e62', '#a86b45', '#7a4a2c', '#f6dccb'];
const HAIR_COLORS = [
  '#1e1b18',
  '#3b2a1e',
  '#6b4325',
  '#a34a28',
  '#c8963e',
  '#e0c27a',
  '#8c8c8c',
  '#d8d8d8',
];
const OUTFITS = [
  { body: '#0f6f68', collar: '#fffdf8', neck: 'v' },
  { body: '#2f4a7a', collar: '#e8eef8', neck: 'v' },
  { body: '#b23d27', collar: '#fbe9e4', neck: 'v' },
  { body: '#c9a227', collar: '#4a3b10', neck: 'v' },
  { body: '#4b4f58', collar: '#dfe1e6', neck: 'v' },
  { body: '#3f6b3a', collar: '#3f6b3a', neck: 'round' },
  { body: '#6a3d6e', collar: '#6a3d6e', neck: 'round' },
  { body: '#c9743a', collar: '#c9743a', neck: 'turtle' },
] as const;
const FACES = [
  { rx: 26, ry: 29 },
  { rx: 24, ry: 32 },
  { rx: 28, ry: 27 },
  { rx: 25, ry: 30 },
];
/** The first six keep the order of the first version of the avatar. */
const HAIR_STYLES = [
  'short',
  'long',
  'bun',
  'curly',
  'side',
  'ponytail',
  'crop',
  'bob',
  'afro',
  'receding',
  'bald',
] as const;
type HairStyle = (typeof HAIR_STYLES)[number];

const ACCESSORIES = [
  { glasses: null, beard: false, earrings: false },
  { glasses: 'round', beard: false, earrings: false },
  { glasses: 'square', beard: false, earrings: false },
  { glasses: null, beard: true, earrings: false },
  { glasses: 'round', beard: true, earrings: false },
  { glasses: null, beard: false, earrings: true },
  { glasses: 'round', beard: false, earrings: true },
] as const;

type ControlKey = 'face' | 'hair' | 'hairColor' | 'skin' | 'outfit' | 'accessory';

interface Control {
  count: number;
  get: (parts: AvatarParts) => number;
  set: (parts: AvatarParts, index: number) => AvatarParts;
}

const mod = (index: number, count: number) => ((index % count) + count) % count;

function pick<T>(list: readonly T[], index: number): T {
  return list[mod(index, list.length)] as T;
}

/** The six choices of the creation screen, mapped onto the four saved indices. */
export const AVATAR_CONTROLS: Record<ControlKey, Control> = {
  face: {
    count: FACES.length,
    get: (p) => mod(p.face, FACES.length),
    set: (p, index) => ({ ...p, face: index }),
  },
  hair: {
    count: HAIR_STYLES.length,
    get: (p) => mod(p.hair, HAIR_STYLES.length),
    set: (p, index) => ({
      ...p,
      hair: index + HAIR_STYLES.length * AVATAR_CONTROLS.hairColor.get(p),
    }),
  },
  hairColor: {
    count: HAIR_COLORS.length,
    get: (p) => mod(Math.floor(p.hair / HAIR_STYLES.length), HAIR_COLORS.length),
    set: (p, index) => ({
      ...p,
      hair: AVATAR_CONTROLS.hair.get(p) + HAIR_STYLES.length * index,
    }),
  },
  skin: {
    count: SKINS.length,
    get: (p) => mod(p.skin, SKINS.length),
    set: (p, index) => ({ ...p, skin: index }),
  },
  outfit: {
    count: OUTFITS.length,
    get: (p) => mod(p.outfit, OUTFITS.length),
    set: (p, index) => ({
      ...p,
      outfit: index + OUTFITS.length * AVATAR_CONTROLS.accessory.get(p),
    }),
  },
  accessory: {
    count: ACCESSORIES.length,
    get: (p) => mod(Math.floor(p.outfit / OUTFITS.length), ACCESSORIES.length),
    set: (p, index) => ({
      ...p,
      outfit: AVATAR_CONTROLS.outfit.get(p) + OUTFITS.length * index,
    }),
  },
};

export const AVATAR_KEYS = [
  'face',
  'hair',
  'hairColor',
  'skin',
  'outfit',
  'accessory',
] as const satisfies readonly ControlKey[];

/** Builds saved indices from the six choices. */
function compose(choices: Record<ControlKey, number>): AvatarParts {
  let parts: AvatarParts = { face: 0, hair: 0, skin: 0, outfit: 0 };
  for (const key of AVATAR_KEYS) parts = AVATAR_CONTROLS[key].set(parts, choices[key]);
  return parts;
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const channel = (v: number) =>
    Math.max(0, Math.min(255, Math.round(v * factor)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(n >> 16)}${channel((n >> 8) & 255)}${channel(n & 255)}`;
}

/** Hair layers for a head of half-width `rx` and half-height `ry` centred on (50, 46). */
function hairLayers(
  style: HairStyle,
  rx: number,
  ry: number,
): { back: ReactNode; front: ReactNode } {
  const top = 46 - ry;
  const left = 50 - rx;
  const right = 50 + rx;
  const volume = <ellipse cx="50" cy={top + 15} rx={rx + 3} ry="19" />;
  const cap = (extra = 0) => (
    <path
      d={`M0 0H100V44H${right - 3}Q${right - 4} ${top + 17 + extra} 50 ${top + 11 + extra}Q${left + 4} ${top + 17 + extra} ${left + 3} 44H0z`}
    />
  );
  switch (style) {
    case 'short':
      return { back: volume, front: cap() };
    case 'crop':
      return {
        back: <ellipse cx="50" cy={top + 14} rx={rx + 1} ry="16" />,
        front: <path d={`M0 0H100V${top + 10}Q50 ${top + 6} 0 ${top + 10}z`} />,
      };
    case 'side':
      return {
        back: volume,
        front: (
          <path
            d={`M0 0H100V44H${right - 3}Q${right - 3} ${top + 20} ${right - 12} ${top + 15}Q58 ${top + 9} 40 ${top + 9}Q${left + 3} ${top + 14} ${left + 2} 44H0z`}
          />
        ),
      };
    case 'long':
      return {
        back: (
          <path
            d={`M${left - 5} 50Q${left - 5} ${top - 3} 50 ${top - 3}Q${right + 5} ${top - 3} ${right + 5} 50V84H${left - 5}z`}
          />
        ),
        front: (
          <path
            d={`M0 0H100V50H${right - 2}Q${right - 4} ${top + 22} 50 ${top + 9}Q${left + 4} ${top + 22} ${left + 2} 50H0z`}
          />
        ),
      };
    case 'bob':
      return {
        back: (
          <path
            d={`M${left - 5} 52Q${left - 5} ${top - 3} 50 ${top - 3}Q${right + 5} ${top - 3} ${right + 5} 52V66Q${right + 5} 70 ${right} 70H${left}Q${left - 5} 70 ${left - 5} 66z`}
          />
        ),
        front: (
          <path
            d={`M0 0H100V52H${right - 1}V${top + 21}Q50 ${top + 12} ${left + 1} ${top + 21}V52H0z`}
          />
        ),
      };
    case 'bun':
      return {
        back: (
          <>
            <circle cx="50" cy={top - 1} r="10" />
            {volume}
          </>
        ),
        front: cap(2),
      };
    case 'ponytail':
      return {
        back: (
          <>
            {volume}
            <path
              d={`M${right - 4} ${top + 8}q16 4 14 28q-1 14 -8 20q2 -14 -4 -22q-6 -8 -8 -10z`}
            />
          </>
        ),
        front: cap(),
      };
    case 'curly':
      return {
        back: (
          <>
            {[-24, -12, 0, 12, 24].map((dx) => (
              <circle key={dx} cx={50 + dx} cy={top + 7 + Math.abs(dx) / 4} r="11" />
            ))}
            <circle cx={left - 3} cy="42" r="9" />
            <circle cx={right + 3} cy="42" r="9" />
            <circle cx={left - 2} cy="54" r="7" />
            <circle cx={right + 2} cy="54" r="7" />
          </>
        ),
        front: (
          <>
            {[-18, -6, 6, 18].map((dx) => (
              <circle key={dx} cx={50 + dx} cy={top + 8} r="9" />
            ))}
            <path d={`M0 0H100V${top + 6}H0z`} />
            <rect x="0" y="0" width={left + 3} height="46" />
            <rect x={right - 3} y="0" width="30" height="46" />
          </>
        ),
      };
    case 'afro':
      return {
        back: <ellipse cx="50" cy="40" rx={rx + 17} ry="33" />,
        front: cap(-1),
      };
    case 'receding':
      return {
        back: null,
        front: (
          <>
            <path d={`M0 ${top + 13}Q${left + 3} ${top + 12} ${left + 4} 48H0z`} />
            <path d={`M100 ${top + 13}Q${right - 3} ${top + 12} ${right - 4} 48H100z`} />
          </>
        ),
      };
    case 'bald':
      return { back: null, front: null };
  }
}

/** The three expressions of the portraits (docs/05, 5.5); « smile » is the everyday face. */
export type Mood = 'smile' | 'happy' | 'neutral' | 'upset';

/** Mouths and eyebrows of each expression. */
const MOODS: Record<Mood, { mouth: string; open: boolean; brows: string }> = {
  smile: { mouth: 'M42 60 q8 6 16 0', open: false, brows: 'M35 40 q5 -3 10 0M55 40 q5 -3 10 0' },
  happy: { mouth: 'M41 58 q9 11 18 0z', open: true, brows: 'M35 38 q5 -4 10 0M55 38 q5 -4 10 0' },
  neutral: { mouth: 'M43 61 h14', open: false, brows: 'M35 40 h10M55 40 h10' },
  upset: { mouth: 'M42 63 q8 -6 16 0', open: false, brows: 'M35 38 l10 3M55 41 l10 -3' },
};

export function Avatar({
  parts,
  size = 64,
  label,
  mood = 'smile',
}: {
  parts: AvatarParts;
  size?: number;
  label?: string;
  mood?: Mood;
}) {
  const face = MOODS[mood];
  const clipId = `${useId()}-head`;
  const skin = pick(SKINS, parts.skin);
  const skinShade = shade(skin, 0.86);
  const outfit = pick(OUTFITS, parts.outfit);
  const { rx, ry } = pick(FACES, parts.face);
  const hairColor = pick(HAIR_COLORS, AVATAR_CONTROLS.hairColor.get(parts));
  const accessory = pick(ACCESSORIES, AVATAR_CONTROLS.accessory.get(parts));
  const hair = hairLayers(pick(HAIR_STYLES, AVATAR_CONTROLS.hair.get(parts)), rx, ry);
  const browColor = shade(hairColor, 0.7);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        <clipPath id={clipId}>
          <ellipse cx="50" cy="46" rx={rx} ry={ry} />
        </clipPath>
      </defs>
      <circle cx="50" cy="50" r="50" fill="#dcefeb" />
      <g fill={hairColor}>{hair.back}</g>
      <path d="M14 100 Q16 74 50 72 Q84 74 86 100z" fill={outfit.body} />
      {outfit.neck === 'v' && <path d="M40 73 L50 84 L60 73z" fill={outfit.collar} />}
      {outfit.neck === 'round' && <path d="M39 73 Q50 86 61 73z" fill={skinShade} />}
      {outfit.neck === 'turtle' ? (
        <rect x="40" y="64" width="20" height="12" rx="5" fill={shade(outfit.body, 0.85)} />
      ) : (
        <rect x="43" y="62" width="14" height="13" rx="5" fill={skinShade} />
      )}
      <ellipse cx={50 - rx} cy="49" rx="4" ry="5" fill={skinShade} />
      <ellipse cx={50 + rx} cy="49" rx="4" ry="5" fill={skinShade} />
      <ellipse cx="50" cy="46" rx={rx} ry={ry} fill={skin} />
      <g clipPath={`url(#${clipId})`}>
        {accessory.beard && (
          <path
            d={`M0 44H${50 - rx + 3}Q${50 - rx + 5} 62 38 59Q50 53 62 59Q${50 + rx - 5} 62 ${50 + rx - 3} 44H100V100H0z`}
            fill={hairColor}
          />
        )}
        <g fill={hairColor}>{hair.front}</g>
      </g>
      <circle cx="40" cy="48" r="3" fill="#24262b" />
      <circle cx="60" cy="48" r="3" fill="#24262b" />
      <path d={face.brows} stroke={browColor} strokeWidth="2.5" fill="none" strokeLinecap="round" />
      <path
        d="M50 49 q-3 6 0 8"
        stroke={skinShade}
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d={accessory.beard && mood === 'smile' ? 'M43 62 q7 4 14 0' : face.mouth}
        stroke={accessory.beard ? '#f3d2c5' : '#7a3b2a'}
        strokeWidth="2.5"
        fill={face.open ? '#7a3b2a' : 'none'}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {accessory.earrings && (
        <g fill="#e3b341">
          <circle cx={50 - rx} cy="57" r="2.6" />
          <circle cx={50 + rx} cy="57" r="2.6" />
          <circle cx={50 - rx} cy="62" r="1.8" />
          <circle cx={50 + rx} cy="62" r="1.8" />
        </g>
      )}
      {accessory.glasses === 'round' && (
        <g fill="none" stroke="#2a2a30" strokeWidth="2">
          <circle cx="40" cy="48" r="7.5" />
          <circle cx="60" cy="48" r="7.5" />
          <path d="M47.5 47h5" />
        </g>
      )}
      {accessory.glasses === 'square' && (
        <g fill="none" stroke="#2a2a30" strokeWidth="2">
          <rect x="32" y="43" width="16" height="11" rx="3" />
          <rect x="52" y="43" width="16" height="11" rx="3" />
          <path d="M48 47h4" />
        </g>
      )}
    </svg>
  );
}

/** Portraits of the named characters: the tutorial, the good news, the challenges. */
export const CHARACTER_AVATARS: Record<string, AvatarParts> = {
  gerard: compose({ face: 2, hair: 4, hairColor: 6, skin: 0, outfit: 4, accessory: 1 }),
  yvon: compose({ face: 1, hair: 0, hairColor: 1, skin: 1, outfit: 1, accessory: 0 }),
  kevin: compose({ face: 3, hair: 6, hairColor: 4, skin: 2, outfit: 7, accessory: 0 }),
  hortense: compose({ face: 1, hair: 2, hairColor: 0, skin: 5, outfit: 4, accessory: 2 }),
  monique: compose({ face: 0, hair: 3, hairColor: 5, skin: 0, outfit: 6, accessory: 6 }),
  martinot: compose({ face: 2, hair: 9, hairColor: 2, skin: 1, outfit: 5, accessory: 3 }),
};

/** Hortense Rigueur never smiles (content/banques.json: « Aucun sourire »). */
const STERN: ReadonlySet<string> = new Set(['hortense']);

/** A character's expression: the stern ones stay neutral when pleased. */
export function characterMood(id: string, mood: Mood): Mood {
  return STERN.has(id) && (mood === 'happy' || mood === 'smile') ? 'neutral' : mood;
}

/** The banker of each bank, and the rivals, among the portraits. */
export const BANK_CHARACTERS: Record<string, string> = {
  tirelire: 'gerard',
  fougueux: 'kevin',
  rigueur: 'hortense',
};
export const RIVAL_CHARACTERS: Record<string, string> = {
  delaporte: 'monique',
  martinot: 'martinot',
};

/**
 * A steady face for someone without a portrait (a tenant): drawn from their
 * name, so the same person always looks the same.
 */
export function faceOf(name: string): AvatarParts {
  let hash = 2166136261;
  for (let i = 0; i < name.length; i++) {
    hash ^= name.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  const next = (count: number) => {
    const value = hash % count;
    hash = Math.floor(hash / count) || Math.imul(hash ^ 0x9e3779b9, 2654435761) >>> 0;
    return value;
  };
  return compose({
    face: next(FACES.length),
    hair: next(HAIR_STYLES.length),
    hairColor: next(HAIR_COLORS.length),
    skin: next(SKINS.length),
    outfit: next(OUTFITS.length),
    accessory: next(ACCESSORIES.length),
  });
}

/** Hair styles long enough to show behind a passer-by's head. */
const LONG_HAIR: ReadonlySet<HairStyle> = new Set(['long', 'bun', 'ponytail', 'bob']);

/** The colours of an avatar, for the player walking down the street (docs/05, 5.5). */
export function avatarLook(parts: AvatarParts): {
  skin: number;
  hair: number;
  top: number;
  longHair: boolean;
} {
  const color = (hex: string) => parseInt(hex.slice(1), 16);
  return {
    skin: color(pick(SKINS, parts.skin)),
    hair: color(pick(HAIR_COLORS, AVATAR_CONTROLS.hairColor.get(parts))),
    top: color(pick(OUTFITS, parts.outfit).body),
    longHair: LONG_HAIR.has(pick(HAIR_STYLES, AVATAR_CONTROLS.hair.get(parts))),
  };
}
