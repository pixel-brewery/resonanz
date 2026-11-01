// #region Imports
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
// #endregion

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
