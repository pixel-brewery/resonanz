// #region Imports
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { createUpdateManifest } from './write-update-manifest.mjs';
// #endregion

let directory;

beforeEach(async () => {
  await mkdir('.codex-work/update-manifest-tests', { recursive: true });
  directory = await mkdtemp(resolve('.codex-work/update-manifest-tests/run-'));
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

test('describes an installer with size, checksum and release URL', async () => {
  const installer = join(directory, 'Resonanz-0.2.0-arm64.dmg');
  await writeFile(installer, 'installer bytes');

  const { path, manifest } = await createUpdateManifest({
    installer,
    version: '0.2.0',
    platform: 'darwin',
    arch: 'arm64',
    baseUrl: 'https://github.com/pixel-brewery/resonanz/releases/download/v0.2.0',
  });

  assert.equal(path, join(directory, 'update-darwin-arm64.json'));
  assert.deepEqual(manifest, {
    schemaVersion: 1,
    version: '0.2.0',
    platform: 'darwin',
    architecture: 'arm64',
    artifact: {
      name: 'Resonanz-0.2.0-arm64.dmg',
      bytes: 15,
      sha256: createHash('sha256').update('installer bytes').digest('hex'),
      url: 'https://github.com/pixel-brewery/resonanz/releases/download/v0.2.0/Resonanz-0.2.0-arm64.dmg',
    },
  });
});

test('rejects installers and locations the app would not accept', async () => {
  const installer = join(directory, 'Resonanz-0.2.0.zip');
  await writeFile(installer, 'x');
  const options = {
    installer,
    version: '0.2.0',
    platform: 'darwin',
    arch: 'arm64',
    baseUrl: 'https://example.com/releases',
  };

  await assert.rejects(createUpdateManifest(options), /must end with \.dmg/u);
  await assert.rejects(createUpdateManifest({ ...options, platform: 'linux' }), /darwin/u);
  await assert.rejects(
    createUpdateManifest({ ...options, version: '0.2' }),
    /major\.minor\.patch/u,
  );
  await assert.rejects(
    createUpdateManifest({
      ...options,
      installer: join(directory, 'Resonanz.dmg'),
      baseUrl: 'http://example.com/releases',
    }),
    /HTTPS/u,
  );
});
