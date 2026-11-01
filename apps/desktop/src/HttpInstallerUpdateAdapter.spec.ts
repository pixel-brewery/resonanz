// #region Imports
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpInstallerUpdateAdapter } from './HttpInstallerUpdateAdapter.js';
import type { IInstallerUpdate } from './IInstallerUpdate.js';
// #endregion

const temporaryRoots: string[] = [];

async function downloadRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'resonanz-installer-spec-'));
  temporaryRoots.push(root);
  return join(root, 'updates');
}

function streamedResponse(chunks: readonly Uint8Array[], init?: ResponseInit): Response {
  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    init,
  );
}

function installerFor(
  content: Uint8Array,
  overrides: Partial<IInstallerUpdate> = {},
): IInstallerUpdate {
  return {
    version: '0.1.11',
    downloadUrl:
      'https://github.com/pixel-brewery/resonanz/releases/download/v0.1.11/Resonanz-darwin-arm64-0.1.11.dmg',
    fileName: 'Resonanz-darwin-arm64-0.1.11.dmg',
    bytes: content.byteLength,
    sha256: createHash('sha256').update(content).digest('hex'),
    ...overrides,
  };
}

function manifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    version: '0.1.11',
    platform: 'darwin',
    architecture: 'arm64',
    artifact: {
      name: 'Resonanz-darwin-arm64-0.1.11.dmg',
      bytes: 123,
      sha256: 'a'.repeat(64),
      url: 'https://github.com/pixel-brewery/resonanz/releases/download/v0.1.11/Resonanz-darwin-arm64-0.1.11.dmg',
    },
    ...overrides,
  };
}

