import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    name: 'renderer-audio',
    fsModuleCache: false,
    environment: 'jsdom',
    globals: true,
    setupFiles: ['../../../../libs/audio/src/test-setup.ts'],
    include: ['*.spec.ts'],
    maxWorkers: 1,
    watch: false,
  },
});
