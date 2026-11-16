import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

const compatibility = readFileSync(new URL('../webos/polyfills.js', import.meta.url), 'utf8');

// A separate artifact, built by the existing CI, from the unchanged default-map
// HTML and application. No iframe, website redirect, or desktop streaming.
export default defineConfig({
  base: './',
  define: { 'import.meta.env.VITE_API_ORIGIN': JSON.stringify('https://carto.canadaverse.org') },
  plugins: [{
    name: 'cartolite-webos',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace('/src/main.ts', '/src/webos.ts')
          .replace('<head>', '<head><script src="./tv-polyfills.js"></script>')
          .replace(/<link rel="manifest"[^>]+>/, '');
      },
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'tv-polyfills.js', source: compatibility });
    },
  }],
  css: { transformer: 'lightningcss', lightningcss: { targets: { chrome: 68 << 16 } } },
  worker: { format: 'iife', rolldownOptions: { output: { banner: compatibility } } },
  build: {
    outDir: '../webos/dist', emptyOutDir: true,
    target: 'chrome68', cssTarget: 'chrome68', cssMinify: 'lightningcss',
    modulePreload: false, assetsInlineLimit: 0,
    rolldownOptions: { input: new URL('./index.html', import.meta.url).pathname },
  },
});
