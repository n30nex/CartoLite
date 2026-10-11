import { defineConfig } from 'vitest/config';

function inputPath(relative: string): string {
  const pathname = decodeURIComponent(new URL(relative, import.meta.url).pathname);
  return /^\/[A-Za-z]:\//.test(pathname) ? pathname.slice(1) : pathname;
}

export default defineConfig({
  build: {
    target: 'es2022',
    // Spend a little more CI time to keep all three experiences within the download budget.
    minify: 'terser',
    terserOptions: { compress: { passes: 3 } },
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 500,
    rolldownOptions: {
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
