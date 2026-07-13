import { defineConfig } from 'vitest/config';

export default defineConfig({
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 500
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts']
  }
});
