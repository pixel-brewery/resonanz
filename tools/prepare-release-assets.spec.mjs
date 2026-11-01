// #region Imports
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { prepareReleaseAssets } from './prepare-release-assets.mjs';
// #endregion

async function fixture(t) {
  await mkdir('.codex-work', { recursive: true });
  const root = await mkdtemp(resolve('.codex-work/release-assets-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const input = join(root, 'input');
  for (const target of ['darwin-arm64', 'win32-x64'])
    await mkdir(join(input, `installer-${target}`), { recursive: true });
  await writeFile(join(input, 'installer-darwin-arm64/Resonanz.dmg'), 'macOS fixture');
  await writeFile(join(input, 'installer-win32-x64/ResonanzSetup.exe'), 'Windows fixture');
  return {
    input,
    output: join(root, 'output'),
    version: '1.2.3',
    sourceCommit: 'a'.repeat(40),
    releaseCommit: 'b'.repeat(40),
  };
}

test('prepares both supported installers with exact updater checksums, sizes and immutable URLs', async (t) => {
  const options = await fixture(t);

  const receipt = await prepareReleaseAssets(options);

  assert.equal(receipt.files.length, 4);
  assert.equal(receipt.sourceCommit, options.sourceCommit);
  assert.equal(receipt.releaseCommit, options.releaseCommit);
  for (const [platform, architecture, original] of [
    ['darwin', 'arm64', 'macOS fixture'],
    ['win32', 'x64', 'Windows fixture'],
  ]) {
    const manifest = JSON.parse(
      await readFile(join(options.output, 'assets', `update-${platform}-${architecture}.json`)),
    );
    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.version, options.version);
    assert.equal(manifest.platform, platform);
    assert.equal(manifest.architecture, architecture);
    assert.equal(manifest.artifact.bytes, Buffer.byteLength(original));
    assert.equal(manifest.artifact.sha256, createHash('sha256').update(original).digest('hex'));
    assert.equal(
      manifest.artifact.url,
      `https://github.com/pixel-brewery/resonanz/releases/download/v1.2.3/${manifest.artifact.name}`,
    );
    assert.equal(
      await readFile(join(options.output, 'assets', manifest.artifact.name), 'utf8'),
      original,
    );
  }
});

test('rejects incomplete, ambiguous and empty installer sets before producing publication output', async (t) => {
  const options = await fixture(t);
  const windows = join(options.input, 'installer-win32-x64/ResonanzSetup.exe');
  await writeFile(windows, '');
  await assert.rejects(prepareReleaseAssets(options), /must not be empty/u);
  await writeFile(windows, 'Windows fixture');
  await writeFile(join(options.input, 'installer-win32-x64/other.exe'), 'unexpected installer');
  await assert.rejects(prepareReleaseAssets(options), /Exactly one/u);
  await rm(join(options.input, 'installer-win32-x64/other.exe'));
  await rm(windows);
  await assert.rejects(prepareReleaseAssets(options), /Exactly one/u);
});

test('rejects unsupported release versions and missing immutable source identities', async (t) => {
  const options = await fixture(t);
  for (const version of ['1.2.3-beta.1', '01.2.3', '65536.0.0', undefined])
    await assert.rejects(prepareReleaseAssets({ ...options, version }), /release version/u);
  await assert.rejects(
    prepareReleaseAssets({ ...options, releaseCommit: 'main' }),
    /Exact source/u,
  );
});

test('preserves existing output and refuses symbolic-link installer inputs', async (t) => {
  const options = await fixture(t);
  await mkdir(options.output);
  await writeFile(join(options.output, 'keep.txt'), 'keep existing output');
  await assert.rejects(prepareReleaseAssets(options), /dedicated empty/u);
  assert.equal(await readFile(join(options.output, 'keep.txt'), 'utf8'), 'keep existing output');
  const windows = join(options.input, 'installer-win32-x64/ResonanzSetup.exe');
  await rm(windows);
  try {
    await symlink('../installer-darwin-arm64/Resonanz.dmg', windows);
  } catch (error) {
    if (process.platform === 'win32' && error.code === 'EPERM') return;
    throw error;
  }
  await assert.rejects(prepareReleaseAssets(options), /regular files/u);
});
