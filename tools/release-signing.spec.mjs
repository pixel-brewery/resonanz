// #region Imports
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseSigning } from './release-signing.mjs';
// #endregion

test('preserves a launchable ad-hoc macOS signature and unsigned Windows without credentials', () => {
  const macos = releaseSigning('darwin', {});
  assert.equal(macos.osxSign.identity, '-');
  assert.equal(macos.osxSign.identityValidation, false);
  assert.deepEqual(macos.osxSign.optionsForFile(), { hardenedRuntime: false });
  assert.equal(macos.osxSign.continueOnError, false);
  assert.equal(macos.osxNotarize, undefined);
  assert.deepEqual(releaseSigning('win32', {}), {});
});

test('uses configured Developer ID and enables notarization only with the complete independent group', () => {
  const signed = releaseSigning('darwin', {
    APPLE_SIGNING_IDENTITY: 'Developer ID Application: Example',
  });
  assert.equal(signed.osxSign.identity, 'Developer ID Application: Example');
  assert.equal(signed.osxSign.optionsForFile, undefined);
  assert.equal(signed.osxNotarize, undefined);
  const notarized = releaseSigning('darwin', {
    APPLE_SIGNING_IDENTITY: 'Developer ID Application: Example',
    APPLE_API_KEY_PATH: '.codex-work/notarization.p8',
    APPLE_API_KEY_ID: 'EXAMPLEKEY',
    APPLE_API_ISSUER: 'example-issuer',
  });
  assert.deepEqual(notarized.osxNotarize, {
    appleApiKey: '.codex-work/notarization.p8',
    appleApiKeyId: 'EXAMPLEKEY',
    appleApiIssuer: 'example-issuer',
  });
});

test('rejects partial groups and notarization without trusted signing instead of silently downgrading', () => {
  assert.throws(
    () => releaseSigning('darwin', { APPLE_API_KEY_PATH: 'key.p8' }),
    /complete credential/u,
  );
  assert.throws(
    () =>
      releaseSigning('darwin', {
        APPLE_API_KEY_PATH: 'key.p8',
        APPLE_API_KEY_ID: 'key',
        APPLE_API_ISSUER: 'issuer',
      }),
    /signing identity/u,
  );
  assert.throws(
    () => releaseSigning('win32', { WINDOWS_CERTIFICATE_FILE: 'certificate.pfx' }),
    /complete credential/u,
  );
});

test('uses only the current platform certificate inputs and never activates another platform', () => {
  const windows = releaseSigning('win32', {
    WINDOWS_CERTIFICATE_FILE: '.codex-work/certificate.pfx',
    WINDOWS_CERTIFICATE_PASSWORD: 'fixture-only-password',
  });
  assert.deepEqual(windows.windowsSign, {
    certificateFile: '.codex-work/certificate.pfx',
    certificatePassword: 'fixture-only-password',
    description: 'Resonanz',
  });
  assert.equal(windows.osxSign, undefined);
  assert.equal(
    releaseSigning('darwin', { WINDOWS_CERTIFICATE_FILE: 'foreign.pfx' }).osxSign.identity,
    '-',
  );
});
