import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // Runs the full pipeline once (~20 s) into a temp dir before any test.
    globalSetup: ['tests/global-setup.ts'],
    hookTimeout: 180_000,
    testTimeout: 60_000,
  },
});
