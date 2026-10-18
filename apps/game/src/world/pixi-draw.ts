import { Graphics, Texture } from 'pixi.js';
import type { Shape } from './shapes.ts';

/** Draws shapes into a Graphics, shifted by (dx, dy). */
export function drawShapes(g: Graphics, shapes: readonly Shape[], dx = 0, dy = 0): Graphics {
  for (const shape of shapes) {
    const alpha = shape.alpha ?? 1;
    switch (shape.kind) {
      case 'rect':
        if (shape.radius) g.roundRect(shape.x + dx, shape.y + dy, shape.w, shape.h, shape.radius);
        else g.rect(shape.x + dx, shape.y + dy, shape.w, shape.h);
        break;
      case 'poly':
        g.poly(shape.points.map((value, i) => value + (i % 2 === 0 ? dx : dy)));
        break;
      case 'circle':
        g.circle(shape.x + dx, shape.y + dy, shape.r);
        break;
    }
    if (shape.fill !== undefined) g.fill({ color: shape.fill, alpha });
    if (shape.kind !== 'circle' && shape.stroke !== undefined) {
      g.stroke({ color: shape.stroke, width: shape.strokeWidth ?? 1, alpha });
    }
  }
  return g;
}

/** A soft round glow (white centre fading out), for lamps, headlights and fog. */
export function glowTexture(size = 128, falloff = 0.5): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (context) {
    const gradient = context.createRadialGradient(
      size / 2,
      size / 2,
      0,
      size / 2,
      size / 2,
      size / 2,
    );
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(falloff, 'rgba(255,255,255,0.35)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  }
  return Texture.from(canvas);
}

/** A vertical gradient (top → bottom), for the sky. */
export function gradientTexture(): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 256;
  return Texture.from(canvas);
}

/** Repaints the sky gradient into the texture's canvas. */
export function paintGradient(texture: Texture, top: number, bottom: number): void {
  const canvas = texture.source.resource as HTMLCanvasElement;
  const context = canvas.getContext('2d');
  if (!context) return;
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, `#${top.toString(16).padStart(6, '0')}`);
  gradient.addColorStop(1, `#${bottom.toString(16).padStart(6, '0')}`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  texture.source.update();
}

/** A small deterministic random generator (decoration only: mulberry32). */
export function decorRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A stable number from a string (decoration only). */
export function hashString(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
