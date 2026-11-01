// #region Imports
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
// #endregion

test('preserves the minimal staged runtime manifest through Packager sanitization', async () => {
  const { default: config } = await import('./forge.config.mjs');
  const scratch = fileURLToPath(new URL('./.codex-work/', import.meta.url));
  await mkdir(scratch, { recursive: true });
  const directory = await mkdtemp(join(scratch, 'forge-runtime-manifest-'));
  try {
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({
        name: 'fixture',
        productName: 'Fixture',
        version: '0.0.1',
        private: false,
        description: 'Fixture application',
        author: 'Fixture',
        type: 'commonjs',
        main: 'source-only.js',
        license: 'MIT',
        scripts: { build: 'fixture' },
        devDependencies: { 'source-only': '1.0.0' },
        dependencies: { 'source-only': '1.0.0' },
        workspaces: ['fixture'],
      }),
    );
    await config.hooks.packageAfterCopy(config, directory);
    let manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    assert.ok(config.packagerConfig.sanitizePackageJson?.length);
    for (const sanitize of config.packagerConfig.sanitizePackageJson)
      manifest = await sanitize(manifest, '45.1.0', process.platform, process.arch);
    assert.equal(manifest.private, true);
    assert.equal(manifest.type, 'module');
    assert.equal(manifest.main, 'dist/apps/desktop/main.mjs');
    assert.deepEqual(Object.keys(manifest).sort(), [
      'author',
      'dependencies',
      'description',
      'license',
      'main',
      'name',
      'private',
      'productName',
      'type',
      'version',
    ]);
    assert.deepEqual(Object.keys(manifest.dependencies).sort(), [
      'electron-native-speech',
      'electron-native-speech-backend-macos',
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

for (const platform of ['darwin', 'win32', 'linux']) {
  test(`packages ${platform} without certificate signing even when legacy credentials are present`, () => {
    const result = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
          import assert from 'node:assert/strict';
          Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)} });
          const { default: config } = await import(${JSON.stringify(new URL('./forge.config.mjs', import.meta.url).href)});
          const options = config.packagerConfig;
          assert.equal(options.osxNotarize, undefined);
          assert.equal(options.windowsSign, undefined);
          if (process.platform === 'darwin') {
            assert.equal(options.osxSign.identity, '-');
            assert.equal(options.osxSign.identityValidation, false);
            assert.equal(options.osxSign.continueOnError, false);
            assert.equal(options.osxSign.optionsForFile('Resonanz.app').hardenedRuntime, false);
          } else {
            assert.equal(options.osxSign, undefined);
          }
          const installer = config.makers.find((maker) => maker.name === 'squirrel');
          assert.ok(installer, 'The Windows installer maker must remain configured.');
          await installer.prepareConfig('x64');
          for (const key of ['windowsSign', 'certificateFile', 'certificatePassword', 'signWithParams']) {
            assert.equal(installer.config[key], undefined);
          }
        `,
      ],
      {
        encoding: 'utf8',
        timeout: 30_000,
        env: {
          ...process.env,
          APPLE_SIGNING_IDENTITY: 'Developer ID Application: Fixture',
          MACOS_CERTIFICATE_BASE64: 'fixture',
          MACOS_CERTIFICATE_PASSWORD: 'fixture',
          APPLE_API_KEY_PATH: 'fixture.p8',
          APPLE_API_KEY_ID: 'fixture',
          APPLE_API_ISSUER: 'fixture',
          WINDOWS_CERTIFICATE_FILE: 'fixture.pfx',
          WINDOWS_CERTIFICATE_PASSWORD: 'fixture',
          WINDOWS_SIGN_WITH_PARAMS: '/a',
        },
      },
    );
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
  });
}
