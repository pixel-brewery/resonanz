// #region Imports
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, open, readdir, rm, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, isAbsolute } from 'node:path';
import { z } from 'zod';
import type { IInstallerUpdate } from './IInstallerUpdate.js';
import type { IInstallerUpdateAdapter } from './IInstallerUpdateAdapter.js';
// #endregion

const numericVersionSchema = z
  .string()
  .max(17)
  .regex(/^\d+\.\d+\.\d+$/u)
  .refine((version) => version.split('.').every((part) => Number(part) <= 65_535));
const installerUpdateManifestSchema = z.object({
  schemaVersion: z.literal(1),
  version: numericVersionSchema,
  platform: z.enum(['darwin', 'win32', 'linux']),
  architecture: z.string().min(1).max(30),
  artifact: z.object({
    // A single file name: it becomes the downloaded file inside Resonanz's update directory.
    name: z
      .string()
      .min(1)
      .max(255)
      .regex(/^[A-Za-z0-9][A-Za-z0-9 ._+-]*$/u),
    bytes: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    sha256: z.string().regex(/^[a-f0-9]{64}$/u),
    url: z.url(),
  }),
});
const DEFAULT_DOWNLOAD_ROOT = join(tmpdir(), 'resonanz-updates');
const DEFAULT_STALL_TIMEOUT_MS = 60_000;

/**
 * Reads the update manifest over credential-free HTTPS and downloads the advertised installer
 * into a Resonanz-owned temporary directory, enforcing the declared size and SHA-256. The same
 * installer path as Symphony's desktop updates.
 *
 * @public
 */
export class HttpInstallerUpdateAdapter implements IInstallerUpdateAdapter {
  private readonly _fetchImplementation: typeof fetch;
  private readonly _downloadRoot: string;
  private readonly _openPath: (path: string) => Promise<string>;
  private readonly _stallTimeoutMilliseconds: number;

  /**
   * Creates an installer update adapter.
   *
   * @param fetchImplementation - Fetch implementation used for the manifest and the download.
   * @param options - Download directory owned by Resonanz, the operating-system opener (Electron's
   * `shell.openPath`, which resolves to an error message or an empty string), and the time a
   * download may receive no data before it is abandoned.
   * @public
   */
  public constructor(
    fetchImplementation: typeof fetch = globalThis.fetch,
    options: {
      readonly downloadRoot?: string;
      readonly openPath?: (path: string) => Promise<string>;
      readonly stallTimeoutMilliseconds?: number;
    } = {},
  ) {
    this._fetchImplementation = fetchImplementation;
    this._downloadRoot = options.downloadRoot ?? DEFAULT_DOWNLOAD_ROOT;
    this._openPath =
      options.openPath ??
      (() => Promise.resolve('Opening downloaded installers is not configured.'));
    this._stallTimeoutMilliseconds = options.stallTimeoutMilliseconds ?? DEFAULT_STALL_TIMEOUT_MS;
  }

