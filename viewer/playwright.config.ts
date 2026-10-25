import { defineConfig, devices } from '@playwright/test';

// Serves the production bundle (dist/site) under a sub-path, the way the Hugo site will.
export const BASE_PATH = '/maps/israel/';
// E2E_PORT lets parallel runs (several worktrees or agents) use different ports; the preview server and the tests
// both read it.
const PORT = Number(process.env.E2E_PORT) || 4179;

export default defineConfig({
  testDir: 'e2e',
  outputDir: 'test-results',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: { baseURL: `http://127.0.0.1:${PORT}${BASE_PATH}` },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
      },
    },
    // Range input and RTL handling differ between engines: the slider specs also run in Firefox and WebKit.
    { name: 'firefox', grep: /range slider|full selection/, use: { ...devices['Desktop Firefox'], viewport: { width: 1280, height: 800 } } },
    { name: 'webkit', grep: /range slider|full selection/, use: { ...devices['Desktop Safari'], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npx vite preview --host 127.0.0.1 --port ${PORT} --strictPort --base ${BASE_PATH}`,
    url: `http://127.0.0.1:${PORT}${BASE_PATH}`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
