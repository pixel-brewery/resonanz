// #region Imports
import assert from 'node:assert/strict';
import { access, chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { runForge } from './run-forge.mjs';
// #endregion

let directory;
let packagedPath;
let executable;
let asarPath;
let previousOutputDirectory;
const target = { platform: process.platform, arch: process.arch };

beforeEach(async () => {
  previousOutputDirectory = process.env['RESONANZ_OUTPUT_DIR'];
  delete process.env['RESONANZ_OUTPUT_DIR'];
  await mkdir('.codex-work/forge-tests', { recursive: true });
  directory = await mkdtemp(resolve('.codex-work/forge-tests/run-'));
  await writeFile(join(directory, 'package.json'), JSON.stringify({ productName: 'Resonanz' }));
  packagedPath = join(directory, 'out', `Resonanz-${process.platform}-${process.arch}`);
  const application =
    process.platform === 'darwin' ? join(packagedPath, 'Resonanz.app/Contents') : packagedPath;
  asarPath = join(
    application,
    process.platform === 'darwin' ? 'Resources/app.asar' : 'resources/app.asar',
  );
  executable = join(
    application,
    process.platform === 'darwin'
      ? 'MacOS/Resonanz'
      : process.platform === 'win32'
        ? 'Resonanz.exe'
        : 'Resonanz',
  );
});

afterEach(async () => {
  if (previousOutputDirectory === undefined) delete process.env['RESONANZ_OUTPUT_DIR'];
  else process.env['RESONANZ_OUTPUT_DIR'] = previousOutputDirectory;
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function existingApplication() {
  await mkdir(join(asarPath, '..'), { recursive: true });
  await mkdir(join(executable, '..'), { recursive: true });
  await writeFile(asarPath, 'fixture archive');
  await writeFile(executable, 'fixture executable');
  await chmod(executable, 0o700);
}

test('rejects unsupported Node and commands before loading Forge or creating package work', async () => {
  let calls = 0;
  const loadApi = () => {
    calls += 1;
    throw new Error('Forge must not load');
  };
  for (const nodeVersion of ['22.22.0', '24.14.9', '25.0.0', '26.9.0', '24.15.0-rc.1'])
    await assert.rejects(
      runForge('package', { directory, nodeVersion, loadApi }),
      /requires Node.js >=24\.15\.0 <25/u,
    );
  await assert.rejects(
    runForge('publish', { directory, nodeVersion: '24.15.0', loadApi }),
    /Usage:/u,
  );
  assert.equal(calls, 0);
  await assert.rejects(access(join(directory, '.codex-work')));
});

test('rejects a void package completion that left an older application unchanged', async () => {
  await existingApplication();
  const oldArchive = await readFile(asarPath);
  await assert.rejects(
    runForge('package', {
      directory,
      nodeVersion: '24.15.0',
      loadApi: () => ({ package: async () => undefined }),
    }),
    /did not renew the existing ASAR/u,
  );
  assert.deepEqual(await readFile(asarPath), oldArchive);
});

test('rejects a void package completion with missing or empty runtime files', async () => {
  const options = {
    directory,
    nodeVersion: '24.21.0',
    loadApi: () => ({ package: async () => undefined }),
  };
  await assert.rejects(runForge('package', options), /ENOENT/u);
  await existingApplication();
  await writeFile(asarPath, '');
  await assert.rejects(runForge('package', options), /empty runtime file/u);
});

test('awaits the public void package API and confirms the newly created executable and archive', async () => {
  const previousTemporaryPaths = ['TMPDIR', 'TMP', 'TEMP'].map((key) => [key, process.env[key]]);
  const result = await runForge('package', {
    directory,
    nodeVersion: '24.15.0',
    loadApi: () => ({
      package: async (options) => {
        assert.equal(options.dir, directory);
        assert.equal(process.env.TMPDIR, join(directory, '.codex-work/tmp'));
        assert.equal(process.env.TEMP, process.env.TMPDIR);
        await existingApplication();
      },
    }),
  });
  assert.equal(result.event, 'forge.package.passed');
  for (const [key, value] of previousTemporaryPaths) assert.equal(process.env[key], value);
});

test('accepts the public void API after it rewrites the previous package archive', async () => {
  await existingApplication();
  const result = await runForge('package', {
    directory,
    nodeVersion: '24.15.0',
    loadApi: () => ({
      package: async () => {
        await writeFile(asarPath, 'fresh archive written by public Forge API');
      },
    }),
  });
  assert.equal(result.event, 'forge.package.passed');
  assert.equal(resolve(directory, result.outputPaths[0]), packagedPath);
});

test('make requires actual nonempty distributables and never accepts an arbitrary command', async () => {
  await existingApplication();
  const result = { ...target, artifacts: [] };
  const options = {
    directory,
    nodeVersion: '24.15.0',
    loadApi: () => ({ make: async () => [result] }),
  };
  await assert.rejects(runForge('make', options), /no distributable artifacts/u);
  const artifact = join(directory, 'out/make/Resonanz.zip');
  await mkdir(join(artifact, '..'), { recursive: true });
  await writeFile(artifact, '');
  result.artifacts = [artifact];
  await assert.rejects(runForge('make', options), /empty distributable/u);
  await writeFile(artifact, 'fixture archive');
  assert.equal((await runForge('make', options)).event, 'forge.make.passed');
});

test('an explicit verification output preserves the previously delivered application', async () => {
  await existingApplication();
  const deliveredAsar = asarPath;
  const deliveredBytes = await readFile(deliveredAsar);
  const outputDirectory = join(directory, '.codex-work/verified-output');
  process.env['RESONANZ_OUTPUT_DIR'] = '.codex-work/verified-output';
  const relativePackage = `Resonanz-${process.platform}-${process.arch}`;
  packagedPath = join(outputDirectory, relativePackage);
  const application =
    process.platform === 'darwin' ? join(packagedPath, 'Resonanz.app/Contents') : packagedPath;
  asarPath = join(
    application,
    process.platform === 'darwin' ? 'Resources/app.asar' : 'resources/app.asar',
  );
  executable = join(
    application,
    process.platform === 'darwin'
      ? 'MacOS/Resonanz'
      : process.platform === 'win32'
        ? 'Resonanz.exe'
        : 'Resonanz',
  );
  const result = await runForge('package', {
    directory,
    nodeVersion: '24.15.0',
    loadApi: () => ({
      package: async (options) => {
        assert.equal(options.outDir, outputDirectory);
        await existingApplication();
      },
    }),
  });
  assert.deepEqual(await readFile(deliveredAsar), deliveredBytes);
  assert.equal(result.outputPaths.length, 1);
  assert.equal(resolve(directory, result.outputPaths[0]), packagedPath);
});
