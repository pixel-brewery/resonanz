// #region Imports
import { execFile } from 'node:child_process';
import { chmod, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
// #endregion

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function sdkVersion(run, options) {
  const { stdout } = await run(
    '/usr/bin/xcrun',
    ['--sdk', 'macosx', '--show-sdk-version'],
    options,
  );
  const version = stdout.trim();
  if (!/^\d+(?:\.\d+)*$/u.test(version)) throw new Error('Cannot determine the macOS SDK version.');
  return version;
}

/** Prevents native build caches from crossing architectures or Apple SDK generations. */
export async function macosSpeechBuildKey({
  platform = process.platform,
  arch = process.arch,
  run = promisify(execFile),
} = {}) {
  return {
    platform,
    arch,
    ...(platform === 'darwin'
      ? { sdkVersion: await sdkVersion(run, { encoding: 'utf8', timeout: 10_000 }) }
      : {}),
  };
}

/** Builds the host-owned file recognizer without changing the installed speech dependency. */
export async function buildMacosSpeech({
  root = workspaceRoot,
  platform = process.platform,
  arch = process.arch,
  run = promisify(execFile),
} = {}) {
  if (platform !== 'darwin') return { built: false, reason: 'platform' };
  if (!['arm64', 'x64'].includes(arch)) throw new Error(`Unsupported macOS architecture: ${arch}`);
  const output = join(root, 'dist/native/ResonanzFileTranscriber');
  const cache = join(root, '.codex-work/swift-module-cache');
  const temporary = join(root, '.codex-work/tmp');
  await mkdir(dirname(output), { recursive: true });
  await mkdir(cache, { recursive: true });
  await mkdir(temporary, { recursive: true });
  const options = {
    cwd: root,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 1024 * 1024,
    env: { ...process.env, TMPDIR: temporary },
  };
  const version = await sdkVersion(run, options);
  const modern = Number(version.split('.')[0]) >= 26;
  await run(
    '/usr/bin/xcrun',
    [
      '--sdk',
      'macosx',
      'swiftc',
      '-parse-as-library',
      '-O',
      '-target',
      `${arch === 'x64' ? 'x86_64' : arch}-apple-macos13.0`,
      '-module-cache-path',
      cache,
      ...(modern ? ['-D', 'RESONANZ_SPEECH_ANALYZER'] : []),
      '-Xlinker',
      '-sectcreate',
      '-Xlinker',
      '__TEXT',
      '-Xlinker',
      '__info_plist',
      '-Xlinker',
      join(root, 'resources/speech/macos-file-transcription.plist'),
      join(root, 'resources/speech/macos-file-transcription.swift'),
      '-o',
      output,
    ],
    options,
  );
  await chmod(output, 0o755);
  await run('/usr/bin/codesign', ['--force', '--sign', '-', output], options);
  return { built: true, modern, sdkVersion: version, output };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const keyOnly = process.argv.length === 3 && process.argv[2] === '--cache-key';
  if (process.argv.length !== 2 && !keyOnly)
    throw new Error('Usage: node tools/build-macos-speech.mjs [--cache-key]');
  process.stdout.write(
    `${JSON.stringify(await (keyOnly ? macosSpeechBuildKey() : buildMacosSpeech()))}\n`,
  );
}
