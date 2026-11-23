import { readFileSync, statSync } from 'node:fs';
import { uiTexts } from '@cle/content';
import { describe, expect, it } from 'vitest';

/** The manifest of DomoThib Games (docs/domothib.md, §3), as DomoThib checks it. */
const publicDir = new URL('../../public/', import.meta.url);
const raw = readFileSync(new URL('domothib.json', publicDir));
const manifest = JSON.parse(raw.toString('utf8')) as Record<string, unknown>;

/** Width and height of a WebP file (lossy, lossless or extended). */
function webpSize(bytes: Buffer): { width: number; height: number } {
  expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
  expect(bytes.toString('ascii', 8, 12)).toBe('WEBP');
  const chunk = bytes.toString('ascii', 12, 16);
  if (chunk === 'VP8 ') {
    return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
  }
  if (chunk === 'VP8L') {
    const bits = bytes.readUInt32LE(21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === 'VP8X') {
    return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
  }
  throw new Error(`Unknown WebP chunk ${chunk}`);
}

describe('domothib.json', () => {
  it('follows the contract', () => {
    expect(raw.length).toBeLessThanOrEqual(16 * 1024);
    expect(manifest.protocole).toBe(1);
    expect(manifest.id).toBe('cle-en-main');
    expect(manifest.id).toMatch(/^[a-z0-9-]{1,40}$/);
    expect(manifest.version).toMatch(/^.{1,20}$/);
    expect(['paysage', 'portrait', 'libre']).toContain(manifest.orientation);
    expect(manifest.ecrans).toEqual(expect.arrayContaining(['telephone']));
    expect(manifest.commandes).toEqual(['tactile']);
    expect(manifest.sauvegarde).toBe('domothib');
    expect(['haut-gauche', 'haut-droite', 'bas-gauche', 'bas-droite']).toContain(manifest.poignee);
  });

  it('names the game as content/ does', () => {
    expect(manifest.nom).toBe(uiTexts.app.name);
    expect(manifest.description).toBe(uiTexts.app.description);
    expect(String(manifest.description).length).toBeLessThanOrEqual(200);
  });

  it('has a 16:9 cover of 300 KB at most', () => {
    const file = new URL(String(manifest.jaquette), publicDir);
    expect(statSync(file).size).toBeLessThanOrEqual(300 * 1024);
    expect(webpSize(readFileSync(file))).toEqual({ width: 640, height: 360 });
  });
});
