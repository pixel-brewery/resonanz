import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, open, readdir, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SessionStore } from '@resonanz/sessions';
import { FileTranscriptionCoordinator } from './FileTranscriptionCoordinator.js';
import type { IPcmWaveFile } from './PcmWaveFile.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup() {
  await mkdir('.codex-work/file-transcription-tests', { recursive: true });
  const root = await mkdtemp(resolve('.codex-work/file-transcription-tests/run-'));
  roots.push(root);
  const store = new SessionStore(root);
  await store.initialize();
  const created = await store.create({ kind: 'recording', mimeType: 'audio/wav' });
  await store.appendAudio({
    sessionId: created.id,
    sequence: 1,
    bytes: Uint8Array.of(1, 2, 3),
    mimeType: 'audio/wav',
    elapsedMs: 91_000,
  });
  const session = await store.finish(created.id, 91_000);
  const source = join(root, 'source.bin');
  await writeFile(source, 'controlled original');
  const release = vi.fn(async () => undefined);
  const speech = {
    fileLease: vi.fn(async () => release),
    prepareFile: vi.fn(async (_source: string, path: string) => {
      const frames = 91 * 16000;
      const header = Buffer.alloc(44);
      header.write('RIFF');
      header.writeUInt32LE(36 + frames * 2, 4);
      header.write('WAVEfmt ', 8);
      header.writeUInt32LE(16, 16);
      header.writeUInt16LE(1, 20);
      header.writeUInt16LE(1, 22);
      header.writeUInt32LE(16000, 24);
      header.writeUInt32LE(32000, 28);
      header.writeUInt16LE(2, 32);
      header.writeUInt16LE(16, 34);
      header.write('data', 36);
      header.writeUInt32LE(frames * 2, 40);
      await writeFile(path, header);
      const file = await open(path, 'r+');
      await file.truncate(44 + frames * 2);
      await file.close();
    }),
    transcribeChunk: vi.fn(
      async (
        _pcm: IPcmWaveFile,
        _locale: string,
        start: number,
        _frames: number,
        _signal: AbortSignal,
      ) => [
        {
          id: 'native',
          speaker: 'participant' as const,
          final: true,
          text: `Recognized at ${start}`,
          startMs: 2500,
          endMs: 2800,
        },
      ],
    ),
  };
  const coordinator = new FileTranscriptionCoordinator({
    directory: join(root, 'transcription'),
    speech,
    store,
  });
  return { root, store, session, source, speech, release, coordinator };
}

describe('native file transcription coordination', () => {
  it('reserves preparation before its first read so manual replacement can cancel the entire request', async () => {
    const c = await setup();
    let proceed!: () => void;
    const gate = new Promise<void>((resolve) => {
      proceed = resolve;
    });
    const request = c.coordinator.request(c.session.id, async (signal, transcribe) => {
      await gate;
      signal.throwIfAborted();
      return transcribe(c.session, c.source, 'de-DE');
    });
    const rejected = expect(request).rejects.toThrow('transcriptionInterrupted');
    const cancellation = c.coordinator.cancel(c.session.id);
    proceed();
    await cancellation;
    await rejected;
    expect(c.speech.prepareFile).not.toHaveBeenCalled();
    expect(c.speech.fileLease).not.toHaveBeenCalled();
  });
  it('resumes the durable journal after interruption and keeps global offsets and unique IDs', async () => {
    const c = await setup();
    let first = true;
    c.speech.transcribeChunk.mockImplementation(async (_pcm, _locale, start) => {
      if (start > 0 && first) {
        first = false;
        throw new Error('native interruption');
      }
      return [
        {
          id: 'word',
          speaker: 'participant',
          final: true,
          text: 'Actual chunk result',
          startMs: start === 0 ? 500 : 2100,
          endMs: start === 0 ? 900 : 2400,
        },
      ];
    });
    await expect(c.coordinator.run(c.session, c.source, 'de-DE')).rejects.toThrow(
      'native interruption',
    );
    expect(c.store.get(c.session.id).transcript).toEqual([]);
    expect(c.store.get(c.session.id).pipeline?.transcription?.progress).toBeCloseTo(100 / 3);
    const finished = await c.coordinator.run(c.session, c.source, 'de-DE');
    expect(c.speech.transcribeChunk.mock.calls.map((call) => call[2])).toEqual([
      0,
      43 * 16000,
      43 * 16000,
      88 * 16000,
    ]);
    expect(finished.transcript.map((segment) => segment.startMs)).toEqual([500, 45_100, 90_100]);
    expect(new Set(finished.transcript.map((segment) => segment.id)).size).toBe(3);
    expect(finished.pipeline?.transcription?.state).toBe('done');
    expect(c.release).toHaveBeenCalledTimes(2);
    expect(await readdir(join(c.root, 'transcription'))).toEqual([]);
  });
  it('does not overlap jobs and waits for a cancelled native call before releasing its lease', async () => {
    const c = await setup();
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    c.speech.transcribeChunk.mockImplementation(async (_pcm, _locale, _start, _frames, signal) => {
      entered();
      await new Promise((_, reject) =>
        signal.addEventListener('abort', () => reject(signal.reason), { once: true }),
      );
      return [];
    });
    const result = c.coordinator.run(c.session, c.source, 'de-DE');
    expect(c.coordinator.run(c.session, c.source, 'de-DE')).toBe(result);
    await started;
    await expect(
      c.coordinator.run({ ...c.session, id: 'different-session' }, c.source, 'de-DE'),
    ).rejects.toThrow('fileTranscriptionRunning');
    const failed = expect(result).rejects.toThrow('transcriptionInterrupted');
    await c.coordinator.cancel(c.session.id);
    await failed;
    expect(c.release).toHaveBeenCalledOnce();
    expect(c.store.get(c.session.id).pipeline?.transcription?.state).toBe('failed');
    expect(await readdir(join(c.root, 'transcription'))).toEqual([]);
  });
});
