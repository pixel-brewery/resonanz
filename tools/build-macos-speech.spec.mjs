// #region Imports
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { test } from 'node:test';
import { buildMacosSpeech, macosSpeechBuildKey } from './build-macos-speech.mjs';
// #endregion

async function fixture(run) {
  await mkdir('.codex-work/macos-speech-build-tests', { recursive: true });
  const root = await mkdtemp(resolve('.codex-work/macos-speech-build-tests/run-'));
  try {
    return await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('leaves non-macOS builds independent of the Apple toolchain', async () => {
  const result = await buildMacosSpeech({
    platform: 'win32',
    run: () => assert.fail('The Apple toolchain must not run on Windows.'),
  });
  assert.deepEqual(result, { built: false, reason: 'platform' });
});

test('separates native cache entries by SDK and never probes Apple tools on another platform', async () => {
  const modern = await macosSpeechBuildKey({
    platform: 'darwin',
    arch: 'arm64',
    run: async () => ({ stdout: '26.5\n' }),
  });
  const legacy = await macosSpeechBuildKey({
    platform: 'darwin',
    arch: 'arm64',
    run: async () => ({ stdout: '15.5\n' }),
  });
  assert.notDeepEqual(modern, legacy);
  assert.deepEqual(
    await macosSpeechBuildKey({
      platform: 'win32',
      arch: 'x64',
      run: () => assert.fail('The Apple SDK probe must not run on Windows.'),
    }),
    { platform: 'win32', arch: 'x64' },
  );
});

for (const [sdkVersion, arch, modern, target] of [
  ['26.5', 'arm64', true, 'arm64-apple-macos13.0'],
  ['15.5', 'x64', false, 'x86_64-apple-macos13.0'],
]) {
  test(`builds an executable ${modern ? 'modern recognizer' : 'local legacy recognizer'} with SDK ${sdkVersion}`, async () => {
    await fixture(async (root) => {
      const calls = [];
      const result = await buildMacosSpeech({
        root,
        platform: 'darwin',
        arch,
        run: async (command, args, options) => {
          calls.push({ command, args, options });
          if (args.includes('swiftc'))
            await writeFile(
              join(root, 'dist/native/ResonanzFileTranscriber'),
              'fixture executable',
            );
          return { stdout: `${sdkVersion}\n` };
        },
      });
      assert.equal(result.built, true);
      assert.equal(result.modern, modern);
      const compilation = calls.find(({ args }) => args.includes('swiftc'));
      assert.equal(compilation.args[compilation.args.indexOf('-target') + 1], target);
      assert.equal(compilation.args.includes('RESONANZ_SPEECH_ANALYZER'), modern);
      const embeddedPlist = compilation.args.indexOf('-sectcreate');
      assert.ok(embeddedPlist > 0);
      assert.deepEqual(compilation.args.slice(embeddedPlist, embeddedPlist + 7), [
        '-sectcreate',
        '-Xlinker',
        '__TEXT',
        '-Xlinker',
        '__info_plist',
        '-Xlinker',
        join(root, 'resources/speech/macos-file-transcription.plist'),
      ]);
      assert.equal(compilation.options.env.TMPDIR, join(root, '.codex-work/tmp'));
      assert.equal(calls.at(-1).command, '/usr/bin/codesign');
      assert.equal(calls.at(-1).args.at(-1), result.output);
    });
  });
}

test('does not silently downgrade an invalid SDK or a failed compiler', async () => {
  await fixture(async (root) => {
    await assert.rejects(
      buildMacosSpeech({ root, platform: 'darwin', run: async () => ({ stdout: 'unavailable' }) }),
      /Cannot determine the macOS SDK/u,
    );
    await assert.rejects(
      buildMacosSpeech({
        root,
        platform: 'darwin',
        run: async (_command, args) => {
          if (args.includes('swiftc')) throw new Error('Compiler failure');
          return { stdout: '26.5' };
        },
      }),
      /Compiler failure/u,
    );
  });
});
