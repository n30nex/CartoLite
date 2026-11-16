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
  }, {
    name: 'webos-classic-script',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const asset of Object.values(bundle)) {
        if (asset.type === 'asset' && asset.fileName.endsWith('.css')) {
          // Chromium 68 supports the legacy selector-list spelling. This is
          // confined to the TV bundle; the website retains :where specificity.
          asset.source = String(asset.source).replace(/:(?:where|is)\(/g, ':-webkit-any(')
            .replace(/:focus-visible/g, ':focus');
        }
      }
    },
    transformIndexHtml: {
      order: 'post',
      handler: html => html.replace(/type="module"/g, 'defer').replace(/ crossorigin/g, ''),
    },
  }],
  css: { transformer: 'lightningcss', lightningcss: { targets: { chrome: 68 << 16 } } },
  worker: { format: 'iife', rolldownOptions: { output: { banner: compatibility } } },
  build: {
    outDir: '../webos/dist', emptyOutDir: true,
    target: 'chrome68', cssTarget: 'chrome68', cssMinify: 'lightningcss',
    modulePreload: false, assetsInlineLimit: 0,
    rolldownOptions: {
      input: new URL('./index.html', import.meta.url).pathname,
      output: { format: 'iife', codeSplitting: false },
    },
  },
});
