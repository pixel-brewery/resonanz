import { translate, uiLanguage } from '@resonanz/intl';
// #region Imports
import { createHash, randomUUID } from 'node:crypto';
import { basename, extname, join } from 'node:path';
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  readdir,
  rm,
  stat,
  open,
  copyFile,
  lstat,
  opendir,
  rmdir,
} from 'node:fs/promises';
import { z } from 'zod';
import { recordingFileName } from './recordingFileName.js';
import type { IStoredSession } from './IStoredSession.js';
import {
  dataSchemas,
  assistantConfigurationKey,
  defaultSettings,
  isUserAssignee,
  type ISession,
  type ISessionSummary,
  type ICollection,
  type ISettings,
  type ITranscriptSegment,
  type IQuestionMessage,
  type RequestPayload,
  type ISessionAnalysis,
  type IStorageUsage,
  type ResponsePayload,
  type IProcessingStep,
} from '@resonanz/contracts';
// #endregion

const recordSchema = z.object({
  version: z.literal(1),
  session: dataSchemas.session,
  continuations: z.record(z.string(), z.string().max(100_000)).default({}),
  analysisRetry: z
    .object({
      id: dataSchemas.identifier,
      binding: z.string().regex(/^[a-f0-9]{64}$/u),
      dueAt: dataSchemas.timestamp,
      attempt: z.number().int().min(1).max(5),
    })
    .optional(),
});
const catalogSchema = z.object({
  version: z.literal(1),
  settings: dataSchemas.settings,
  collections: z.array(dataSchemas.collection).max(200),
});
const maximumAudioBytes = 512 * 1024 * 1024;
const maximumStorageEntries = 500_000;
interface IManagedFile {
  readonly path: string;
  readonly bytes: number;
}
interface IStorageScan {
  entries: number;
}
const supportedAudio = new Map([
  ['.webm', 'audio/webm'],
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.m4a', 'audio/mp4'],
  ['.mp4', 'audio/mp4'],
  ['.ogg', 'audio/ogg'],
  ['.flac', 'audio/flac'],
]);

/**
 * Durable session catalog and ordered chunk journal owned by the Utility Process.
 *
 * @public
 */
