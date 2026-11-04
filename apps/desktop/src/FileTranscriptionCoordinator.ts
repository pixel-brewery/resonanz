// #region Imports
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { ISession, ITranscriptSegment } from '@resonanz/contracts';
import type { BackgroundService } from './BackgroundService.js';
import type { NativeSpeechService } from './NativeSpeechService.js';
import { inspectPcmWave, transcriptionSampleRate } from './PcmWaveFile.js';
// #endregion

interface IFileTranscriptionHost {
  readonly directory: string;
  readonly speech: Pick<NativeSpeechService, 'fileLease' | 'prepareFile' | 'transcribeChunk'>;
  readonly store: Pick<BackgroundService, 'transcription'>;
}

const coreFrames = 45 * transcriptionSampleRate;
const contextFrames = 2 * transcriptionSampleRate;

/** Owns one bounded native file job and acknowledges each durable chunk before continuing. */
export class FileTranscriptionCoordinator {
  private readonly _host: IFileTranscriptionHost;
  private _active:
    | {
        readonly sessionId: string;
        readonly controller: AbortController;
        readonly result: Promise<ISession>;
      }
    | undefined;

  public constructor(host: IFileTranscriptionHost) {
    this._host = host;
  }

  /** Shares a retry for the same session and rejects overlapping recording jobs. */
  public run(session: ISession, source: string, locale: string): Promise<ISession> {
    return this.request(session.id, (_signal, transcribe) => transcribe(session, source, locale));
  }

  /** Reserves the complete host request before its first asynchronous read or state change. */
  public request(
    sessionId: string,
    operation: (
      signal: AbortSignal,
      transcribe: (session: ISession, source: string, locale: string) => Promise<ISession>,
    ) => Promise<ISession>,
  ): Promise<ISession> {
    if (this._active?.sessionId === sessionId) return this._active.result;
    if (this._active)
      return Promise.reject(new Error('loc.resonanz.error.fileTranscriptionRunning'));
    const controller = new AbortController();
    const result = operation(controller.signal, (session, source, locale) =>
      this.perform(session, source, locale, controller.signal),
    ).finally(() => {
      if (this._active?.result === result) this._active = undefined;
    });
    this._active = { sessionId, controller, result };
    return result;
  }

  /** Cancellation waits for native exit and the final checkpoint write. */
  public async cancel(sessionId?: string): Promise<void> {
    const active = this._active;
    if (!active || (sessionId !== undefined && active.sessionId !== sessionId)) return;
    active.controller.abort(new Error('loc.resonanz.error.transcriptionInterrupted'));
    await active.result.catch(() => undefined);
  }

  private async perform(
    session: ISession,
    source: string,
    locale: string,
    signal: AbortSignal,
  ): Promise<ISession> {
    const release = await this._host.speech.fileLease();
    let directory: string | undefined;
    let generation: string | undefined;
    try {
      signal.throwIfAborted();
      await mkdir(this._host.directory, { recursive: true, mode: 0o700 });
      directory = await mkdtemp(join(this._host.directory, 'file-'));
      const hash = createHash('sha256');
      for await (const block of createReadStream(source, { signal })) hash.update(block);
      const path = join(directory, 'input.wav');
      await this._host.speech.prepareFile(source, path, locale, signal);
      const pcm = await inspectPcmWave(path);
      const totalChunks = Math.ceil(pcm.frames / coreFrames);
      const begun = await this._host.store.transcription({
        action: 'begin',
        sessionId: session.id,
        sourceHash: hash.digest('hex'),
        locale,
        plan: 'pcm16-v1',
        totalChunks,
      });
      generation = begun.generation;
      for (let index = begun.nextChunk; index < totalChunks; index++) {
        signal.throwIfAborted();
        const start = Math.max(0, index * coreFrames - contextFrames);
        const end = Math.min(pcm.frames, (index + 1) * coreFrames + contextFrames);
        const recognized = await this._host.speech.transcribeChunk(
          pcm,
          locale,
          start,
          end - start,
          signal,
        );
        signal.throwIfAborted();
        const lower = (index * coreFrames * 1000) / transcriptionSampleRate;
        const upper =
          (Math.min(pcm.frames, (index + 1) * coreFrames) * 1000) / transcriptionSampleRate;
        const offset = (start * 1000) / transcriptionSampleRate;
        const segments: ITranscriptSegment[] = recognized
          .map((segment, position) => ({
            ...segment,
            id: `file-${index}-${position}`,
            startMs: Math.max(0, offset + segment.startMs),
            endMs: Math.min((pcm.frames * 1000) / transcriptionSampleRate, offset + segment.endMs),
          }))
          // Each overlap has one owner, selected by the segment's midpoint on the original timeline.
          .filter((segment) => {
            const middle = (segment.startMs + segment.endMs) / 2;
            return (
              segment.text.trim() &&
              middle >= lower &&
              (middle < upper || (index === totalChunks - 1 && middle <= upper))
            );
          });
        await this._host.store.transcription({
          action: 'chunk',
          sessionId: session.id,
          generation,
          index,
          segments,
        });
      }
      signal.throwIfAborted();
      return await this._host.store.transcription({
        action: 'complete',
        sessionId: session.id,
        generation,
      });
    } catch (cause) {
      if (generation)
        await this._host.store
          .transcription({ action: 'cancel', sessionId: session.id, generation })
          .catch(() => undefined);
      throw signal.aborted ? signal.reason : cause;
    } finally {
      try {
        if (directory) await rm(directory, { recursive: true, force: true });
      } catch {
        // A temporary-file cleanup failure must not revoke a durably committed transcript.
        process.stderr.write('[resonanz] Transcription temporary-file cleanup failed.\n');
      } finally {
        await release();
      }
    }
  }
}
