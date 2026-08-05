import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    exclude: [
      'coverage/**',
      'dist/**',
      'node_modules/**',
      'tests/manifest-build.test.ts',
    ],
  },
});
