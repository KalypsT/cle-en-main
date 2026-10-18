import type { Season } from '@cle/engine';
import { Graphics } from 'pixi.js';
import { shade } from './facade.ts';
import { foliage } from './light.ts';
import { decorRandom } from './pixi-draw.ts';
import { GROUND_Y, type LaidBuilding, type LaidStreet, ROAD, SIDEWALK } from './street-layout.ts';

/*
 * The street furniture drawn once per street: pavement, road or quay, trees,
 * lamp posts, terraces, the « À vendre » panels, the artisans' vans and the
 * Christmas garlands. Redrawn only when the season, the weather or the
 * buildings change.
 */

const PAVEMENT = 0xd9d0c0;
const KERB = 0xbfb4a2;
const ROAD_COLOR = 0x6f7179;
const WATER = 0x5f8ea0;
const QUAY = 0xc9b48c;
const SNOW = 0xf4f7fb;

export interface DecorOptions {
  season: Season;
  snow: boolean;
  christmas: boolean;
  /** Width of the whole layout (the road runs under every street and crossroad). */
  totalWidth: number;
}

/** The ground of a street: pavement and road, or a quay along the water. */
export function drawGround(
  g: Graphics,
  street: LaidStreet,
  options: DecorOptions,
  extra = 0,
): void {
  const left = street.x - extra;
  const width = street.width + extra * 2;
  g.rect(left, GROUND_Y, width, SIDEWALK).fill(options.snow ? SNOW : PAVEMENT);
  for (let x = left; x < left + width; x += 22) {
    g.rect(x, GROUND_Y + 2, 1, SIDEWALK - 4).fill({ color: KERB, alpha: 0.35 });
  }
  g.rect(left, GROUND_Y + SIDEWALK - 4, width, 4).fill(KERB);
  if (street.street.quay) {
    g.rect(left, GROUND_Y + SIDEWALK, width, 8).fill(QUAY);
    g.rect(left, GROUND_Y + SIDEWALK + 8, width, ROAD + 40).fill(WATER);
    // Railing along the quay.
    g.rect(left, GROUND_Y + SIDEWALK - 12, width, 2).fill(0x3e4448);
    for (let x = left + 4; x < left + width; x += 9) {
      g.rect(x, GROUND_Y + SIDEWALK - 12, 1.5, 10).fill(0x3e4448);
    }
  } else {
    g.rect(left, GROUND_Y + SIDEWALK, width, ROAD).fill(options.snow ? 0x8b8e96 : ROAD_COLOR);
    for (let x = left + 10; x < left + width; x += 46) {
      g.rect(x, GROUND_Y + SIDEWALK + ROAD / 2 - 1.5, 24, 3).fill({ color: 0xe8e4da, alpha: 0.8 });
    }
    // Far pavement, with planters.
    g.rect(left, GROUND_Y + SIDEWALK + ROAD, width, 40).fill(
      options.snow ? SNOW : shade(PAVEMENT, -0.06),
    );
  }
}

/** A crossroad between two streets: the road goes on, the pavement turns. */
export function drawCrossroad(
  g: Graphics,
  x: number,
  width: number,
  quay: boolean,
  snow: boolean,
): void {
  g.rect(x, GROUND_Y - 8, width, SIDEWALK + 8).fill(snow ? SNOW : shade(PAVEMENT, -0.04));
  if (!quay) {
    g.rect(x, GROUND_Y + SIDEWALK, width, ROAD).fill(snow ? 0x8b8e96 : ROAD_COLOR);
    for (let i = 0; i < 6; i++) {
      g.rect(x + 18 + i * 11, GROUND_Y + SIDEWALK + 4, 6, ROAD - 8).fill({
        color: 0xf1ede4,
        alpha: 0.85,
      });
    }
    g.rect(x, GROUND_Y + SIDEWALK + ROAD, width, 40).fill(snow ? SNOW : shade(PAVEMENT, -0.06));
  } else {
    g.rect(x, GROUND_Y + SIDEWALK, width, ROAD + 40).fill(WATER);
  }
}

