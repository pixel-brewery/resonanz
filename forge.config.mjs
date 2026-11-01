// #region Imports
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { dirname, join, resolve } from 'node:path';
import { readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
// #endregion

const root = dirname(fileURLToPath(import.meta.url));
const icons = resolve(root, 'resources/icons');

export default {
  outDir: resolve(root, process.env['RESONANZ_OUTPUT_DIR'] ?? 'out'),
  hooks: {
    async prePackage(_forgeConfig, platform) {
      for (const relative of [
        'dist/apps/desktop/main.mjs',
        'dist/apps/desktop/preload.cjs',
        'dist/apps/orchestrator/main.mjs',
        'dist/apps/renderer/browser/index.html',
        'resources/icons/resonanz.icns',
        'resources/icons/resonanz.ico',
        'resources/icons/png/app/resonanz-32.png',
        'resources/icons/png/app/resonanz-512.png',
        'resources/icons/png/tray/resonanz-tray.png',
        'THIRD_PARTY_NOTICES.md',
        'LICENSE',
        'resources/speech/windows-speech.ps1',
        'node_modules/electron-native-speech/dist/index.js',
        'node_modules/electron-native-speech-backend-macos/dist/index.js',
        'node_modules/electron-native-speech-preload/dist/index.js',
        ...(platform === 'darwin'
          ? [
              'node_modules/electron-native-speech-backend-macos/bin/SpeechHelper.app/Contents/MacOS/SpeechHelper',
            ]
          : []),
      ])
        await access(resolve(root, relative));
    },
    async packageAfterCopy(_forgeConfig, buildPath) {
      if (resolve(buildPath) === root)
        throw new Error(
          'The packaged manifest must be written only into the Forge staging directory.',
        );
      const manifest = JSON.parse(await readFile(join(buildPath, 'package.json'), 'utf8'));
      const speech = JSON.parse(
        await readFile(resolve(root, 'node_modules/electron-native-speech/package.json'), 'utf8'),
      );
      const backend = JSON.parse(
        await readFile(
          resolve(root, 'node_modules/electron-native-speech-backend-macos/package.json'),
          'utf8',
        ),
      );
      // Every application/private workspace and Synapse dependency is already bundled.
      // Keep only the explicitly late-bound native speech package and its installed closure.
      const runtimeManifest = {
        name: manifest.name,
        productName: manifest.productName,
        version: manifest.version,
        private: true,
        description: manifest.description,
        author: manifest.author,
        type: 'module',
        main: 'dist/apps/desktop/main.mjs',
        ...(manifest.license ? { license: manifest.license } : {}),
        dependencies: {
          'electron-native-speech': speech.version,
          'electron-native-speech-backend-macos': backend.version,
        },
      };
      await writeFile(
        join(buildPath, 'package.json'),
        `${JSON.stringify(runtimeManifest, null, 2)}\n`,
        'utf8',
      );
    },
  },
  packagerConfig: {
    asar: true,
    // The stage hook owns the runtime allowlist; Packager's default removes private.
    sanitizePackageJson: [(manifest) => manifest],
    // fs-extra rejects copying the checkout into its own descendant directory.
    tmpdir: resolve(root, '../.resonanz-package-staging'),
    // The source manifest uses workspaces and local archives; runtime pruning must
    // follow the complete bundle/native allowlist instead of traversing that graph.
    prune: false,
    appBundleId: 'de.pixelbrewery.resonanz',
    executableName: 'Resonanz',
    icon: resolve(icons, 'resonanz'),
    extendInfo: {
      NSMicrophoneUsageDescription:
        'Resonanz uses the microphone only for recording or live conversation that you start.',
      NSSpeechRecognitionUsageDescription:
        'Resonanz creates local transcripts of your recordings on this Mac.',
    },
    extraResource: [
      icons,
      resolve(root, 'THIRD_PARTY_NOTICES.md'),
      resolve(root, 'LICENSE'),
      resolve(root, 'resources/speech'),
      ...(process.platform === 'darwin'
        ? [resolve(root, 'node_modules/electron-native-speech-backend-macos/bin/SpeechHelper.app')]
        : []),
    ],
    ignore: [
      /^\/(?!dist(?:\/|$)|package\.json$|node_modules(?:\/|$))/,
      /^\/node_modules\/(?!(?:electron-native-speech|electron-native-speech-backend-macos|electron-native-speech-preload)(?:\/|$))/,
      /^\/node_modules\/electron-native-speech-backend-macos\/(?:bin|scripts)(?:\/|$)/,
    ],
    // Ad-hoc sealing keeps Apple Silicon bundles launchable without a certificate.
    ...(process.platform === 'darwin'
      ? {
          osxSign: {
            identity: '-',
            identityValidation: false,
            optionsForFile: () => ({ hardenedRuntime: false }),
            continueOnError: false,
          },
        }
      : {}),
  },
  makers: [
    new MakerZIP({}, ['darwin', 'win32', 'linux']),
    new MakerDMG({
      name: 'Resonanz',
      title: 'Resonanz',
      icon: resolve(icons, 'resonanz.icns'),
      format: 'UDZO',
    }),
    new MakerSquirrel({
      name: 'resonanz',
      setupExe: 'ResonanzSetup.exe',
      setupIcon: resolve(icons, 'resonanz.ico'),
    }),
  ],
};