  /**
   * Checks the update manifest.
   *
   * @param feed - Trusted manifest location and expected runtime target.
   * @returns The advertised installer, or `undefined` when no manifest is published.
   * @public
   */
  public async check(feed: {
    readonly url: string;
    readonly platform: NodeJS.Platform;
    readonly architecture: string;
  }): Promise<IInstallerUpdate | undefined> {
    const response = await this._fetchImplementation(feed.url, {
      headers: { accept: 'application/json' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`The update manifest responded with ${response.status}.`);

    const manifest = installerUpdateManifestSchema.parse(await response.json());
    if (manifest.platform !== feed.platform || manifest.architecture !== feed.architecture) {
      throw new Error('The update manifest does not match this application build.');
    }
    const downloadUrl = this.trustedDownloadUrl(manifest.artifact.url);
    const expectedSuffix = { darwin: '.dmg', win32: '.exe', linux: '.deb' }[manifest.platform];
    const urlName = decodeURIComponent(downloadUrl.pathname.split('/').at(-1) ?? '');
    if (!manifest.artifact.name.endsWith(expectedSuffix) || urlName !== manifest.artifact.name) {
      throw new Error('The update manifest contains an invalid platform artifact.');
    }
    return {
      version: manifest.version,
      downloadUrl: downloadUrl.toString(),
      fileName: manifest.artifact.name,
      bytes: manifest.artifact.bytes,
      sha256: manifest.artifact.sha256,
    };
  }

  /**
   * Streams the installer into a fresh directory below the download root, reporting received
   * bytes. Earlier downloads are removed first. The file is kept only when it has exactly the
   * declared byte count and SHA-256 digest; on any failure or cancellation it is deleted.
   *
   * @param installer - Installer returned by {@link HttpInstallerUpdateAdapter.check}.
   * @param options - Progress callback in received bytes and an optional cancellation signal.
   * @returns The absolute path of the verified installer.
   * @public
   */
  public async download(
    installer: IInstallerUpdate,
    options: {
      readonly onProgress: (receivedBytes: number) => void;
      readonly signal?: AbortSignal;
    },
  ): Promise<string> {
    const source = this.trustedDownloadUrl(installer.downloadUrl);
    if (!/^[A-Za-z0-9][A-Za-z0-9 ._+-]*$/u.test(installer.fileName)) {
      throw new Error('The installer update has an invalid file name.');
    }
    await mkdir(this._downloadRoot, { recursive: true, mode: 0o700 });
    await this.removePreviousDownloads();
    const directory = await mkdtemp(join(this._downloadRoot, `${installer.version}-`));
    const filePath = join(directory, installer.fileName);
    const stall = new AbortController();
    let stallTimer = setTimeout(() => stall.abort(), this._stallTimeoutMilliseconds);
    const signal = options.signal ? AbortSignal.any([options.signal, stall.signal]) : stall.signal;
    let file: FileHandle | undefined;
    try {
      const response = await this._fetchImplementation(source.toString(), {
        headers: { accept: 'application/octet-stream' },
        redirect: 'follow',
        signal,
      });
      if (!response.ok || !response.body) {
        throw new Error(`The installer download responded with ${response.status}.`);
      }
      if (response.url && new URL(response.url).protocol !== 'https:') {
        throw new Error('The installer download was redirected away from HTTPS.');
      }
      const declaredLength = response.headers.get('content-length');
      if (
        declaredLength !== null &&
        !response.headers.has('content-encoding') &&
        Number(declaredLength) !== installer.bytes
      ) {
        throw new Error('The installer download size does not match the update manifest.');
      }

      file = await open(filePath, 'wx', 0o600);
      const hash = createHash('sha256');
      const reader = response.body.getReader();
      let receivedBytes = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        receivedBytes += value.byteLength;
        if (receivedBytes > installer.bytes) {
          await reader.cancel().catch(() => undefined);
          throw new Error('The installer download is larger than the update manifest declares.');
        }
        hash.update(value);
        await file.write(value);
        clearTimeout(stallTimer);
        stallTimer = setTimeout(() => stall.abort(), this._stallTimeoutMilliseconds);
        options.onProgress(receivedBytes);
      }
      if (receivedBytes !== installer.bytes) {
        throw new Error('The installer download size does not match the update manifest.');
      }
      if (hash.digest('hex') !== installer.sha256) {
        throw new Error('The installer download checksum does not match the update manifest.');
      }
      await file.close();
      file = undefined;
      return filePath;
    } catch (cause) {
      await file?.close().catch(() => undefined);
      await rm(directory, { recursive: true, force: true });
      throw cause;
    } finally {
      clearTimeout(stallTimer);
    }
  }

  /**
   * Opens a downloaded installer with the operating system.
   *
   * @param filePath - Path returned by {@link HttpInstallerUpdateAdapter.download}.
   * @public
   */
  public async launch(filePath: string): Promise<void> {
    const location = relative(this._downloadRoot, dirname(filePath));
    if (!location || location.startsWith('..') || isAbsolute(location)) {
      throw new Error('Only installers Resonanz downloaded can be opened.');
    }
    const failure = await this._openPath(filePath);
    if (failure) throw new Error(failure);
  }

  private trustedDownloadUrl(rawUrl: string): URL {
    const downloadUrl = new URL(rawUrl);
    if (
      downloadUrl.protocol !== 'https:' ||
      downloadUrl.username ||
      downloadUrl.password ||
      downloadUrl.search ||
      downloadUrl.hash
    ) {
      throw new Error('The update manifest contains an untrusted download URL.');
    }
    return downloadUrl;
  }

  private async removePreviousDownloads(): Promise<void> {
    const entries = await readdir(this._downloadRoot).catch(() => []);
    await Promise.all(
      entries.map((entry) =>
        rm(join(this._downloadRoot, entry), { recursive: true, force: true }).catch(
          () => undefined,
        ),
      ),
    );
  }
}
