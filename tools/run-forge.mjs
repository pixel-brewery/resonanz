// #region Imports
import { constants } from 'node:fs';
import { access, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
// #endregion

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function archiveFingerprint(path) {
  try {
    const information = await stat(path, { bigint: true });
    return [information.ino, information.ctimeNs, information.mtimeNs, information.size].join(':');
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT')
      return undefined;
    throw cause;
  }
}

/** Awaits a supported public Forge operation and confirms fresh complete output. */
export async function runForge(command, options = {}) {
  if (!['package', 'make'].includes(command))
    throw new Error('Usage: node tools/run-forge.mjs <package|make>');
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const version = /^(\d+)\.(\d+)\.(\d+)$/u.exec(nodeVersion);
  if (!version || Number(version[1]) !== 24 || Number(version[2]) < 15)
    throw new Error(
      `Packaging requires Node.js >=24.15.0 <25; current version is ${nodeVersion}. Select the project's Node 24 LTS runtime before retrying.`,
    );

  const directory = options.directory ?? root;
  const outputDirectory = resolve(directory, process.env['RESONANZ_OUTPUT_DIR'] ?? 'out');
  const temporaryDirectory = join(directory, '.codex-work/tmp');
  await mkdir(temporaryDirectory, { recursive: true });
  const previousTemporaryPaths = ['TMPDIR', 'TMP', 'TEMP'].map((key) => [key, process.env[key]]);
  for (const [key] of previousTemporaryPaths) process.env[key] = temporaryDirectory;
  try {
    const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
    const target = { platform: process.platform, arch: process.arch };
    const expectedPackage = join(
      outputDirectory,
      `${manifest.productName}-${target.platform}-${target.arch}`,
    );
    const archivePath =
      process.platform === 'darwin'
        ? join(expectedPackage, `${manifest.productName}.app/Contents/Resources/app.asar`)
        : join(expectedPackage, 'resources/app.asar');
    const previousArchive =
      command === 'package' ? await archiveFingerprint(archivePath) : undefined;
    // Dynamic import keeps the version guard ahead of Forge and its native tools.
    const api = options.loadApi
      ? await options.loadApi()
      : (await import('@electron-forge/core')).api;
    const returned = await api[command]({
      dir: directory,
      interactive: true,
      platform: process.platform,
      arch: process.arch,
      outDir: outputDirectory,
    });
    // Forge's public package API deliberately resolves void; make returns artifacts.
    const results = command === 'package' ? [target] : returned;
    if (!Array.isArray(results) || results.length === 0)
      throw new Error(`Forge ${command} returned no completed output targets.`);

    const outputPaths = [];
    const artifacts = [];
    for (const result of results) {
      if (result.platform !== process.platform || result.arch !== process.arch)
        throw new Error('Forge returned an unexpected platform or architecture.');
      const expectedPath = join(
        outputDirectory,
        `${manifest.productName}-${result.platform}-${result.arch}`,
      );
      const resources =
        process.platform === 'darwin'
          ? join(expectedPath, `${manifest.productName}.app/Contents/Resources`)
          : join(expectedPath, 'resources');
      const executable =
        process.platform === 'darwin'
          ? join(expectedPath, `${manifest.productName}.app/Contents/MacOS/Resonanz`)
          : join(expectedPath, process.platform === 'win32' ? 'Resonanz.exe' : 'Resonanz');
      for (const path of [join(resources, 'app.asar'), executable]) {
        const information = await stat(path);
        if (!information.isFile() || information.size === 0)
          throw new Error(`Forge produced a missing or empty runtime file: ${path}`);
      }
      await access(executable, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
      if (
        command === 'package' &&
        previousArchive !== undefined &&
        previousArchive === (await archiveFingerprint(archivePath))
      )
        throw new Error(
          'Forge package did not renew the existing ASAR; the unchanged older package cannot count as a successful run.',
        );
      outputPaths.push(relative(directory, expectedPath));

      if (command === 'make') {
        if (!Array.isArray(result.artifacts) || result.artifacts.length === 0)
          throw new Error('Forge make returned no distributable artifacts.');
        for (const artifact of result.artifacts) {
          const path = resolve(artifact);
          const withinOutput = relative(outputDirectory, path);
          if (withinOutput.startsWith('..') || isAbsolute(withinOutput))
            throw new Error('Forge returned an artifact outside the local output directory.');
          const information = await stat(path);
          if (!information.isFile() || information.size === 0)
            throw new Error(`Forge produced a missing or empty distributable: ${path}`);
          artifacts.push(relative(directory, path));
        }
      }
    }
    return { event: `forge.${command}.passed`, nodeVersion, outputPaths, artifacts };
  } finally {
    for (const [key, value] of previousTemporaryPaths) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.length !== 3)
      throw new Error('Usage: node tools/run-forge.mjs <package|make>');
    const result = await runForge(process.argv[2]);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (cause) {
    process.stderr.write(
      `${cause instanceof Error ? cause.message : 'Native packaging failed.'}\n`,
    );
    process.exitCode = 1;
  }
}
