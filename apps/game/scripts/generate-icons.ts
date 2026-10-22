/**
 * Renders the provisional PNG icons from public/icons/icon.svg with Chromium.
 * Run once after changing the SVG: `pnpm --filter @cle/game exec tsx scripts/generate-icons.ts`.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from '@playwright/test';

const iconsDir = join(import.meta.dirname, '..', 'public', 'icons');
const svg = await readFile(join(iconsDir, 'icon.svg'), 'utf8');
const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;

const targets = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'apple-touch-icon.png', size: 180, maskable: true },
  { file: 'maskable-512.png', size: 512, maskable: true },
];

const browser = await chromium.launch({
  ...(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {}),
});
const page = await browser.newPage();
for (const { file, size, maskable } of targets) {
  await page.setViewportSize({ width: size, height: size });
  // Maskable icons need a full-bleed background with the artwork inside the 80 % safe zone.
  const inner = maskable ? Math.round(size * 0.8) : size;
  await page.setContent(
    `<body style="margin:0;display:grid;place-items:center;width:${size}px;height:${size}px;background:${maskable ? '#2b5c8a' : 'transparent'}">
       <img src="${dataUrl}" width="${inner}" height="${inner}">
     </body>`,
  );
  await page.screenshot({ path: join(iconsDir, file), omitBackground: !maskable });
}
await browser.close();
