import { Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { shade } from './facade.ts';

/*
 * The small life of the street (docs/05, 5.6): smoke from the chimneys, dust
 * from the works, pigeons on the pavement and cats on the window sills.
 * Decoration only.
 */

interface Puff {
  sprite: Sprite;
  age: number;
  life: number;
  vx: number;
  vy: number;
  from: number;
  to: number;
  alpha: number;
}

export type PuffKind = 'smoke' | 'dust';

/** Soft puffs that rise, grow and fade: smoke, or dust at the foot of the works. */
export class Puffs {
  readonly view = new Container();
  private puffs: Puff[] = [];
  private spare: Sprite[] = [];

  constructor(
    private readonly texture: Texture,
    private readonly max = 90,
  ) {}

  emit(kind: PuffKind, x: number, y: number, random: () => number): void {
    if (this.puffs.length >= this.max) return;
    const sprite = this.spare.pop() ?? new Sprite(this.texture);
    sprite.anchor.set(0.5);
    sprite.visible = true;
    sprite.position.set(x, y);
    const smoke = kind === 'smoke';
    sprite.tint = smoke ? 0xc4c9d1 : 0xcdb894;
    this.view.addChild(sprite);
    this.puffs.push({
      sprite,
      age: 0,
      life: smoke ? 3.5 + random() * 1.5 : 1.2 + random() * 0.8,
      // The wind takes the smoke a little sideways.
      vx: smoke ? -4 - random() * 4 : (random() - 0.5) * 14,
      vy: smoke ? -9 - random() * 4 : -4 - random() * 4,
      from: smoke ? 5 : 4,
      to: smoke ? 22 + random() * 10 : 12,
      alpha: smoke ? 0.95 : 0.5,
    });
  }

  update(dt: number): void {
    this.puffs = this.puffs.filter((puff) => {
      puff.age += dt;
      const t = puff.age / puff.life;
      const { sprite } = puff;
      if (t >= 1) {
        sprite.visible = false;
        this.view.removeChild(sprite);
        this.spare.push(sprite);
        return false;
      }
      sprite.x += puff.vx * dt;
      sprite.y += puff.vy * dt;
      const size = puff.from + (puff.to - puff.from) * t;
      sprite.width = size;
      sprite.height = size;
      sprite.alpha = puff.alpha * Math.min(1, t * 5) * Math.sqrt(1 - t);
      return true;
    });
  }

  clear(): void {
    for (const puff of this.puffs) puff.sprite.destroy();
    for (const sprite of this.spare) sprite.destroy();
    this.puffs = [];
    this.spare = [];
    this.view.removeChildren();
  }
}

export interface Pigeon {
  view: Container;
  x: number;
  y: number;
  /** Landing (coming down), pecking on the pavement, hopping aside, or flying away. */
  state: 'landing' | 'pecking' | 'hopping' | 'flying';
  update(dt: number, still: boolean): void;
  /** Somebody comes too close: away it flies. */
  scare(away: 1 | -1): void;
  /** Leaves the street for good. */
  leave(away: 1 | -1): void;
}

/** A pigeon that lands on the pavement, pecks around, and flies off when people come near. */
export function createPigeon(
  random: () => number,
  x: number,
  ground: number,
  from: number,
): Pigeon {
  const view = new Container();
  const feather = random() < 0.2 ? 0xb8b2a8 : 0x8a8f9a;
  const body = new Graphics()
    .ellipse(0, -3.5, 4.2, 2.6)
    .fill(feather)
    .poly([-3.5, -4, -7, -3, -3.5, -2.2])
    .fill(0x5f646e)
    .moveTo(-0.5, 0)
    .lineTo(-0.5, -1.5)
    .moveTo(1, 0)
    .lineTo(1, -1.5)
    .stroke({ color: 0xc96a5a, width: 0.7 });
  const head = new Container();
  head.addChild(
    new Graphics()
      .rect(-0.9, -1.6, 1.8, 2.6)
      .fill(0x5f8a7a)
      .circle(0, -2.4, 1.6)
      .fill(0x6a6f7a)
      .circle(0.6, -2.7, 0.35)
      .fill(0xd9a03a)
      .poly([1.4, -2.6, 2.6, -2.2, 1.4, -1.9])
      .fill(0x3b3f46),
  );
  head.position.set(3, -5);
  const wings = new Graphics()
    .poly([-2, -4, 2, -4, -1, -11])
    .fill(shade(feather, -0.2))
    .poly([-2, -4, 2, -4, 3, -10])
    .fill(feather);
  wings.visible = false;
  view.addChild(body, head, wings);
  view.scale.x = random() < 0.5 ? 1 : -1;
  let phase = random() * 6;
  let vx = 0;
  let vy = 0;
  let scares = 0;
  const pigeon: Pigeon = {
    view,
    x,
    y: from,
    state: 'landing',
    update(dt, still) {
      phase += dt;
      if (pigeon.state === 'landing') {
        wings.visible = true;
        wings.scale.y = 0.4 + Math.abs(Math.sin(phase * 14));
        pigeon.y = Math.min(ground, pigeon.y + 90 * dt);
        if (pigeon.y >= ground) {
          pigeon.state = 'pecking';
          wings.visible = false;
        }
      } else if (pigeon.state === 'pecking') {
        if (!still) {
          // Head down to the ground and up again, a little step now and then.
          const peck = Math.max(0, Math.sin(phase * 3.2));
          head.position.set(3 + peck * 1.2, -5 + peck * 3.5);
          if (random() < dt * 0.4) pigeon.x += view.scale.x * 2;
          if (random() < dt * 0.15) view.scale.x = -view.scale.x;
        }
      } else if (pigeon.state === 'hopping') {
        // A short flight aside, then down on the pavement again.
        wings.visible = true;
        wings.scale.y = 0.4 + Math.abs(Math.sin(phase * 16));
        pigeon.x += vx * dt;
        pigeon.y = Math.min(ground, pigeon.y + vy * dt);
        vy += 130 * dt;
        if (pigeon.y >= ground && vy > 0) {
          pigeon.state = 'pecking';
          wings.visible = false;
        }
      } else {
        wings.visible = true;
        wings.scale.y = 0.4 + Math.abs(Math.sin(phase * 16));
        pigeon.x += vx * dt;
        pigeon.y += vy * dt;
        vy -= 20 * dt;
      }
      view.position.set(pigeon.x, pigeon.y);
    },
    scare(away) {
      if (pigeon.state !== 'pecking') return;
      view.scale.x = away;
      // Twice it lands a little further; the third time it leaves the street.
      if (++scares < 3) {
        pigeon.state = 'hopping';
        vx = away * (45 + random() * 25);
        vy = -55 - random() * 15;
      } else {
        pigeon.leave(away);
      }
    },
    leave(away) {
      pigeon.state = 'flying';
      view.scale.x = away;
      vx = away * (50 + random() * 30);
      vy = -50 - random() * 30;
    },
  };
  return pigeon;
}

/** A cat sitting on a sill, its tail hanging down; returns the tail, to swish it. */
export function drawCat(parent: Container, x: number, y: number, color: number): Graphics {
  const cat = new Graphics()
    .ellipse(0, -3.5, 3.6, 3.8)
    .fill(color)
    .circle(1.2, -8.5, 2.6)
    .fill(color)
    .poly([-0.6, -10, -0.2, -12.6, 1.2, -10.6])
    .fill(color)
    .poly([1.6, -10.6, 3, -12.6, 3.4, -10])
    .fill(color)
    .circle(2.4, -8.8, 0.45)
    .fill(color === 0x2b2522 ? 0xd9c040 : 0x2b2522);
  cat.position.set(x, y);
  const tail = new Graphics().roundRect(-0.7, 0, 1.4, 7, 0.7).fill(color);
  tail.position.set(x - 2.6, y - 1);
  parent.addChild(tail, cat);
  return tail;
}