export function drawTree(
  g: Graphics,
  x: number,
  season: Season,
  seed: number,
  snow: boolean,
): void {
  const random = decorRandom(seed);
  const height = 70 + random() * 30;
  const { colors, bare, blossom } = foliage(season);
  g.rect(x - 3, GROUND_Y - height * 0.55, 6, height * 0.55 + 2).fill(0x7a5c45);
  g.ellipse(x, GROUND_Y + 2, 10, 3).fill({ color: 0x000000, alpha: 0.12 });
  if (bare) {
    for (let i = 0; i < 5; i++) {
      const angle = -Math.PI / 2 + (random() - 0.5) * 1.6;
      const length = 22 + random() * 18;
      const y = GROUND_Y - height * (0.45 + random() * 0.15);
      g.moveTo(x, y)
        .lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length)
        .stroke({ color: 0x6a5040, width: 2 });
    }
    if (snow) g.ellipse(x, GROUND_Y - height * 0.72, 18, 4).fill(SNOW);
    return;
  }
  const crownY = GROUND_Y - height * 0.72;
  for (let i = 0; i < 6; i++) {
    const color = colors[Math.floor(random() * colors.length)] ?? 0x6aab58;
    g.circle(x + (random() - 0.5) * 30, crownY + (random() - 0.5) * 26, 14 + random() * 8).fill(
      color,
    );
  }
  if (blossom) {
    for (let i = 0; i < 14; i++) {
      g.circle(x + (random() - 0.5) * 40, crownY + (random() - 0.5) * 34, 1.8).fill(0xf6c6d6);
    }
  }
  if (snow) g.ellipse(x, crownY - 16, 20, 5).fill(SNOW);
}

