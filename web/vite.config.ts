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
          { name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/, priority: 30, includeDependenciesRecursively: false },
          { name: 'arcade', test: /[\\/]src[\\/](?:firehose|pachinko)[\\/]/, priority: 20, includeDependenciesRecursively: false },
          { name: 'scene3d', test: /[\\/]src[\\/]sceneMaterials\.ts$/, priority: 25, includeDependenciesRecursively: false },
          { name: 'terminal', test: /[\\/]src[\\/]terminal(?:Grid|Graphics)?\.ts$/, priority: 20, includeDependenciesRecursively: false },
          { name: 'chronoscope', test: /[\\/]src[\\/]chronoscope[\\/]/, priority: 20, includeDependenciesRecursively: false },
          { name: 'shared', test: /[\\/]src[\\/]/, minShareCount: 2, priority: 10 },
        ] },
      },
      input: {
        main: inputPath('index.html'),
        terminal: inputPath('src/terminal.ts'),
        labs: inputPath('labs/index.html'),
        netgraph: inputPath('netgraph/index.html'),
        chronoscope: inputPath('chronoscope/index.html'),
        firehose: inputPath('firehose/index.html'),
        pachinko: inputPath('pachinko/index.html')
      }
    }
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts']
  }
});
