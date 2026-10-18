import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import uiTexts from '../../content/textes/interface.json' with { type: 'json' };

// Warm ivory background and teal accent (docs/05-direction-artistique.md).
const BACKGROUND_COLOR = '#f7f1e3';
const THEME_COLOR = '#1f6f6b';

/** Injects the game name, from content/, into index.html. */
function htmlTexts(): Plugin {
  return {
    name: 'cle-html-texts',
    transformIndexHtml: (html) =>
      html
        .replaceAll('%APP_NAME%', uiTexts.app.name)
        .replaceAll('%APP_DESCRIPTION%', uiTexts.app.description),
  };
}

export default defineConfig({
  // GitHub Pages serves the project at https://<user>.github.io/cle-en-main/.
  base: '/cle-en-main/',
  plugins: [
    react(),
    htmlTexts(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/icon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: uiTexts.app.name,
        short_name: uiTexts.app.shortName,
        description: uiTexts.app.description,
        lang: 'fr',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        // Portrait everywhere, except the « Rue » that turns into a panorama (docs/04, 4.1).
        orientation: 'any',
        background_color: BACKGROUND_COLOR,
        theme_color: THEME_COLOR,
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Music loops (content/musique.json) are precached too: the game works offline.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,mp3,ogg}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  server: { port: 5173 },
  preview: { port: 4173, strictPort: true },
});