/** A lamp post; its glow is drawn by the light layer. */
export function drawLamp(g: Graphics, x: number, christmas: boolean): void {
  const top = GROUND_Y - 68;
  g.rect(x - 1.5, top, 3, 68 + SIDEWALK - 8).fill(0x2f3338);
  g.rect(x - 6, top - 2, 12, 3).fill(0x2f3338);
  g.poly([x - 5, top - 2, x + 5, top - 2, x + 3.5, top - 12, x - 3.5, top - 12]).fill(0xf0e2b0);
  g.rect(x - 4.5, top - 14, 9, 2.5).fill(0x2f3338);
  if (christmas) {
    // A star on the post.
    const cy = top - 22;
    const points: number[] = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 6 : 2.6;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      points.push(x + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    g.poly(points).fill(0xf6d36b);
  }
}

/** Café tables in front of a shop (summer days). */
export function drawTerrace(g: Graphics, laid: LaidBuilding, awning: number): void {
  const x = laid.x + laid.spec.width / 2;
  for (const dx of [-26, 18]) {
    const tx = x + dx;
    g.rect(tx - 7, GROUND_Y + 8, 14, 2).fill(0x5a4a3c);
    g.rect(tx - 1, GROUND_Y + 10, 2, 8).fill(0x5a4a3c);
    g.rect(tx - 13, GROUND_Y + 11, 4, 7).fill(0x8a6a4a);
    g.rect(tx + 9, GROUND_Y + 11, 4, 7).fill(0x8a6a4a);
    g.rect(tx - 0.5, GROUND_Y - 20, 1, 28).fill(0x5a4a3c);
    g.poly([tx - 15, GROUND_Y - 14, tx, GROUND_Y - 24, tx + 15, GROUND_Y - 14]).fill(awning);
  }
}

/** The agency's « À vendre » panel on the façade, with its text drawn by the caller. */
export function forSalePanel(g: Graphics, x: number, y: number): void {
  g.rect(x - 1, y - 6, 1.5, 6).fill(0x3e4448);
  g.rect(x + 37, y - 6, 1.5, 6).fill(0x3e4448);
  g.roundRect(x - 3, y, 44, 16, 2)
    .fill(0xfffdf8)
    .stroke({ color: 0xb23d27, width: 2 });
}

/** An artisan's van parked in front of works. */
export function drawVan(g: Graphics, x: number, color: number): void {
  const y = GROUND_Y + SIDEWALK + 6;
  g.roundRect(x, y, 58, 22, 3).fill(0xf2f2ee);
  g.rect(x, y + 12, 58, 4).fill(color);
  g.poly([x + 58, y + 6, x + 70, y + 10, x + 72, y + 22, x + 58, y + 22]).fill(0xf2f2ee);
  g.poly([x + 60, y + 8, x + 68, y + 11, x + 69, y + 15, x + 60, y + 15]).fill(0x9fb7c6);
  g.circle(x + 14, y + 23, 5).fill(0x2b2d31);
  g.circle(x + 56, y + 23, 5).fill(0x2b2d31);
  g.circle(x + 14, y + 23, 2).fill(0x9a9da3);
  g.circle(x + 56, y + 23, 2).fill(0x9a9da3);
}

/** Planters on the far pavement. */
export function drawPlanter(g: Graphics, x: number, season: Season): void {
  const y = GROUND_Y + SIDEWALK + ROAD + 12;
  g.roundRect(x - 9, y, 18, 14, 2).fill(0xb06a50);
  if (season === 'winter') {
    g.circle(x, y - 3, 6).fill(0x4f6f4a);
  } else {
    const { colors } = foliage(season === 'autumn' ? 'autumn' : 'summer');
    g.circle(x - 5, y - 2, 6).fill(colors[0] ?? 0x5f9e4f);
    g.circle(x + 5, y - 2, 6).fill(colors[1] ?? 0x5f9e4f);
    g.circle(x, y - 7, 6).fill(colors[2] ?? 0x5f9e4f);
    if (season === 'spring') {
      g.circle(x - 3, y - 6, 2).fill(0xe35d6a);
      g.circle(x + 4, y - 3, 2).fill(0xf2c14e);
    }
  }
}

/**
 * Silhouette of the town behind the street, with the Collégiale's bell tower
 * for the historic centre of Dole.
 */
export function drawSkyline(g: Graphics, width: number, seed: number, steeple: boolean): void {
  const random = decorRandom(seed);
  const color = 0x8d8fae;
  let x = -40;
  while (x < width + 40) {
    const w = 40 + random() * 60;
    const h = 60 + random() * 90;
    g.rect(x, GROUND_Y - h, w, h).fill({ color, alpha: 0.55 });
    if (random() < 0.4)
      g.poly([x, GROUND_Y - h, x + w / 2, GROUND_Y - h - 22, x + w, GROUND_Y - h]).fill({
        color,
        alpha: 0.55,
      });
    x += w - 4;
  }
  if (steeple) {
    const sx = width * 0.55;
    g.rect(sx, GROUND_Y - 250, 34, 250).fill({ color: 0x7c7ea0, alpha: 0.75 });
    g.rect(sx - 4, GROUND_Y - 254, 42, 6).fill({ color: 0x7c7ea0, alpha: 0.75 });
    g.rect(sx + 5, GROUND_Y - 290, 24, 38).fill({ color: 0x7c7ea0, alpha: 0.75 });
    g.poly([sx + 3, GROUND_Y - 290, sx + 17, GROUND_Y - 322, sx + 31, GROUND_Y - 290]).fill({
      color: 0x7c7ea0,
      alpha: 0.75,
    });
    g.rect(sx + 13, GROUND_Y - 232, 8, 14).fill({ color: 0x5f6182, alpha: 0.75 });
  }
}

export const GARLAND_COLORS = [0xf6d36b, 0xe35d6a, 0x6fc3b8, 0xf2f2f2];
