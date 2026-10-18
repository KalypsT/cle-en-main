import { type FacadeSpec, shade, type WindowSpec } from './facade.ts';

/*
 * A façade as a list of simple shapes (rectangles, polygons, circles), so
 * that the SVG of the sheets and the PixiJS street draw exactly the same
 * building. Coordinates: origin at the bottom left of the façade, y upwards
 * is negative. Window panes are not included: each renderer lights them.
 */

export type Shape =
  | {
      kind: 'rect';
      x: number;
      y: number;
      w: number;
      h: number;
      fill?: number;
      stroke?: number;
      strokeWidth?: number;
      radius?: number;
      alpha?: number;
    }
  | {
      kind: 'poly';
      points: number[];
      fill?: number;
      stroke?: number;
      strokeWidth?: number;
      alpha?: number;
    }
  | { kind: 'circle'; x: number; y: number; r: number; fill?: number; alpha?: number };

export interface ShapeOptions {
  /** The player's colour: door, shutters and frame of the highlighted floor. */
  accent: number | null;
  highlightFloor: number | null;
  scaffolding: boolean;
  tarp: boolean;
  /** Snow on the roofs and ledges. */
  snow: boolean;
  /** Spring flowers in the window boxes. */
  flowers: boolean;
}

export interface FacadeShapes {
  /** Roof, walls, details and window frames. */
  base: Shape[];
  /** Shutters, balconies, flower boxes, scaffolding: drawn over the panes. */
  front: Shape[];
}

const SNOW = 0xf7f9fc;

function windowFrame(spec: FacadeSpec, win: WindowSpec, accent: number | null): Shape[] {
  const frame = accent ?? spec.frame;
  const shapes: Shape[] = [];
  if (spec.windowShape === 'arched') {
    shapes.push({
      kind: 'circle',
      x: win.x + win.w / 2,
      y: win.y + 1,
      r: win.w / 2 + 2,
      fill: frame,
    });
  }
  shapes.push({
    kind: 'rect',
    x: win.x - 2,
    y: win.y - 2,
    w: win.w + 4,
    h: win.h + 4,
    fill: frame,
    radius: 1,
  });
  // Stone sill.
  shapes.push({
    kind: 'rect',
    x: win.x - 3,
    y: win.y + win.h + 1,
    w: win.w + 6,
    h: 3,
    fill: shade(spec.wall, -0.18),
  });
  if (spec.rollerShutters) {
    shapes.push({
      kind: 'rect',
      x: win.x - 2,
      y: win.y - 6,
      w: win.w + 4,
      h: 4,
      fill: shade(spec.wall, -0.1),
    });
  }
  return shapes;
}

/** The arch of an arched window's pane (its top half circle), drawn with the pane. */
export function paneShapes(spec: FacadeSpec, win: WindowSpec, fill: number): Shape[] {
  const shapes: Shape[] = [{ kind: 'rect', x: win.x, y: win.y, w: win.w, h: win.h, fill }];
  if (spec.windowShape === 'arched') {
    shapes.push({ kind: 'circle', x: win.x + win.w / 2, y: win.y + 1, r: win.w / 2, fill });
  }
  return shapes;
}

/** Window bars drawn over a pane (a cross for old windows). */
export function barShapes(spec: FacadeSpec, win: WindowSpec, color: number): Shape[] {
  const shapes: Shape[] = [
    { kind: 'rect', x: win.x + win.w / 2 - 0.75, y: win.y, w: 1.5, h: win.h, fill: color },
  ];
  if (spec.windowShape === 'tall' || spec.windowShape === 'arched') {
    shapes.push({ kind: 'rect', x: win.x, y: win.y + win.h * 0.38, w: win.w, h: 1.2, fill: color });
  }
  return shapes;
}

