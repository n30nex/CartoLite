import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  outputDir: './test-results',
  retries: process.env.CI ? 1 : 0,
  // Stop broken candidates early; a passing candidate still runs every scenario.
  maxFailures: process.env.CI ? 3 : 0,
  // Renderer timing is meaningful only when one Chromium instance owns the
  // shared Actions CPU; concurrent software-rendered maps distort the gate.
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.CARTOLITE_BASE_URL ?? 'http://127.0.0.1:39476',
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
    // The authorized Pi runner exposes its V3D render device. Hosted Actions
    // keep the existing software renderer and every test/runtime threshold.
    launchOptions: { args: process.env.CARTOLITE_PI_GPU === '1'
      ? ['--use-gl=angle','--use-angle=gl-egl','--disable-gpu-sandbox','--ignore-gpu-blocklist']
      : ['--enable-unsafe-swiftshader'] }
  },
  projects: [
    {
      name: 'mobile-webkit',
      testMatch: /(?:(?:labs-)?(?:mobile-ux|ui-audit)|terminal(?:-flight)?|fly3d|chronoscope|firehose|pachinko|navigation|visual-polish|theme-cohesion|scopes|animation-performance)\.spec\.ts/,
      use: { ...devices['iPhone 13'], launchOptions: { args: [] } }
    },
    {
      name: 'desktop',
      testIgnore: /tablet-portrait\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } }
    },
    { name: 'mobile', testIgnore: /tablet-portrait\.spec\.ts/, use: { ...devices['Pixel 7'] } },
    {
      name: 'mobile-tablet-portrait',
      testMatch: /tablet-portrait\.spec\.ts/,
      use: { ...devices['Desktop Chrome'], viewport: { width: 800, height: 1280 }, hasTouch: true }
    },
    {
      name: 'mobile-landscape',
      testIgnore: /tablet-portrait\.spec\.ts/,
      use: { ...devices['Pixel 7'], viewport: { width: 844, height: 390 } }
    }
  ]
});