describe('HttpInstallerUpdateAdapter', () => {
  afterEach(async () => {
    await Promise.all(
      temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it('returns a validated installer for the requested runtime target', async () => {
    // arrange
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Promise.resolve(Response.json(manifest())),
    );
    const adapter = new HttpInstallerUpdateAdapter(fetchImplementation);

    // act
    const result = await adapter.check({
      url: 'https://updates.example.com/channels/stable/darwin/arm64/installer.json',
      platform: 'darwin',
      architecture: 'arm64',
    });

    // assert
    expect(result).toEqual({
      version: '0.1.11',
      downloadUrl:
        'https://github.com/pixel-brewery/resonanz/releases/download/v0.1.11/Resonanz-darwin-arm64-0.1.11.dmg',
      fileName: 'Resonanz-darwin-arm64-0.1.11.dmg',
      bytes: 123,
      sha256: 'a'.repeat(64),
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://updates.example.com/channels/stable/darwin/arm64/installer.json',
      expect.objectContaining({ redirect: 'follow' }),
    );
  });

  it('returns no installer when the channel manifest has not been published yet', async () => {
    // arrange
    const adapter = new HttpInstallerUpdateAdapter(
      vi.fn<typeof fetch>(async () => Promise.resolve(new Response('', { status: 404 }))),
    );

    // act
    const result = await adapter.check({
      url: 'https://updates.example.com/channels/stable/darwin/arm64/installer.json',
      platform: 'darwin',
      architecture: 'arm64',
    });

    // assert
    expect(result).toBeUndefined();
  });

  it('rejects a manifest for another target or an untrusted download URL', async () => {
    // arrange
    const wrongTarget = new HttpInstallerUpdateAdapter(
      vi.fn<typeof fetch>(async () => Promise.resolve(Response.json(manifest()))),
    );
    const credentialUrl = new HttpInstallerUpdateAdapter(
      vi.fn<typeof fetch>(async () =>
        Promise.resolve(
          Response.json(
            manifest({
              artifact: {
                name: 'Resonanz.dmg',
                bytes: 123,
                sha256: 'a'.repeat(64),
                url: 'https://user:secret@example.com/Resonanz.dmg',
              },
            }),
          ),
        ),
      ),
    );
    const feed = {
      url: 'https://updates.example.com/channels/stable/darwin/arm64/installer.json',
      platform: 'darwin' as const,
      architecture: 'arm64',
    };

    // act
    const targetCheck = wrongTarget.check({ ...feed, architecture: 'x64' });
    const urlCheck = credentialUrl.check(feed);

    // assert
    await expect(targetCheck).rejects.toThrow(/does not match/u);
    await expect(urlCheck).rejects.toThrow(/untrusted download URL/u);
  });

  it('rejects an artifact name that could leave the download directory', async () => {
    // arrange
    const adapter = new HttpInstallerUpdateAdapter(
      vi.fn<typeof fetch>(async () =>
        Promise.resolve(
          Response.json(
            manifest({
              artifact: {
                name: '../Resonanz.dmg',
                bytes: 123,
                sha256: 'a'.repeat(64),
                url: 'https://example.com/..%2FResonanz.dmg',
              },
            }),
          ),
        ),
      ),
    );

    // act
    const check = adapter.check({
      url: 'https://updates.example.com/channels/stable/darwin/arm64/installer.json',
      platform: 'darwin',
      architecture: 'arm64',
    });

    // assert
    await expect(check).rejects.toThrow();
  });

  it('streams the installer into a private file, reports progress and removes earlier downloads', async () => {
    // arrange
    const root = await downloadRoot();
    await mkdir(join(root, '0.1.10-old'), { recursive: true });
    await writeFile(join(root, '0.1.10-old', 'Resonanz.dmg'), 'stale');
    const content = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      streamedResponse([content.slice(0, 4), content.slice(4)]),
    );
    const adapter = new HttpInstallerUpdateAdapter(fetchImplementation, { downloadRoot: root });
    const progress: number[] = [];

    // act
    const filePath = await adapter.download(installerFor(content), {
      onProgress: (receivedBytes) => progress.push(receivedBytes),
    });

    // assert
    expect(fetchImplementation).toHaveBeenCalledWith(
      'https://github.com/pixel-brewery/resonanz/releases/download/v0.1.11/Resonanz-darwin-arm64-0.1.11.dmg',
      expect.objectContaining({ redirect: 'follow' }),
    );
    expect(progress).toEqual([4, 10]);
    expect(dirname(dirname(filePath))).toBe(root);
    expect(new Uint8Array(await readFile(filePath))).toEqual(content);
    // Windows has no POSIX permission bits: Node reports every writable file as 0o666 there.
    expect((await stat(filePath)).mode & 0o777).toBe(process.platform === 'win32' ? 0o666 : 0o600);
    expect(await readdir(root)).toEqual([basename(dirname(filePath))]);
  });

  it.each([
    {
      mismatch: 'more bytes than declared',
      chunks: [new Uint8Array([1, 2, 3, 4, 5, 6])],
      expected: /larger than the update manifest/u,
    },
    {
      mismatch: 'fewer bytes than declared',
      chunks: [new Uint8Array([1, 2, 3, 4])],
      expected: /size does not match/u,
    },
    {
      mismatch: 'a different checksum',
      chunks: [new Uint8Array([5, 4, 3, 2, 1])],
      expected: /checksum does not match/u,
    },
  ])('deletes the download when it has $mismatch', async ({ chunks, expected }) => {
    // arrange
    const root = await downloadRoot();
    const declared = new Uint8Array([1, 2, 3, 4, 5]);
    const adapter = new HttpInstallerUpdateAdapter(
      vi.fn<typeof fetch>(async () => streamedResponse(chunks)),
      { downloadRoot: root },
    );

    // act
    const download = adapter.download(installerFor(declared), { onProgress: () => undefined });

    // assert
    await expect(download).rejects.toThrow(expected);
    expect(await readdir(root)).toEqual([]);
  });

  it('rejects a declared content length that differs from the manifest before writing', async () => {
    // arrange
    const root = await downloadRoot();
    const content = new Uint8Array([1, 2, 3]);
    const adapter = new HttpInstallerUpdateAdapter(
      vi.fn<typeof fetch>(async () =>
        streamedResponse([content], { headers: { 'content-length': '99' } }),
      ),
      { downloadRoot: root },
    );
    const onProgress = vi.fn();

    // act
    const download = adapter.download(installerFor(content), { onProgress });

    // assert
    await expect(download).rejects.toThrow(/size does not match/u);
    expect(onProgress).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual([]);
  });

  it('removes a partial download when the caller cancels it', async () => {
    // arrange
    const root = await downloadRoot();
    const content = new Uint8Array([1, 2, 3, 4]);
    const controller = new AbortController();
    const adapter = new HttpInstallerUpdateAdapter(
      vi.fn<typeof fetch>(async (_input, init) => {
        const signal = init?.signal;
        return new Response(
          new ReadableStream<Uint8Array>({
            start(stream) {
              stream.enqueue(content.slice(0, 2));
              signal?.addEventListener('abort', () => stream.error(new Error('aborted')));
            },
          }),
        );
      }),
      { downloadRoot: root },
    );

    // act
    const download = adapter.download(installerFor(content), {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });

    // assert
    await expect(download).rejects.toThrow();
    expect(await readdir(root)).toEqual([]);
  });

  it('opens only installers below its download root and reports opener failures', async () => {
    // arrange
    const root = await downloadRoot();
    const installerPath = join(root, '0.1.11-abc', 'Resonanz.dmg');
    const openPath = vi
      .fn<(path: string) => Promise<string>>()
      .mockResolvedValueOnce('')
      .mockResolvedValueOnce('The disk image could not be opened.');
    const adapter = new HttpInstallerUpdateAdapter(vi.fn<typeof fetch>(), {
      downloadRoot: root,
      openPath,
    });

    // act
    const opened = adapter.launch(installerPath);
    const failed = adapter.launch(installerPath);
    const outside = adapter.launch(join(tmpdir(), 'Resonanz.dmg'));

    // assert
    await expect(opened).resolves.toBeUndefined();
    await expect(failed).rejects.toThrow('The disk image could not be opened.');
    await expect(outside).rejects.toThrow(/Only installers Resonanz downloaded/u);
    expect(openPath).toHaveBeenCalledTimes(2);
    expect(existsSync(installerPath)).toBe(false);
  });
});