export class SessionStore {
  /** Maximum expired recordings removed by one explicitly bounded maintenance pass. */
  public static readonly retentionBatchSize = 32;
  // #region Fields
  private readonly _root: string;
  private readonly _records = new Map<string, IStoredSession>();
  private _collections: readonly ICollection[] = [];
  private _settings: ISettings = defaultSettings;
  private _tail: Promise<unknown> = Promise.resolve();
  // #endregion
  // #region Ctor
  /**
   * Creates a store beneath the host-owned application data directory.
   *
   * @public
   */
  public constructor(userDataDirectory: string) {
    this._root = join(userDataDirectory, 'library');
  }
  // #endregion
  // #region Properties
  /**
   * Returns current non-secret configuration.
   *
   * @public
   */
  public get settings(): ISettings {
    return structuredClone(this._settings);
  }
  /**
   * Returns the collection catalog.
   *
   * @public
   */
  public get collections(): readonly ICollection[] {
    return structuredClone(this._collections);
  }
  // #endregion
  // #region Methods
  /**
   * Loads valid records, recovers journaled audio and marks interrupted work honestly.
   *
   * @public
   */
  public async initialize(): Promise<void> {
    await mkdir(join(this._root, 'sessions'), { recursive: true, mode: 0o700 });
    await mkdir(join(this._root, 'audio'), { recursive: true, mode: 0o700 });
    try {
      const catalog = catalogSchema.parse(
        JSON.parse(await readFile(join(this._root, 'catalog.json'), 'utf8')),
      );
      this._settings = catalog.settings;
      this._collections = catalog.collections;
    } catch (cause) {
      if (!this.isMissing(cause)) throw new Error('loc.resonanz.error.libraryRead', { cause });
    }
    const names = (await readdir(join(this._root, 'sessions'))).filter((name) =>
      /^[a-f0-9-]+\.json$/u.test(name),
    );
    if (names.length > 5000) throw new Error('loc.resonanz.error.libraryLimit');
    for (const name of names) {
      const record = recordSchema.parse(
        JSON.parse(await readFile(join(this._root, 'sessions', name), 'utf8')),
      );
      if (name !== `${record.session.id}.json`) throw new Error('loc.resonanz.error.sessionKey');
      this._records.set(record.session.id, record);
      if (['recording', 'paused', 'processing'].includes(record.session.status)) {
        await this.recoverChunks(record.session.id);
        const recovered = this.requireRecord(record.session.id);
        recovered.session = {
          ...recovered.session,
          status: 'interrupted',
          updatedAt: new Date().toISOString(),
        };
        await this.persist(recovered);
        if (recovered.session.audioBytes > 0 && !recovered.session.audioAvailable)
          await this.materializeAudio(recovered.session.id);
      }
      const current = this.requireRecord(record.session.id);
      if (Object.values(current.session.pipeline ?? {}).some((step) => step?.state === 'running')) {
        current.session = {
          ...current.session,
          pipeline: Object.fromEntries(
            Object.entries(current.session.pipeline ?? {}).map(([stage, step]) => [
              stage,
              step?.state === 'running' ? this.detachedProcessingStep(step) : step,
            ]),
          ),
          updatedAt: new Date().toISOString(),
        };
        await this.persist(current);
      }
    }
    await this.persistCatalog();
  }
  /**
   * Lists metadata without loading transcript or question content into the library view.
   *
   * @public
   */
  public list(): readonly ISessionSummary[] {
    return [...this._records.values()]
      .map((record) => {
        const session = record.session;
        const {
          transcript: _transcript,
          messages: _messages,
          summary: _summary,
          nextAudioSequence: _sequence,
          audioUrl: _url,
          error: _error,
          analysis,
          moments,
          ...metadata
        } = session;
        return structuredClone({
          ...metadata,
          pipeline: this.publicPipeline(record),
          transcriptAvailable: _transcript.some((s) => !!s.text.trim()),
          insightCounts: {
            decisions: analysis?.decisions.length ?? 0,
            tasks: analysis?.tasks.length ?? 0,
            questions: analysis?.openQuestions.length ?? 0,
            moments: moments?.length ?? 0,
            forMe:
              analysis?.tasks.filter((task) =>
                isUserAssignee(
                  task.assignee,
                  this._settings.userName ?? '',
                  this._settings.addressedAs ?? '',
                ),
              ).length ?? 0,
          },
        });
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
  /**
   * Reads an existing public session without exposing private paths or continuations.
   *
   * @public
   */
  public get(sessionId: string): ISession {
    const record = this.requireRecord(sessionId);
    const session = record.session;
    return structuredClone({
      ...session,
      pipeline: this.publicPipeline(record),
      audioUrl: session.audioAvailable ? this.audioUrl(session.id) : null,
    });
  }
  /** Lists only authorized, failed analysis work; reads never enqueue or repair it. */
  public analysisRetries(): readonly {
    readonly id: string;
    readonly sessionId: string;
    readonly dueAt: string;
    readonly attempt: number;
  }[] {
    return [...this._records.values()].flatMap((record) =>
      this.hasAnalysisRetry(record) && record.analysisRetry
        ? [
            {
              id: record.analysisRetry.id,
              sessionId: record.session.id,
              dueAt: record.analysisRetry.dueAt,
              attempt: record.analysisRetry.attempt,
            },
          ]
        : [],
    );
  }
  /** Persists a bounded retry for the current assistant binding, or explicitly cancels it. */
  public setAnalysisRetry(
    sessionId: string,
    retry: { readonly dueAt: string; readonly attempt: number } | null,
    expectedId?: string,
  ): Promise<ISession | undefined> {
    return this.serialize(async () => {
      const record = this._records.get(sessionId);
      if (!record && expectedId) return undefined;
      if (!record) throw new Error('loc.resonanz.error.sessionMissing');
      if (expectedId && record.analysisRetry?.id !== expectedId) return undefined;
      if (
        retry &&
        (record.session.pipeline?.analysis?.state !== 'failed' ||
          ['recording', 'paused'].includes(record.session.status))
      )
        return this.get(sessionId);
      const analysisRetry = retry
        ? recordSchema.shape.analysisRetry
            .unwrap()
            .parse({ ...retry, id: randomUUID(), binding: this.analysisBinding() })
        : undefined;
      await this.persist({ ...record, analysisRetry });
      record.analysisRetry = analysisRetry;
      return this.get(sessionId);
    });
  }
  /** Fences automatic admission behind earlier serialized cancellations and mutations. */
  public isCurrentAnalysisRetry(sessionId: string, expectedId: string): Promise<boolean> {
    return this.serialize(async () => {
      const record = this._records.get(sessionId);
      return !!record && record.analysisRetry?.id === expectedId && this.hasAnalysisRetry(record);
    });
  }
  /** Searches locally without sending full transcripts to the library renderer. */
  public search(query: string): readonly string[] {
    const normalized = query.toLocaleLowerCase('de-DE');
    return [...this._records.values()]
      .filter(({ session }) =>
        [session.title, ...session.tags, ...session.transcript.map((s) => s.text)].some((text) =>
          text.toLocaleLowerCase('de-DE').includes(normalized),
        ),
      )
      .map(({ session }) => session.id);
  }
  /** Measures managed logical file bytes without reading profiles or following filesystem links. */
  public storageUsage(): Promise<IStorageUsage> {
    return this.serialize(async () => {
      try {
        const scan = { entries: 0 };
        const json = await this.managedJsonFiles(scan);
        const storedPaths = new Set(json.map((file) => file.path));
        let totalBytes = json.reduce((sum, file) => sum + file.bytes, 0);
        let transcriptBytes = 0;
        let analysisBytes = 0;
        let audioBytes = 0;
        for (const { session } of this._records.values()) {
          if (!storedPaths.has(this.recordPath(session.id)))
            throw new Error('Missing managed session document.');
          transcriptBytes += Buffer.byteLength(JSON.stringify(session.transcript));
          analysisBytes +=
            Buffer.byteLength(JSON.stringify(session.summary)) +
            Buffer.byteLength(JSON.stringify(session.messages));
          if (session.analysis)
            analysisBytes += Buffer.byteLength(JSON.stringify(session.analysis));
          audioBytes += (await this.managedAudioFiles(session, scan)).reduce(
            (sum, file) => sum + file.bytes,
            0,
          );
        }
        totalBytes += audioBytes;
        return dataSchemas.storageUsage.parse({
          measuredAt: new Date().toISOString(),
          audioBytes,
          transcriptBytes,
          analysisBytes,
          metadataBytes: totalBytes - audioBytes - transcriptBytes - analysisBytes,
          totalBytes,
          sessionCount: this._records.size,
        });
      } catch (cause) {
        throw new Error('loc.resonanz.error.storageMeasure', { cause });
      }
    });
  }
  /**
   * Removes one bounded batch of expired audio while retaining every session's written content.
   * The optional observer sees committed unavailability even if later physical cleanup fails.
   */
  public cleanupAudioRetention(
    now = Date.now(),
    protectedSessionIds: ReadonlySet<string> = new Set(),
    onAudioUnavailable?: (sessionId: string) => void,
  ): Promise<ResponsePayload<'storage.cleanup'>> {
    return this.serialize(async () => {
      const days = this._settings.audioRetentionDays ?? 'never';
      if (days === 'never') return { removedAudioCount: 0, freedBytes: 0 };
      const cutoff = now - days * 86_400_000;
      if (!Number.isFinite(cutoff)) throw new Error('loc.resonanz.error.storageCleanup');
      const scan = { entries: 0 };
      let removedAudioCount = 0;
      let freedBytes = 0;
      try {
        const candidates = [...this._records.values()]
          .filter(
            (record) =>
              !protectedSessionIds.has(record.session.id) &&
              !this.sessionBusy(record.session) &&
              Date.parse(record.session.createdAt) <= cutoff,
          )
          .sort((a, b) => a.session.createdAt.localeCompare(b.session.createdAt));
        for (const record of candidates) {
          if (removedAudioCount >= SessionStore.retentionBatchSize) break;
          const files = await this.managedAudioFiles(record.session, scan);
          if (!files.length && !record.session.audioAvailable && record.session.audioBytes === 0)
            continue;
          // Persist unavailability first: a crash can leave removable files, never a playable claim for deleted audio.
          await this.commit(record, {
            ...record.session,
            audioAvailable: false,
            audioBytes: 0,
            audioUrl: null,
            nextAudioSequence: 1,
          });
          onAudioUnavailable?.(record.session.id);
          for (const file of files) {
            await rm(file.path, { force: true });
            freedBytes += file.bytes;
          }
          await this.pruneAudioDirectories(record.session.id);
          removedAudioCount++;
        }
        return { removedAudioCount, freedBytes };
      } catch (cause) {
        throw new Error('loc.resonanz.error.storageCleanup', { cause });
      }
    });
  }
  /** Explicitly clears managed library content while preserving preferences, profiles and unrelated files. */
  public clearLibrary(
    input: RequestPayload<'sessions.clear'>,
  ): Promise<ResponsePayload<'sessions.clear'>> {
    return this.serialize(async () => {
      if (input.confirm !== true) throw new Error('loc.resonanz.error.libraryConfirmation');
      if ([...this._records.values()].some((record) => this.sessionBusy(record.session)))
        throw new Error('loc.resonanz.error.libraryBusy');
      const scan = { entries: 0 };
      let deletedSessionCount = 0;
      try {
        const json = await this.managedJsonFiles(scan);
        for (const record of [...this._records.values()]) {
          for (const file of await this.managedAudioFiles(record.session, scan))
            await rm(file.path, { force: true });
          await this.pruneAudioDirectories(record.session.id);
          await rm(this.recordPath(record.session.id), { force: true });
          this._records.delete(record.session.id);
          deletedSessionCount++;
        }
        for (const file of json)
          if (file.path.endsWith('.tmp')) await rm(file.path, { force: true });
        await this.persistCatalog([]);
        this._collections = [];
        return { deletedSessionCount };
      } catch (cause) {
        throw new Error('loc.resonanz.error.libraryClear', { cause });
      }
    });
  }
  /** Journals observed pause metadata without reopening completed capture or replacing other writes. */
  public recordPause(input: RequestPayload<'sessions.pause'>): Promise<ISession> {
    return this.serialize(async () => {
      const record = this.requireRecord(input.sessionId);
      const pause = dataSchemas.pause.parse(input.pause);
      const pauses = [...(record.session.pauses ?? [])];
      const index = pauses.findIndex((previous) => previous.id === pause.id);
      const previous = pauses[index];
      if (previous) {
        if (
          previous.atMs !== pause.atMs ||
          (previous.durationMs !== undefined &&
            pause.durationMs !== undefined &&
            previous.durationMs !== pause.durationMs)
        )
          throw new Error('loc.resonanz.error.pauseChanged');
        if (previous.durationMs !== undefined || pause.durationMs === undefined)
          return this.get(input.sessionId);
        pauses[index] = pause;
      } else {
        if (
          pause.durationMs === undefined &&
          !['recording', 'paused'].includes(record.session.status)
        )
          throw new Error('loc.resonanz.error.captureFinished');
        if (pauses.length >= 1000) throw new Error('loc.resonanz.error.pauseLimit');
        pauses.push(pause);
      }
      await this.commit(record, {
        ...record.session,
        pauses: pauses.sort((a, b) => a.atMs - b.atMs),
        updatedAt: new Date().toISOString(),
      });
      return this.get(input.sessionId);
    });
  }
  /**
   * Creates a recording or live conversation in the chosen collection.
   *
   * @public
   */
  public create(input: RequestPayload<'sessions.create'>): Promise<ISession> {
    return this.serialize(async () => {
      if (this._records.size >= 5000) throw new Error('loc.resonanz.error.libraryFull');
      this.assertCollection(input.collectionId ?? null);
      const now = new Date().toISOString();
      const session: ISession = {
        id: randomUUID(),
        title:
          input.title ??
          translate(
            uiLanguage(this._settings.uiLanguage),
            input.kind === 'conversation'
              ? 'loc.resonanz.capture.newConversation'
              : 'loc.resonanz.capture.newRecording',
          ),
        kind: input.kind,
        status: 'recording',
        createdAt: now,
        updatedAt: now,
        durationMs: 0,
        mimeType: input.mimeType,
        audioBytes: 0,
        audioAvailable: false,
        starred: false,
        tags: [],
        collectionId: input.collectionId ?? null,
        transcript: [],
        messages: [],
        summary: '',
        nextAudioSequence: 1,
        audioUrl: null,
      };
      const record = { version: 1 as const, session, continuations: {} };
      await this.persist(record);
      this._records.set(session.id, record);
      return structuredClone(session);
    });
  }
  /**
   * Updates editable metadata while retaining the session's identity and media.
   *
   * @public
   */
  public update(input: RequestPayload<'sessions.update'>): Promise<ISession> {
    return this.serialize(async () => {
      const record = this.requireRecord(input.sessionId);
      if (input.collectionId !== undefined) this.assertCollection(input.collectionId);
      if (input.status && !['recording', 'paused'].includes(record.session.status))
        throw new Error('loc.resonanz.error.captureFinished');
      const { sessionId: _id, ...changes } = input;
      const next = dataSchemas.session.parse({
        ...record.session,
        ...Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)),
        ...(input.tags ? { tags: [...new Set(input.tags)] } : {}),
        updatedAt: new Date().toISOString(),
      });
      await this.commit(record, next);
      return structuredClone(record.session);
    });
  }
  /**
   * Deletes only the selected application-owned record and audio journal.
   *
   * @public
   */
  public delete(sessionId: string): Promise<void> {
    return this.serialize(async () => {
      this.requireRecord(sessionId);
      await rm(this.recordPath(sessionId), { force: true });
      this._records.delete(sessionId);
      await rm(this.audioDirectory(sessionId), { recursive: true, force: true });
    });
  }
  /**
   * Appends one bounded ordered chunk; acknowledged retries are idempotent.
   *
   * @public
   */
  public appendAudio(
    input: RequestPayload<'audio.append'>,
  ): Promise<{ sequence: number; totalBytes: number }> {
    return this.serialize(async () => {
      const record = this.requireRecord(input.sessionId);
      const session = record.session;
      if (!['recording', 'paused'].includes(session.status))
        throw new Error('loc.resonanz.error.audioClosed');
      if (input.mimeType !== session.mimeType) throw new Error('loc.resonanz.error.audioFormat');
      const bytes = Buffer.from(
        input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes),
      );
      if (bytes.byteLength === 0 || bytes.byteLength > 4 * 1024 * 1024)
        throw new Error('loc.resonanz.error.blockSize');
      const directory = join(this.audioDirectory(input.sessionId), 'chunks');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const path = join(directory, `${input.sequence.toString().padStart(8, '0')}.chunk`);
      if (input.sequence < session.nextAudioSequence) {
        const existing = await readFile(path);
        if (this.checksum(existing) !== this.checksum(bytes))
          throw new Error('loc.resonanz.error.blockChanged');
        return { sequence: input.sequence, totalBytes: session.audioBytes };
      }
      if (input.sequence !== session.nextAudioSequence)
        throw new Error('loc.resonanz.error.blockMissing');
      if (session.audioBytes + bytes.byteLength > maximumAudioBytes)
        throw new Error('loc.resonanz.error.captureLimit');
      await this.atomicWrite(path, bytes);
      await this.commit(record, {
        ...session,
        nextAudioSequence: input.sequence + 1,
        audioBytes: session.audioBytes + bytes.byteLength,
        durationMs: Math.max(session.durationMs, input.elapsedMs),
        updatedAt: new Date().toISOString(),
      });
      return { sequence: input.sequence, totalBytes: record.session.audioBytes };
    });
  }
  /**
   * Finishes the chunk journal before making its complete media file playable.
   *
   * @public
   */
  public finish(sessionId: string, durationMs: number, error?: string): Promise<ISession> {
    return this.serialize(async () => {
      const record = this.requireRecord(sessionId);
      if (record.session.audioBytes > 0) await this.materializeAudio(sessionId);
      await this.commit(record, {
        ...record.session,
        status: error ? 'error' : 'ready',
        error,
        durationMs: Math.max(record.session.durationMs, durationMs),
        updatedAt: new Date().toISOString(),
      });
      return structuredClone(record.session);
    });
  }
  /**
   * Persists an attributed final or provisional transcript fragment.
   *
   * @public
   */
  public appendTranscript(input: RequestPayload<'transcript.append'>): Promise<ISession> {
    return this.serialize(async () => {
      const record = this.requireRecord(input.sessionId);
      const segment = dataSchemas.transcriptSegment.parse({
        id: input.id ?? randomUUID(),
        speaker: input.speaker,
        text: input.text,
        startMs: input.startMs,
        endMs: input.endMs,
        final: input.final,
      });
      const index = record.session.transcript.findIndex((candidate) => candidate.id === segment.id);
      const transcript = [...record.session.transcript];
      if (index < 0) transcript.push(segment);
      else transcript[index] = segment;
      this.assertTranscript(transcript);
      await this.commit(record, {
        ...record.session,
        transcript,
        updatedAt: new Date().toISOString(),
      });
      return structuredClone(record.session);
    });
  }
  /**
   * Replaces an edited or freshly transcribed session transcript.
   *
   * @public
   */
  public replaceTranscript(
    sessionId: string,
    segments: readonly ITranscriptSegment[],
  ): Promise<ISession> {
    return this.serialize(async () => {
      this.assertTranscript(segments);
      const record = this.requireRecord(sessionId);
      const next = {
        ...record.session,
        transcript: segments,
        analysis: undefined,
        pipeline: {
          transcription: { state: 'done' as const },
          analysis: { state: 'pending' as const },
        },
        messages: record.session.messages.map(({ answer: _answer, ...message }) => message),
        updatedAt: new Date().toISOString(),
      };
      await this.persist({ ...record, session: next, continuations: {}, analysisRetry: undefined });
      record.session = next;
      record.continuations = {};
      record.analysisRetry = undefined;
      return structuredClone(record.session);
    });
  }
  /**
   * Stores a question or answer, replacing the same message during streaming.
   *
   * @public
   */
  public saveMessage(sessionId: string, message: IQuestionMessage): Promise<void> {
    return this.serialize(async () => {
      const parsed = dataSchemas.message.parse(message);
      const record = this.requireRecord(sessionId);
      const messages = [...record.session.messages];
      const index = messages.findIndex((candidate) => candidate.id === message.id);
      if (index < 0) messages.push(parsed);
      else messages[index] = parsed;
      if (messages.length > 2000) throw new Error('loc.resonanz.error.messageLimit');
      await this.commit(record, {
        ...record.session,
        messages,
        updatedAt: new Date().toISOString(),
      });
    });
  }
  /**
   * Persists an analysis after the real assistant run has completed.
   *
   * @public
   */
  public saveSummary(
    sessionId: string,
    summary: string,
    analysis?: ISessionAnalysis,
  ): Promise<void> {
    return this.serialize(async () => {
      const record = this.requireRecord(sessionId);
      await this.commit(record, {
        ...record.session,
        summary: dataSchemas.session.shape.summary.parse(summary),
        pipeline: {
          ...record.session.pipeline,
          analysis: {
            state: 'done',
            provider: analysis?.provider ?? record.session.pipeline?.analysis?.provider,
          },
        },
        ...(analysis
          ? {
              analysis: dataSchemas.analysis.parse({
                ...analysis,
                tasks: analysis.tasks.map((task) => {
                  const previous = record.session.analysis?.tasks.find(
                    (old) =>
                      old.text === task.text &&
                      old.evidence
                        .map((item) => item.segmentId)
                        .toSorted()
                        .join('\n') ===
                        task.evidence
                          .map((item) => item.segmentId)
                          .toSorted()
                          .join('\n'),
                  );
                  return previous?.completed === undefined
                    ? task
                    : { ...task, completed: previous.completed };
                }),
              }),
            }
          : { analysis: undefined }),
        updatedAt: new Date().toISOString(),
      });
    });
  }
  /** Serializes stage updates with media, transcript and metadata commits. */
  public setPipeline(input: RequestPayload<'sessions.pipeline'>): Promise<ISession> {
    return this.serialize(async () => {
      const record = this.requireRecord(input.sessionId);
      await this.commit(record, {
        ...record.session,
        pipeline: {
          ...record.session.pipeline,
          [input.stage]: dataSchemas.processingStep.parse(input.step),
        },
        updatedAt: new Date().toISOString(),
      });
      return this.get(input.sessionId);
    });
  }
  /** Changes one current analysis task without replacing concurrent media or metadata. */
  public setTaskCompleted(input: RequestPayload<'sessions.task'>): Promise<ISession> {
    return this.serialize(async () => {
      const record = this.requireRecord(input.sessionId);
      const analysis = record.session.analysis;
      if (!analysis?.tasks.some((task) => task.id === input.taskId))
        throw new Error('loc.resonanz.error.taskMissing');
      await this.commit(record, {
        ...record.session,
        analysis: {
          ...analysis,
          tasks: analysis.tasks.map((task) =>
            task.id === input.taskId ? { ...task, completed: input.completed } : task,
          ),
        },
        updatedAt: new Date().toISOString(),
      });
      return this.get(input.sessionId);
    });
  }
  /** Adds an idempotent user marker without replacing concurrently journalled audio. */
  public mark(input: RequestPayload<'sessions.mark'>): Promise<ISession> {
    return this.serialize(async () => {
      const record = this.requireRecord(input.sessionId);
      const moments = [...(record.session.moments ?? [])];
      if (!moments.some((moment) => moment.id === input.moment.id)) moments.push(input.moment);
      if (moments.length > 1000) throw new Error('loc.resonanz.error.markerLimit');
      await this.commit(record, {
        ...record.session,
        moments: moments.sort((a, b) => a.atMs - b.atMs),
        updatedAt: new Date().toISOString(),
      });
      return structuredClone(record.session);
    });
  }
  /** Removes an acknowledged capture marker idempotently without replacing audio or other moments. */
  public unmark(input: RequestPayload<'sessions.unmark'>): Promise<ISession> {
    return this.serialize(async () => {
      const record = this.requireRecord(input.sessionId);
      const moments = (record.session.moments ?? []).filter(
        (moment) => moment.id !== input.momentId,
      );
      if (moments.length === (record.session.moments ?? []).length)
        return structuredClone(record.session);
      if (!['recording', 'paused'].includes(record.session.status))
        throw new Error('loc.resonanz.error.captureChanged');
      await this.commit(record, {
        ...record.session,
        moments,
        updatedAt: new Date().toISOString(),
      });
      return structuredClone(record.session);
    });
  }
  /** Caches measured amplitudes; no synthesized waveform is accepted as a runtime check. */
  public saveWaveform(input: RequestPayload<'sessions.waveform'>): Promise<ISession> {
    return this.serialize(async () => {
      const record = this.requireRecord(input.sessionId);
      await this.commit(record, { ...record.session, waveform: input.values });
      return structuredClone(record.session);
    });
  }
  /**
   * Applies a status transition only while its expected state is still owned by the caller.
   *
   * @public
   */
  public transitionStatus(
    sessionId: string,
    expected: ISession['status'],
    status: ISession['status'],
    error?: string,
  ): Promise<boolean> {
    return this.serialize(async () => {
      const record = this.requireRecord(sessionId);
      if (record.session.status !== expected) return false;
      await this.commit(record, {
        ...record.session,
        status,
        error,
        updatedAt: new Date().toISOString(),
      });
      return true;
    });
  }
  /**
   * Retrieves a provider-scoped continuation without disclosing it to the renderer.
   *
   * @public
   */
  public getContinuation(sessionId: string, providerKey: string): string | undefined {
    return this.requireRecord(sessionId).continuations[providerKey];
  }
  /**
   * Retains an opaque native session reference for later follow-up questions.
   *
   * @public
   */
  public setContinuation(sessionId: string, providerKey: string, value: string): Promise<void> {
    return this.serialize(async () => {
      const record = this.requireRecord(sessionId);
      const continuations = { ...record.continuations, [providerKey]: value };
      await this.persist({ ...record, continuations });
      record.continuations = continuations;
    });
  }
  /**
   * Invalidates only opaque provider references after an intentional account or binding transition.
   * User transcripts, summaries, recordings and questions remain unchanged.
   *
   * @public
   */
  public clearContinuations(
    options: { readonly cancelAnalysisRetries?: boolean } = {},
  ): Promise<void> {
    return this.serialize(async () => {
      for (const record of this._records.values()) {
        if (
          Object.keys(record.continuations).length === 0 &&
          !(options.cancelAnalysisRetries && record.analysisRetry)
        )
          continue;
        const analysisRetry = options.cancelAnalysisRetries ? undefined : record.analysisRetry;
        await this.persist({ ...record, continuations: {}, analysisRetry });
        record.continuations = {};
        record.analysisRetry = analysisRetry;
      }
    });
  }
  /**
   * Creates a collection and persists the shared catalog.
   *
   * @public
   */
  public createCollection(name: string): Promise<ICollection> {
    return this.serialize(async () => {
      if (this._collections.length >= 200) throw new Error('loc.resonanz.error.collectionLimit');
      const collection = dataSchemas.collection.parse({
        id: randomUUID(),
        name,
        createdAt: new Date().toISOString(),
      });
      const collections = [...this._collections, collection];
      await this.persistCatalog(collections);
      this._collections = collections;
      return collection;
    });
  }
  /**
   * Renames the selected collection without moving its recordings.
   *
   * @public
   */
  public updateCollection(collectionId: string, name: string): Promise<ICollection> {
    return this.serialize(async () => {
      const collection = this._collections.find((item) => item.id === collectionId);
      if (!collection) throw new Error('loc.resonanz.error.collectionMissing');
      const updated = dataSchemas.collection.parse({ ...collection, name });
      const collections = this._collections.map((item) =>
        item.id === collectionId ? updated : item,
      );
      await this.persistCatalog(collections);
      this._collections = collections;
      return updated;
    });
  }
  /**
   * Removes a collection while keeping its recordings in the library.
   *
   * @public
   */
  public deleteCollection(collectionId: string): Promise<void> {
    return this.serialize(async () => {
      this.assertCollection(collectionId);
      for (const record of this._records.values())
        if (record.session.collectionId === collectionId) {
          await this.commit(record, { ...record.session, collectionId: null });
        }
      const collections = this._collections.filter((item) => item.id !== collectionId);
      await this.persistCatalog(collections);
      this._collections = collections;
    });
  }
  /**
   * Saves only validated non-secret settings.
   *
   * @public
   */
  public saveSettings(changes: Partial<ISettings>): Promise<ISettings> {
    return this.serialize(async () => {
      const settings = dataSchemas.settings.parse({ ...this._settings, ...changes });
      await this.persistCatalog(this._collections, settings);
      this._settings = settings;
      return this.settings;
    });
  }
  /**
   * Imports a user-selected supported audio file or an exported transcript document.
   *
   * @public
   */
  public importFile(path: string): Promise<ISession> {
    return this.serialize(async () => {
      const info = await stat(path);
      if (!info.isFile()) throw new Error('loc.resonanz.error.selectFile');
      const extension = extname(path).toLowerCase();
      const now = new Date().toISOString();
      let session: ISession;
      if (extension === '.json') {
        if (info.size > 10 * 1024 * 1024) throw new Error('loc.resonanz.error.importSize');
        const document = z
          .object({
            format: z.literal('resonanz-session'),
            version: z.literal(1),
            session: dataSchemas.session,
          })
          .parse(JSON.parse(await readFile(path, 'utf8')));
        session = {
          ...document.session,
          pipeline: document.session.pipeline
            ? Object.fromEntries(
                Object.entries(document.session.pipeline).map(([stage, step]) => [
                  stage,
                  step ? this.detachedProcessingStep(step) : step,
                ]),
              )
            : undefined,
          id: randomUUID(),
          status: 'ready',
          audioBytes: 0,
          audioAvailable: false,
          nextAudioSequence: 1,
          audioUrl: null,
          collectionId: null,
          updatedAt: now,
        };
      } else {
        const mimeType = supportedAudio.get(extension);
        if (!mimeType) throw new Error('loc.resonanz.error.audioType');
        if (info.size > maximumAudioBytes) throw new Error('loc.resonanz.error.audioSize');
        session = {
          id: randomUUID(),
          title:
            basename(path, extension).slice(0, 200) ||
            translate(uiLanguage(this._settings.uiLanguage), 'loc.resonanz.library.imported'),
          kind: 'recording',
          status: 'ready',
          createdAt: now,
          updatedAt: now,
          durationMs: 0,
          mimeType,
          audioBytes: info.size,
          audioAvailable: true,
          starred: false,
          tags: [],
          collectionId: null,
          transcript: [],
          messages: [],
          summary: '',
          nextAudioSequence: 1,
          audioUrl: null,
        };
        session = { ...session, audioUrl: this.audioUrl(session.id) };
        await mkdir(this.audioDirectory(session.id), { recursive: true, mode: 0o700 });
        await copyFile(
          path,
          join(this.audioDirectory(session.id), recordingFileName(session.mimeType)),
        );
      }
      const record = { version: 1 as const, session, continuations: {} };
      await this.persist(record);
      this._records.set(session.id, record);
      return structuredClone(session);
    });
  }
  /**
   * Resolves only a validated existing session's private audio file for native operations.
   *
   * @public
   */
  public audioPath(sessionId: string): string {
    dataSchemas.identifier.parse(sessionId);
    return join(
      this.audioDirectory(sessionId),
      recordingFileName(this.requireRecord(sessionId).session.mimeType),
    );
  }
  /**
   * Waits for all admitted durable writes before process shutdown.
   *
   * @public
   */
  public async dispose(): Promise<void> {
    await this._tail;
  }

