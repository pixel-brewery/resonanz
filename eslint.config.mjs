import js from '@eslint/js';
import json from '@eslint/json';
import { createResourcesConfig } from '@pixel-brewery/wortlaut-eslint-rules';
import tseslint from 'typescript-eslint';

const sourceFiles = ['**/*.{js,cjs,mjs,ts,tsx,mts,cts}'];
const catalogs = ['libs/intl/src/assets/i18n/lang.{en,de}.json'];

export default [
  {
    ignores: [
      '.angular/**',
      '.codex-work/**',
      '.nx/**',
      '.yarn/**',
      '.agents/skills/architect/**',
      '.wortlaut/rule-packs/**',
      'coverage/**',
      'dist/**',
      'out/**',
      'vendor/**',
      'libs/audio/src/audio/**',
      'apps/renderer/public/audio/pcm-audio.worklet.js',
    ],
  },
  { ...js.configs.recommended, files: sourceFiles },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: config.files ?? sourceFiles,
  })),
  {
    files: ['**/*.{js,cjs,mjs}'],
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    files: catalogs,
    plugins: { json },
    language: 'json/json',
    rules: json.configs.recommended.rules,
  },
  ...createResourcesConfig({ files: catalogs, severity: 'error', missingTranslations: false }),
];
