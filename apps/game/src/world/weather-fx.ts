import type { Season, Weather } from '@cle/engine';
import { Container, Sprite, Texture } from 'pixi.js';

/*
 * Weather and seasonal particles drawn over the street, in screen space:
 * rain, snow, fog banks, falling leaves. Their number follows the graphics
 * quality (fewer on slow phones).
 */

interface Particle {
  sprite: Sprite;
  vx: number;
  vy: number;
  spin: number;
  phase: number;
}

export class WeatherLayer {
  readonly view = new Container();
  private particles: Particle[] = [];
  private fog: Sprite[] = [];
  private kind: 'rain' | 'snow' | 'leaves' | 'none' = 'none';
  private width = 1;
  private height = 1;

  constructor(private readonly glow: Texture) {}

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /** Sets the particles for the weather and season; `amount` 0 … 1 (graphics quality). */
  configure(weather: Weather, season: Season, amount: number, random: () => number): void {
    const kind =
      weather === 'rain'
        ? 'rain'
        : weather === 'snow'
          ? 'snow'
          : season === 'autumn' && weather !== 'fog'
            ? 'leaves'
            : 'none';
    const count = Math.round(
      (kind === 'rain' ? 140 : kind === 'snow' ? 110 : kind === 'leaves' ? 14 : 0) * amount,
    );
    if (kind !== this.kind || count !== this.particles.length) {
      for (const particle of this.particles) particle.sprite.destroy();
      this.particles = [];
      this.kind = kind;
      for (let i = 0; i < count; i++) this.particles.push(this.makeParticle(random, true));
    }
    const fogCount = weather === 'fog' ? Math.max(2, Math.round(5 * amount)) : 0;
    if (fogCount !== this.fog.length) {
      for (const sprite of this.fog) sprite.destroy();
      this.fog = [];
      for (let i = 0; i < fogCount; i++) {
        const sprite = new Sprite(this.glow);
        sprite.anchor.set(0.5);
        sprite.tint = 0xe9edf0;
        sprite.alpha = 0.55;
        sprite.width = this.width * (0.9 + random() * 0.6);
        sprite.height = this.height * 0.4;
        sprite.position.set(random() * this.width, this.height * (0.55 + random() * 0.4));
        this.view.addChild(sprite);
        this.fog.push(sprite);
      }
    }
  }

  private makeParticle(random: () => number, anywhere: boolean): Particle {
    const sprite = new Sprite(Texture.WHITE);
    const particle: Particle = { sprite, vx: 0, vy: 0, spin: 0, phase: random() * 6 };
    switch (this.kind) {
      case 'rain':
        sprite.width = 1.2;
        sprite.height = 11 + random() * 6;
        sprite.tint = 0xc8d8e6;
        sprite.alpha = 0.55;
        sprite.rotation = 0.18;
        particle.vx = -90;
        particle.vy = 520 + random() * 160;
        break;
      case 'snow': {
        const size = 2 + random() * 2.5;
        sprite.texture = this.glow;
        sprite.width = size * 2;
        sprite.height = size * 2;
        sprite.alpha = 0.9;
        particle.vx = -10 + random() * 20;
        particle.vy = 25 + random() * 30;
        break;
      }
      case 'leaves':
        sprite.width = 5;
        sprite.height = 3;
        sprite.tint = [0xd9822b, 0xc9562c, 0xe0a83a][Math.floor(random() * 3)] ?? 0xd9822b;
        particle.vx = -25 + random() * 15;
        particle.vy = 22 + random() * 18;
        particle.spin = 2 + random() * 3;
        break;
      case 'none':
        break;
    }
    sprite.anchor.set(0.5);
    sprite.position.set(random() * this.width, anywhere ? random() * this.height : -10);
    this.view.addChild(sprite);
    return particle;
  }

  update(dt: number, cameraDx: number): void {
    for (const particle of this.particles) {
      const { sprite } = particle;
      particle.phase += dt;
      sprite.x += particle.vx * dt - cameraDx;
      sprite.y += particle.vy * dt;
      if (this.kind === 'snow') sprite.x += Math.sin(particle.phase * 1.5) * 0.3;
      if (this.kind === 'leaves') {
        sprite.rotation += particle.spin * dt;
        sprite.x += Math.sin(particle.phase * 2) * 0.6;
      }
      if (sprite.y > this.height + 10) {
        sprite.y = -10;
        sprite.x = Math.random() * this.width;
      }
      if (sprite.x < -20) sprite.x += this.width + 40;
      else if (sprite.x > this.width + 20) sprite.x -= this.width + 40;
    }
    for (const [i, sprite] of this.fog.entries()) {
      sprite.x += (6 + i * 2) * dt - cameraDx * 0.5;
      if (sprite.x - sprite.width / 2 > this.width) sprite.x = -sprite.width / 2;
      if (sprite.x + sprite.width / 2 < 0) sprite.x = this.width + sprite.width / 2;
    }
  }
}
