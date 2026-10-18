import type { Avatar as AvatarParts } from '@cle/engine';

/**
 * The player's composed avatar (docs/05, section 5.5): face, hair, skin tone
 * and outfit, drawn by code. Each part of the state indexes one of these lists.
 */
const SKINS = ['#f3d2b5', '#e8b98f', '#c98e62', '#a86b45', '#7a4a2c', '#f6dccb'];
const OUTFITS = [
  { body: '#0f6f68', collar: '#fffdf8' },
  { body: '#2f4a7a', collar: '#e8eef8' },
  { body: '#b23d27', collar: '#fbe9e4' },
  { body: '#c9a227', collar: '#4a3b10' },
  { body: '#4b4f58', collar: '#dfe1e6' },
];
const FACES = [
  { rx: 26, ry: 29 },
  { rx: 24, ry: 32 },
  { rx: 28, ry: 27 },
  { rx: 25, ry: 30 },
];
const HAIRS = [
  { color: '#3b2a1e', style: 'short' },
  { color: '#6b4325', style: 'long' },
  { color: '#c8963e', style: 'bun' },
  { color: '#1e1b18', style: 'curly' },
  { color: '#8c8c8c', style: 'side' },
  { color: '#a34a28', style: 'ponytail' },
] as const;

export const AVATAR_PARTS = {
  face: FACES.length,
  hair: HAIRS.length,
  skin: SKINS.length,
  outfit: OUTFITS.length,
} as const;

function pick<T>(list: readonly T[], index: number): T {
  return list[((index % list.length) + list.length) % list.length] as T;
}

function hairShape(style: (typeof HAIRS)[number]['style'], face: { rx: number; ry: number }) {
  const top = 46 - face.ry;
  switch (style) {
    case 'short':
      return (
        <path
          d={`M${50 - face.rx} 46 Q50 ${top - 12} ${50 + face.rx} 46 Q50 ${top + 6} ${50 - face.rx} 46z`}
        />
      );
    case 'long':
      return (
        <path
          d={`M${48 - face.rx} 70 Q${44 - face.rx} ${top - 6} 50 ${top - 6} Q${56 + face.rx} ${top - 6} ${52 + face.rx} 70 L${46 + face.rx} 70 Q${46 + face.rx} ${top + 10} 50 ${top + 8} Q${54 - face.rx} ${top + 10} ${54 - face.rx} 70z`}
        />
      );
    case 'bun':
      return (
        <>
          <circle cx="50" cy={top - 8} r="11" />
          <path
            d={`M${50 - face.rx} 44 Q50 ${top - 8} ${50 + face.rx} 44 Q50 ${top + 8} ${50 - face.rx} 44z`}
          />
        </>
      );
    case 'curly':
      return (
        <>
          {[-22, -11, 0, 11, 22].map((dx) => (
            <circle key={dx} cx={50 + dx} cy={top + 4 + Math.abs(dx) / 3} r="10" />
          ))}
        </>
      );
    case 'side':
      return (
        <path
          d={`M${50 - face.rx} 50 Q${46 - face.rx} ${top - 8} ${54 + face.rx} ${top + 8} L${50 + face.rx} 40 Q50 ${top + 8} ${54 - face.rx} 52z`}
        />
      );
    case 'ponytail':
      return (
        <>
          <path d={`M${52 + face.rx} 36 q14 10 6 34 q-4 -14 -10 -20z`} />
          <path
            d={`M${50 - face.rx} 46 Q50 ${top - 12} ${50 + face.rx} 46 Q50 ${top + 6} ${50 - face.rx} 46z`}
          />
        </>
      );
  }
}

export function Avatar({
  parts,
  size = 64,
  label,
}: {
  parts: AvatarParts;
  size?: number;
  label?: string;
}) {
  const skin = pick(SKINS, parts.skin);
  const outfit = pick(OUTFITS, parts.outfit);
  const face = pick(FACES, parts.face);
  const hair = pick(HAIRS, parts.hair);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <circle cx="50" cy="50" r="50" fill="#dcefeb" />
      <path d="M14 100 Q16 74 50 72 Q84 74 86 100z" fill={outfit.body} />
      <path d="M40 73 L50 84 L60 73z" fill={outfit.collar} />
      <rect x="43" y="62" width="14" height="13" rx="5" fill={skin} />
      <ellipse cx="50" cy="46" rx={face.rx} ry={face.ry} fill={skin} />
      <g fill={hair.color}>{hairShape(hair.style, face)}</g>
      <circle cx="40" cy="48" r="3" fill="#24262b" />
      <circle cx="60" cy="48" r="3" fill="#24262b" />
      <path
        d="M35 40 q5 -3 10 0M55 40 q5 -3 10 0"
        stroke={hair.color}
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
      <path
        d="M42 60 q8 6 16 0"
        stroke="#7a3b2a"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Portraits of the named characters (Gérard, Yvon), for the tutorial. */
export const CHARACTER_AVATARS: Record<string, AvatarParts> = {
  gerard: { face: 2, hair: 4, skin: 0, outfit: 4 },
  yvon: { face: 1, hair: 0, skin: 1, outfit: 1 },
};
