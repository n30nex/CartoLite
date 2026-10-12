import { defineConfig } from 'vitest/config';

function inputPath(relative: string): string {
  const pathname = decodeURIComponent(new URL(relative, import.meta.url).pathname);
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}

export default defineConfig({
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 500,
    rolldownOptions: {
      output: {
        // Keep shared controls, projections and effects together. Entry points
        // and MapLibre stay separate, so Netgraph never loads the basemap.
        codeSplitting: { groups: [
          { name: 'shared', test: /[\\/]src[\\/]/, minShareCount: 2, priority: 10 },
          // Labs always opens the art library. Bundle its shell/runtime with it
          // instead of sharing Labs-only helpers with Map and Netgraph. Images
          // still load only when their selected experience mounts.
          { name: 'labs', test: /[\\/]src[\\/]labs[\\/]/, priority: 20, includeDependenciesRecursively: false },
        ] },
      },
      input: {
        main: inputPath('index.html'),
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
