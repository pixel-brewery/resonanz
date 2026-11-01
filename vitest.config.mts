// #region Imports
import { defineConfig } from 'vitest/config';
// #endregion

export default defineConfig({
  test: {
    maxWorkers: 1,
    fileParallelism: false,
    fsModuleCache: false,
    projects: [
      'libs/audio/vitest.config.mts',
      'apps/renderer/src/audio/vitest.config.mts',
      {
        test: {
          name: 'native',
          environment: 'node',
          fsModuleCache: false,
          include: [
            'libs/assistant/src/**/*.spec.ts',
            'libs/contracts/src/**/*.spec.ts',
            'libs/intl/src/**/*.spec.ts',
            'libs/sessions/src/**/*.spec.ts',
            'apps/desktop/src/**/*.spec.ts',
            'apps/orchestrator/src/**/*.spec.ts',
          ],
        },
      },
      {
        test: {
          name: 'presenters',
          environment: 'jsdom',
          fsModuleCache: false,
          include: [
            'apps/renderer/src/presenters/**/*.spec.ts',
            'apps/renderer/src/services/**/*.spec.ts',
            'apps/renderer/src/components/**/*.spec.ts',
          ],
        },
      },
    ],
  },
});
