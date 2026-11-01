// #region Imports
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verifyReleaseAssets } from './verify-release-assets.mjs';
// #endregion

function fixture() {
  const names = [
    'Resonanz-darwin-arm64-1.2.3.dmg',
    'Resonanz-win32-x64-1.2.3.exe',
    'update-darwin-arm64.json',
    'update-win32-x64.json',
  ];
  const manifest = {
    schemaVersion: 1,
    version: '1.2.3',
    sourceCommit: 'a'.repeat(40),
    releaseCommit: 'b'.repeat(40),
    files: names.map((name) => ({
      name,
      bytes: 123,
      sha256: 'c'.repeat(64),
      url: `https://github.com/pixel-brewery/resonanz/releases/download/v1.2.3/${name}`,
    })),
  };
  const release = {
    tag_name: 'v1.2.3',
    draft: false,
    prerelease: false,
    assets: manifest.files.map((file) => ({
      name: file.name,
      state: 'uploaded',
      size: file.bytes,
      digest: `sha256:${file.sha256}`,
      browser_download_url: file.url,
    })),
  };
  return { manifest, release };
}

test('accepts only the exact complete installer and updater asset publication', () => {
  const { manifest, release } = fixture();
  assert.deepEqual(verifyReleaseAssets(manifest, release), []);
});

test('permits missing draft assets for recovery without accepting changed or unexpected bytes', () => {
  const { manifest, release } = fixture();
  release.draft = true;
  release.assets.pop();
  assert.deepEqual(verifyReleaseAssets(manifest, release, { allowMissing: true }), []);
  assert.notDeepEqual(verifyReleaseAssets(manifest, release), []);
  release.assets[0].digest = `sha256:${'d'.repeat(64)}`;
  assert.notDeepEqual(verifyReleaseAssets(manifest, release, { allowMissing: true }), []);
});

test('never permits missing assets in an already published release', () => {
  const { manifest, release } = fixture();
  release.assets.pop();
  assert.notDeepEqual(verifyReleaseAssets(manifest, release, { allowMissing: true }), []);
});

for (const mutation of [
  'tag',
  'size',
  'digest',
  'url',
  'state',
  'duplicate',
  'extra',
  'prerelease',
]) {
  test(`rejects a mismatched published ${mutation}`, () => {
    const { manifest, release } = fixture();
    if (mutation === 'tag') release.tag_name = 'v1.2.4';
    else if (mutation === 'prerelease') release.prerelease = true;
    else if (mutation === 'duplicate') release.assets.push({ ...release.assets[0] });
    else if (mutation === 'extra')
      release.assets.push({ ...release.assets[0], name: 'source.zip' });
    else
      Object.assign(release.assets[0], {
        [mutation === 'url' ? 'browser_download_url' : mutation]:
          mutation === 'size' ? 124 : 'unexpected',
      });
    assert.notDeepEqual(verifyReleaseAssets(manifest, release), []);
  });
}

test('rejects unsupported targets and unbound source identities in the local receipt', () => {
  const { manifest, release } = fixture();
  manifest.files[0].name = 'Resonanz-linux-x64-1.2.3.deb';
  assert.notDeepEqual(verifyReleaseAssets(manifest, release), []);
  manifest.sourceCommit = 'main';
  assert.notDeepEqual(verifyReleaseAssets(manifest, release), []);
});
