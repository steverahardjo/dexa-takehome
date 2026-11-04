import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Integration tests boot the whole app and run migrations.
    testTimeout: 30_000,
    hookTimeout: 90_000,
  },
});
