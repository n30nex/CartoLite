import { defineConfig } from 'vitest/config';

function inputPath(relative: string): string {
  const pathname = decodeURIComponent(new URL(relative, import.meta.url).pathname);
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}

export default defineConfig({
  build: {
    manifest: true,
    target: 'es2022',
    // Preload links remain native; ordinary ESM loading also works without them.
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 500,
    rolldownOptions: {
      output: {
        // Keep shared controls, projections and effects together. Entry points
        // and MapLibre stay separate, so Netgraph never loads the basemap.
        codeSplitting: { groups: [
          { name: 'terminal', test: /[\\/]src[\\/]terminal(?:Grid|Graphics)?\.ts$/, priority: 20, includeDependenciesRecursively: false },
          { name: 'shared', test: /[\\/]src[\\/]/, minShareCount: 2, priority: 10 },
        ] },
      },
      input: {
        main: inputPath('index.html'),
        terminal: inputPath('src/terminal.ts'),
        labs: inputPath('labs/index.html'),
        netgraph: inputPath('netgraph/index.html')
      }
    }
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts']
  }
});
