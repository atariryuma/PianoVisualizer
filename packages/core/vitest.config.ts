import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', '**/*.d.ts'],
      // We're 0% extracted right now — set realistic minimums per file as we
      // bring code over. Don't gate CI on a global threshold yet.
      thresholds: { lines: 0, functions: 0, branches: 0, statements: 0 },
    },
  },
});
