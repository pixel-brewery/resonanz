// Writes the update manifest that a packaged Resonanz checks for a new version:
// update-<platform>-<arch>.json next to the installer, describing its version, size, SHA-256
// and release download URL. It publishes nothing; attach both files to a release yourself.
//
//   node tools/write-update-manifest.mjs --installer out/make/Resonanz-0.2.0-arm64.dmg \
//     --version 0.2.0 --platform darwin --arch arm64 \
//     --base-url https://github.com/pixel-brewery/resonanz/releases/download/v0.2.0
// #region Imports
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
// #endregion

const suffixes = { darwin: '.dmg', win32: '.exe' };

/**
 * Builds the manifest for one installer.
 *
 * @param {{ installer: string, version: string, platform: string, arch: string, baseUrl: string }} options
 * @returns {Promise<{ path: string, manifest: object }>} Manifest and its target path.
 */
export async function createUpdateManifest({ installer, version, platform, arch, baseUrl }) {
  if (!/^\d+\.\d+\.\d+$/u.test(version)) throw new Error('The version must be major.minor.patch.');
  const suffix = suffixes[platform];
  if (!suffix) throw new Error('Updates exist for darwin (.dmg) and win32 (.exe) installers.');
  const name = basename(installer);
  if (!name.endsWith(suffix)) throw new Error(`A ${platform} installer must end with ${suffix}.`);
  if (!/^[A-Za-z0-9][A-Za-z0-9 ._+-]*$/u.test(name))
    throw new Error('The installer name must be a plain file name.');
  const base = new URL(baseUrl.replace(/\/+$/u, '') + '/');
  if (base.protocol !== 'https:' || base.username || base.password || base.search || base.hash)
    throw new Error('The download base must be a credential-free HTTPS URL.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(installer)) hash.update(chunk);
  const manifest = {
    schemaVersion: 1,
    version,
    platform,
    architecture: arch,
    artifact: {
      name,
      bytes: (await stat(installer)).size,
      sha256: hash.digest('hex'),
      url: new URL(encodeURIComponent(name), base).toString(),
    },
  };
  return { path: join(dirname(installer), `update-${platform}-${arch}.json`), manifest };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({
    options: {
      installer: { type: 'string' },
      version: { type: 'string' },
      platform: { type: 'string', default: process.platform },
      arch: { type: 'string', default: process.arch },
      'base-url': { type: 'string' },
    },
  });
  if (!values.installer || !values.version || !values['base-url'])
    throw new Error('Pass --installer, --version and --base-url.');
  const { path, manifest } = await createUpdateManifest({
    installer: values.installer,
    version: values.version,
    platform: values.platform,
    arch: values.arch,
    baseUrl: values['base-url'],
  });
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${path}`);
}