  /** Detached work retains its content, never a live owner, active progress or retry deadline. */
  private detachedProcessingStep(step: IProcessingStep): IProcessingStep {
    const { progress: _progress, retryAt: _retryAt, ...settled } = step;
    return step.state === 'running'
      ? { ...settled, state: 'failed', error: 'loc.resonanz.error.backgroundInterrupted' }
      : settled;
  }
  private sessionBusy(session: ISession): boolean {
    return (
      ['recording', 'paused', 'processing'].includes(session.status) ||
      Object.values(session.pipeline ?? {}).some((step) => step?.state === 'running')
    );
  }
  private async safeDirectory(path: string): Promise<boolean> {
    try {
      const information = await lstat(path);
      if (!information.isDirectory() || information.isSymbolicLink())
        throw new Error('Linked or non-directory managed storage.');
      return true;
    } catch (cause) {
      if (this.isMissing(cause)) return false;
      throw cause;
    }
  }
  private async managedFiles(
    directory: string,
    matches: (name: string) => boolean,
    scan: IStorageScan,
  ): Promise<IManagedFile[]> {
    if (!(await this.safeDirectory(directory))) return [];
    const files: IManagedFile[] = [];
    for await (const entry of await opendir(directory)) {
      if (++scan.entries > maximumStorageEntries)
        throw new Error('Managed storage scan limit exceeded.');
      if (!matches(entry.name)) continue;
      const path = join(directory, entry.name);
      try {
        const information = await lstat(path);
        if (!information.isFile() || information.isSymbolicLink())
          throw new Error('Linked or non-file managed storage.');
        files.push({ path, bytes: information.size });
      } catch (cause) {
        if (!this.isMissing(cause)) throw cause;
      }
    }
    return files;
  }
  private async managedJsonFiles(scan: IStorageScan): Promise<IManagedFile[]> {
    if (!(await this.safeDirectory(this._root))) throw new Error('Missing library directory.');
    const catalog = await this.managedFiles(
      this._root,
      (name) => {
        if (name === 'catalog.json') return true;
        const temporary = /^catalog\.json\.([a-f0-9-]{36})\.tmp$/u.exec(name);
        return !!temporary && dataSchemas.identifier.safeParse(temporary[1]).success;
      },
      scan,
    );
    if (!catalog.some((file) => file.path === join(this._root, 'catalog.json')))
      throw new Error('Missing library catalog.');
    const records = await this.managedFiles(
      join(this._root, 'sessions'),
      (name) => {
        const match = /^([a-f0-9-]{36})\.json(?:\.([a-f0-9-]{36})\.tmp)?$/u.exec(name);
        if (!match || !dataSchemas.identifier.safeParse(match[1]).success) return false;
        return match[2] !== undefined
          ? dataSchemas.identifier.safeParse(match[2]).success
          : this._records.has(match[1]!);
      },
      scan,
    );
    return [...catalog, ...records];
  }
  private async managedAudioFiles(session: ISession, scan: IStorageScan): Promise<IManagedFile[]> {
    if (!(await this.safeDirectory(this._root))) throw new Error('Missing library directory.');
    if (!(await this.safeDirectory(join(this._root, 'audio')))) return [];
    const directory = this.audioDirectory(session.id);
    if (!(await this.safeDirectory(directory))) return [];
    const recording = recordingFileName(session.mimeType);
    const files = await this.managedFiles(
      directory,
      (name) => name === recording || name === `${recording}.tmp`,
      scan,
    );
    const chunks = await this.managedFiles(
      join(directory, 'chunks'),
      (name) => {
        const match = /^\d{8}\.chunk(?:\.([a-f0-9-]{36})\.tmp)?$/u.exec(name);
        return !!match && (!match[1] || dataSchemas.identifier.safeParse(match[1]).success);
      },
      scan,
    );
    return [...files, ...chunks];
  }
  private async pruneAudioDirectories(sessionId: string): Promise<void> {
    for (const path of [
      join(this.audioDirectory(sessionId), 'chunks'),
      this.audioDirectory(sessionId),
    ]) {
      if (!(await this.safeDirectory(path))) continue;
      try {
        await rmdir(path);
      } catch (cause) {
        const code = cause && typeof cause === 'object' && 'code' in cause ? cause.code : undefined;
        if (code !== 'ENOENT' && code !== 'ENOTEMPTY' && code !== 'EEXIST') throw cause;
      }
    }
  }
  private requireRecord(sessionId: string): IStoredSession {
    dataSchemas.identifier.parse(sessionId);
    const record = this._records.get(sessionId);
    if (!record) throw new Error('loc.resonanz.error.sessionMissing');
    return record;
  }
  private assertCollection(id: string | null): void {
    if (id !== null && !this._collections.some((item) => item.id === id))
      throw new Error('loc.resonanz.error.collectionMissing');
  }
  private assertTranscript(segments: readonly ITranscriptSegment[]): void {
    z.array(dataSchemas.transcriptSegment).max(20_000).parse(segments);
    if (segments.reduce((sum, item) => sum + item.text.length, 0) > 2_000_000)
      throw new Error('loc.resonanz.error.transcriptSize');
  }
  private recordPath(id: string): string {
    dataSchemas.identifier.parse(id);
    return join(this._root, 'sessions', `${id}.json`);
  }
  private audioDirectory(id: string): string {
    dataSchemas.identifier.parse(id);
    return join(this._root, 'audio', id);
  }
  private audioUrl(id: string): string {
    return `resonanz-audio://session/${id}`;
  }
  private async commit(record: IStoredSession, session: ISession): Promise<void> {
    const analysisRetry =
      session.pipeline?.analysis?.state === 'failed' &&
      !['recording', 'paused'].includes(session.status)
        ? record.analysisRetry
        : undefined;
    await this.persist({ ...record, session, analysisRetry });
    record.session = session;
    record.analysisRetry = analysisRetry;
  }
  private analysisBinding(): string {
    return createHash('sha256')
      .update(assistantConfigurationKey(this._settings.assistant))
      .digest('hex');
  }
  private hasAnalysisRetry(record: IStoredSession): boolean {
    return (
      !!record.analysisRetry &&
      record.analysisRetry.binding === this.analysisBinding() &&
      record.session.pipeline?.analysis?.state === 'failed' &&
      !['recording', 'paused', 'processing'].includes(record.session.status)
    );
  }
  private publicPipeline(record: IStoredSession): ISession['pipeline'] {
    const pipeline = record.session.pipeline;
    if (!pipeline?.analysis) return pipeline;
    const { retryAt: _ignoredImportedDeadline, ...analysis } = pipeline.analysis;
    return {
      ...pipeline,
      analysis: {
        ...analysis,
        ...(this.hasAnalysisRetry(record) ? { retryAt: record.analysisRetry!.dueAt } : {}),
      },
    };
  }
  private async persist(record: IStoredSession): Promise<void> {
    recordSchema.parse(record);
    await this.atomicWrite(this.recordPath(record.session.id), JSON.stringify(record));
  }
  private async persistCatalog(
    collections: readonly ICollection[] = this._collections,
    settings: ISettings = this._settings,
  ): Promise<void> {
    await this.atomicWrite(
      join(this._root, 'catalog.json'),
      JSON.stringify({ version: 1, settings, collections }),
    );
  }
  private async atomicWrite(path: string, value: string | Buffer): Promise<void> {
    const temporary = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, value, { mode: 0o600 });
      await rename(temporary, path);
    } catch (cause) {
      await rm(temporary, { force: true });
      throw cause;
    }
  }
  private checksum(bytes: Buffer): string {
    return createHash('sha256').update(bytes).digest('hex');
  }
  private serialize<T>(action: () => Promise<T>): Promise<T> {
    const result = this._tail.then(action);
    this._tail = result.catch(() => undefined);
    return result;
  }
  private isMissing(cause: unknown): boolean {
    return Boolean(
      cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ENOENT',
    );
  }
  private async recoverChunks(sessionId: string): Promise<void> {
    const record = this.requireRecord(sessionId);
    let files: string[];
    try {
      files = (await readdir(join(this.audioDirectory(sessionId), 'chunks')))
        .filter((name) => /^\d{8}\.chunk$/u.test(name))
        .sort();
    } catch (cause) {
      if (this.isMissing(cause)) return;
      throw cause;
    }
    let bytes = 0;
    for (let index = 0; index < files.length; index++) {
      if (files[index] !== `${(index + 1).toString().padStart(8, '0')}.chunk`)
        throw new Error('loc.resonanz.error.journalGap');
      bytes += (await stat(join(this.audioDirectory(sessionId), 'chunks', files[index]!))).size;
    }
    if (files.length > 0)
      record.session = {
        ...record.session,
        nextAudioSequence: files.length + 1,
        audioBytes: bytes,
      };
  }
  private async materializeAudio(sessionId: string): Promise<void> {
    const record = this.requireRecord(sessionId);
    if (record.session.audioAvailable) return;
    const destination = this.audioPath(sessionId);
    const temporary = `${destination}.tmp`;
    await mkdir(this.audioDirectory(sessionId), { recursive: true, mode: 0o700 });
    const file = await open(temporary, 'w', 0o600);
    try {
      for (let index = 1; index < record.session.nextAudioSequence; index++) {
        const bytes = await readFile(
          join(
            this.audioDirectory(sessionId),
            'chunks',
            `${index.toString().padStart(8, '0')}.chunk`,
          ),
        );
        await file.writeFile(bytes);
      }
      await file.sync();
    } finally {
      await file.close();
    }
    await rename(temporary, destination);
    await this.commit(record, {
      ...record.session,
      audioAvailable: true,
      audioUrl: this.audioUrl(sessionId),
    });
  }
  // #endregion
}