function roofShapes(spec: FacadeSpec, options: ShapeOptions): Shape[] {
  const { width, wallHeight, roof } = spec;
  const top = -wallHeight;
  const shapes: Shape[] = [];
  const overhang = 5;
  switch (roof.shape) {
    case 'gable':
      shapes.push({
        kind: 'poly',
        points: [-overhang, top + 1, width / 2, top - roof.height, width + overhang, top + 1],
        fill: roof.color,
      });
      if (options.snow) {
        shapes.push({
          kind: 'poly',
          points: [
            width * 0.12,
            top - roof.height * 0.76,
            width / 2,
            top - roof.height - 2,
            width * 0.88,
            top - roof.height * 0.76,
            width / 2,
            top - roof.height + 5,
          ],
          fill: SNOW,
        });
      }
      break;
    case 'hip':
      shapes.push({
        kind: 'poly',
        points: [
          -overhang,
          top + 1,
          width * 0.22,
          top - roof.height,
          width * 0.78,
          top - roof.height,
          width + overhang,
          top + 1,
        ],
        fill: roof.color,
      });
      if (options.snow) {
        shapes.push({
          kind: 'rect',
          x: width * 0.22,
          y: top - roof.height - 2,
          w: width * 0.56,
          h: 5,
          fill: SNOW,
          radius: 2,
        });
      }
      break;
    case 'mansard':
      shapes.push({
        kind: 'poly',
        points: [
          -3,
          top + 1,
          6,
          top - roof.height * 0.75,
          width - 6,
          top - roof.height * 0.75,
          width + 3,
          top + 1,
        ],
        fill: roof.color,
      });
      shapes.push({
        kind: 'poly',
        points: [
          6,
          top - roof.height * 0.75,
          14,
          top - roof.height,
          width - 14,
          top - roof.height,
          width - 6,
          top - roof.height * 0.75,
        ],
        fill: shade(roof.color, -0.15),
      });
      if (options.snow) {
        shapes.push({
          kind: 'rect',
          x: 12,
          y: top - roof.height - 2,
          w: width - 24,
          h: 5,
          fill: SNOW,
          radius: 2,
        });
      }
      break;
    case 'flat':
      shapes.push({
        kind: 'rect',
        x: -3,
        y: top - roof.height,
        w: width + 6,
        h: roof.height,
        fill: roof.color,
        radius: 1,
      });
      if (options.snow) {
        shapes.push({
          kind: 'rect',
          x: -3,
          y: top - roof.height - 3,
          w: width + 6,
          h: 4,
          fill: SNOW,
          radius: 2,
        });
      }
      break;
  }
  if (roof.dormers) {
    const count = Math.max(1, Math.floor(width / 45));
    for (let i = 0; i < count; i++) {
      const x = (width / (count + 1)) * (i + 1) - 7;
      const y = top - roof.height * 0.62;
      shapes.push({
        kind: 'poly',
        points: [x - 2, y, x + 7, y - 9, x + 16, y],
        fill: shade(roof.color, -0.2),
      });
      shapes.push({ kind: 'rect', x, y, w: 14, h: 14, fill: spec.trim });
      shapes.push({ kind: 'rect', x: x + 3, y: y + 3, w: 8, h: 9, fill: 0x5d6b78 });
    }
  }
  if (spec.chimney) {
    const x = spec.chimney.x;
    const height = roof.shape === 'flat' ? 14 : roof.height * 0.8;
    shapes.push({
      kind: 'rect',
      x,
      y: top - height - 4,
      w: 9,
      h: height,
      fill: shade(spec.wall, -0.25),
    });
    shapes.push({
      kind: 'rect',
      x: x - 1,
      y: top - height - 6,
      w: 11,
      h: 3,
      fill: shade(spec.wall, -0.35),
    });
  }
  if (spec.solar) {
    shapes.push({
      kind: 'poly',
      points: [
        width * 0.56,
        top - roof.height * 0.1,
        width * 0.6,
        top - roof.height * 0.55,
        width * 0.86,
        top - roof.height * 0.12 - 2,
        width * 0.84,
        top + 1,
      ],
      fill: 0x2c3e5c,
    });
  }
  return shapes;
}

export function facadeShapes(spec: FacadeSpec, options: ShapeOptions): FacadeShapes {
  const { width, wallHeight, groundHeight, floorHeight } = spec;
  const base: Shape[] = [];
  const front: Shape[] = [];
  base.push(...roofShapes(spec, options));
  base.push({ kind: 'rect', x: 0, y: -wallHeight, w: width, h: wallHeight, fill: spec.wall });

  if (spec.stoneCourses) {
    // Stone corners (quoins), alternating long and short blocks.
    for (let y = -wallHeight, i = 0; y < 0; y += 9, i++) {
      const w = i % 2 === 0 ? 9 : 6;
      base.push({ kind: 'rect', x: 0, y, w, h: 8, fill: shade(spec.wall, 0.12) });
      base.push({ kind: 'rect', x: width - w, y, w, h: 8, fill: shade(spec.wall, 0.12) });
    }
  }
  // Band between the ground floor and the floors above.
  if (spec.floors > 1) {
    base.push({ kind: 'rect', x: 0, y: -groundHeight - 2, w: width, h: 3, fill: spec.trim });
  }
  if (spec.cornice) {
    base.push({ kind: 'rect', x: -2, y: -wallHeight - 1, w: width + 4, h: 4, fill: spec.trim });
  }
  // Wear: damp stains under the windows and a crack.
  if (spec.wear > 0.15) {
    const alpha = 0.12 + spec.wear * 0.25;
    for (const win of spec.windows.filter((_, i) => i % 3 === 0)) {
      base.push({
        kind: 'rect',
        x: win.x + 2,
        y: win.y + win.h + 4,
        w: win.w - 4,
        h: 8 + spec.wear * 10,
        fill: 0x6b5a45,
        alpha,
        radius: 3,
      });
    }
    if (spec.wear > 0.5) {
      const x = width * 0.7;
      base.push({
        kind: 'poly',
        points: [
          x,
          -wallHeight + 6,
          x + 4,
          -wallHeight + 22,
          x - 2,
          -wallHeight + 34,
          x + 3,
          -wallHeight + 48,
          x + 1.5,
          -wallHeight + 48,
          x - 3.5,
          -wallHeight + 34,
          x + 2.5,
          -wallHeight + 22,
          x - 1.5,
          -wallHeight + 6,
        ],
        fill: 0x5a4a3a,
        alpha: 0.5,
      });
    }
  }

  const accent = options.accent;
  for (const win of spec.windows) {
    const mine = accent !== null && options.highlightFloor === win.floor;
    base.push(...windowFrame(spec, win, mine ? accent : null));
    if (spec.shutters !== null) {
      const color = mine && accent !== null ? accent : spec.shutters;
      const w = Math.round(win.w * 0.5);
      front.push({ kind: 'rect', x: win.x - w - 3, y: win.y - 1, w, h: win.h + 2, fill: color });
      front.push({
        kind: 'rect',
        x: win.x + win.w + 3,
        y: win.y - 1,
        w,
        h: win.h + 2,
        fill: color,
      });
      front.push({
        kind: 'rect',
        x: win.x - w - 3,
        y: win.y + win.h * 0.3,
        w,
        h: 1.2,
        fill: shade(color, -0.2),
      });
      front.push({
        kind: 'rect',
        x: win.x + win.w + 3,
        y: win.y + win.h * 0.3,
        w,
        h: 1.2,
        fill: shade(color, -0.2),
      });
    }
    if (spec.flowerBoxes && win.floor > 0 && !spec.balconies.includes(win.floor)) {
      front.push({
        kind: 'rect',
        x: win.x - 1,
        y: win.y + win.h + 2,
        w: win.w + 2,
        h: 4,
        fill: 0x8a5a3c,
      });
      if (options.flowers) {
        for (let i = 0; i < 4; i++) {
          front.push({
            kind: 'circle',
            x: win.x + 2 + (i * (win.w - 2)) / 3,
            y: win.y + win.h + 1,
            r: 2,
            fill: i % 2 ? 0xe35d6a : 0xf2c14e,
          });
        }
      } else {
        front.push({ kind: 'rect', x: win.x, y: win.y + win.h, w: win.w, h: 2, fill: 0x6f8f5a });
      }
    }
  }

  for (const floor of spec.balconies) {
    const y = -(groundHeight + (floor - 1) * floorHeight) - 4;
    front.push({ kind: 'rect', x: 4, y: y - 11, w: width - 8, h: 2, fill: spec.balconyColor });
    front.push({ kind: 'rect', x: 4, y: y, w: width - 8, h: 3, fill: shade(spec.wall, -0.25) });
    for (let x = 6; x < width - 6; x += 5) {
      front.push({ kind: 'rect', x, y: y - 10, w: 1, h: 10, fill: spec.balconyColor });
    }
    if (options.snow)
      front.push({ kind: 'rect', x: 4, y: y - 13, w: width - 8, h: 2.5, fill: SNOW });
  }

  // Door.
  const { door } = spec;
  const doorColor = accent ?? door.color;
  if (door.arched) {
    base.push({
      kind: 'circle',
      x: door.x + door.w / 2,
      y: -door.h + door.w / 2,
      r: door.w / 2 + 2,
      fill: spec.trim,
    });
    base.push({
      kind: 'circle',
      x: door.x + door.w / 2,
      y: -door.h + door.w / 2,
      r: door.w / 2,
      fill: doorColor,
    });
  }
  base.push({
    kind: 'rect',
    x: door.x,
    y: -door.h + (door.arched ? door.w / 2 : 0),
    w: door.w,
    h: door.h - (door.arched ? door.w / 2 : 0),
    fill: doorColor,
  });
  base.push({ kind: 'circle', x: door.x + door.w - 4, y: -door.h / 2, r: 1.2, fill: 0xe0c070 });
  if (spec.garage) {
    base.push({ kind: 'rect', x: spec.garage.x, y: -24, w: spec.garage.w, h: 24, fill: 0xd8d6d0 });
    for (let y = -22; y < 0; y += 5) {
      base.push({ kind: 'rect', x: spec.garage.x, y, w: spec.garage.w, h: 1, fill: 0xb8b6b0 });
    }
  }

  if (spec.shop) {
    const shopTop = -groundHeight + 4;
    base.push({
      kind: 'rect',
      x: 6,
      y: shopTop + 12,
      w: width - 12,
      h: groundHeight - 18,
      fill: 0x2f3a40,
    });
    base.push({
      kind: 'rect',
      x: 9,
      y: shopTop + 15,
      w: width / 2 - 14,
      h: groundHeight - 24,
      fill: 0xbfd5dc,
    });
    base.push({
      kind: 'rect',
      x: width / 2 + 5,
      y: shopTop + 15,
      w: width / 2 - 14,
      h: groundHeight - 24,
      fill: 0xbfd5dc,
    });
    base.push({
      kind: 'rect',
      x: 4,
      y: shopTop - 2,
      w: width - 8,
      h: 12,
      fill: spec.shop.awning,
      radius: 2,
    });
    // Awning (drawn in front so the passers-by walk under it).
    const awningY = shopTop + 10;
    const stripe = shade(spec.shop.awning, 0.55);
    front.push({
      kind: 'poly',
      points: [4, awningY, width - 4, awningY, width, awningY + 9, 0, awningY + 9],
      fill: spec.shop.awning,
    });
    if (spec.shop.stripes) {
      for (let x = 4; x < width - 8; x += 12) {
        front.push({
          kind: 'poly',
          points: [x, awningY, x + 6, awningY, x + 6.5, awningY + 9, x + 0.5, awningY + 9],
          fill: stripe,
        });
      }
    }
  }

  if (accent !== null && options.highlightFloor === null) {
    // A house or a whole building: a band of the player's colour under the roof.
    base.push({ kind: 'rect', x: 0, y: -wallHeight, w: width, h: 4, fill: accent });
  }

  if (options.scaffolding) {
    const color = 0x8d96a0;
    const top = -wallHeight - 6;
    for (let x = -4; x <= width + 4; x += Math.max(24, width / 4)) {
      front.push({ kind: 'rect', x, y: top, w: 2, h: wallHeight + 6, fill: color });
    }
    front.push({ kind: 'rect', x: width + 2, y: top, w: 2, h: wallHeight + 6, fill: color });
    for (let floor = 1; floor <= spec.floors; floor++) {
      const y = -(groundHeight + (floor - 1) * floorHeight) - 2;
      front.push({ kind: 'rect', x: -6, y, w: width + 12, h: 3, fill: 0xb98a4a });
      front.push({
        kind: 'poly',
        points: [-4, y, -2, y, width + 4, y - floorHeight + 4, width + 2, y - floorHeight + 4],
        fill: color,
        alpha: 0.7,
      });
    }
    if (options.tarp) {
      front.push({
        kind: 'rect',
        x: -6,
        y: top - spec.roof.height,
        w: width + 12,
        h: spec.roof.height + 6,
        fill: 0x3f78a8,
        alpha: 0.85,
        radius: 3,
      });
    }
  }
  return { base, front };
}
