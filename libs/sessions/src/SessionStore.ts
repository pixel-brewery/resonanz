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
} from 'node:fs/promises';
import { z } from 'zod';
import { recordingFileName } from './recordingFileName.js';
import type { IStoredSession } from './IStoredSession.js';
import {
  dataSchemas,
  defaultSettings,
  type ISession,
  type ISessionSummary,
  type ICollection,
  type ISettings,
  type ITranscriptSegment,
  type IQuestionMessage,
  type RequestPayload,
} from '@resonanz/contracts';
// #endregion

const recordSchema = z.object({
  version: z.literal(1),
  session: dataSchemas.session,
  continuations: z.record(z.string(), z.string().max(100_000)).default({}),
});
const catalogSchema = z.object({
  version: z.literal(1),
  settings: dataSchemas.settings,
  collections: z.array(dataSchemas.collection).max(200),
});
const maximumAudioBytes = 512 * 1024 * 1024;
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
      if (!this.isMissing(cause))
        throw new Error(
          'Die Bibliothek konnte nicht gelesen werden. Die Originaldateien bleiben erhalten.',
          { cause },
        );
    }
    const names = (await readdir(join(this._root, 'sessions'))).filter((name) =>
      /^[a-f0-9-]+\.json$/u.test(name),
    );
    if (names.length > 5000)
      throw new Error('Die Bibliothek enthält mehr als 5000 Aufzeichnungen.');
    for (const name of names) {
      const record = recordSchema.parse(
        JSON.parse(await readFile(join(this._root, 'sessions', name), 'utf8')),
      );
      if (name !== `${record.session.id}.json`)
        throw new Error('Ein Aufzeichnungsschlüssel passt nicht zu seiner Datei.');
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
      .map(({ session }) => {
        const {
          transcript: _transcript,
          messages: _messages,
          summary: _summary,
          nextAudioSequence: _sequence,
          audioUrl: _url,
          error: _error,
          ...metadata
        } = session;
        return structuredClone(metadata);
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }
  /**
   * Reads an existing public session without exposing private paths or continuations.
   *
   * @public
   */
  public get(sessionId: string): ISession {
    return structuredClone(this.requireRecord(sessionId).session);
  }
  /**
   * Creates a recording or live conversation in the chosen collection.
   *
   * @public
   */
  public create(input: RequestPayload<'sessions.create'>): Promise<ISession> {
    return this.serialize(async () => {
      if (this._records.size >= 5000)
        throw new Error('Die Bibliothek ist voll. Entferne zuerst eine Aufzeichnung.');
      this.assertCollection(input.collectionId ?? null);
      const now = new Date().toISOString();
      const session: ISession = {
        id: randomUUID(),
        title:
          input.title ?? (input.kind === 'conversation' ? 'Neue Unterhaltung' : 'Neue Aufnahme'),
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
        throw new Error('Die Aufnahme ist bereits beendet.');
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
        throw new Error('Diese Aufnahme akzeptiert keine weiteren Audiodaten.');
      if (input.mimeType !== session.mimeType)
        throw new Error('Das Audioformat hat sich während der Aufnahme geändert.');
      const bytes = Buffer.from(
        input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes),
      );
      if (bytes.byteLength === 0 || bytes.byteLength > 4 * 1024 * 1024)
        throw new Error('Der Audioblock ist zu groß oder leer.');
      const directory = join(this.audioDirectory(input.sessionId), 'chunks');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      const path = join(directory, `${input.sequence.toString().padStart(8, '0')}.chunk`);
      if (input.sequence < session.nextAudioSequence) {
        const existing = await readFile(path);
        if (this.checksum(existing) !== this.checksum(bytes))
          throw new Error('Ein wiederholter Audioblock enthält andere Daten.');
        return { sequence: input.sequence, totalBytes: session.audioBytes };
      }
      if (input.sequence !== session.nextAudioSequence)
        throw new Error('Ein Audioblock fehlt. Die Reihenfolge wird nicht übersprungen.');
      if (session.audioBytes + bytes.byteLength > maximumAudioBytes)
        throw new Error(
          'Die Aufnahme hat die Grenze von 512 MiB erreicht. Beende sie und starte eine neue Session.',
        );
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
      await this.commit(record, {
        ...record.session,
        transcript: segments,
        updatedAt: new Date().toISOString(),
      });
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
      if (messages.length > 2000)
        throw new Error('Diese Session enthält bereits 2000 Nachrichten.');
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
  public saveSummary(sessionId: string, summary: string): Promise<void> {
    return this.serialize(async () => {
      const record = this.requireRecord(sessionId);
      await this.commit(record, {
        ...record.session,
        summary: dataSchemas.session.shape.summary.parse(summary),
        updatedAt: new Date().toISOString(),
      });
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
  public clearContinuations(): Promise<void> {
    return this.serialize(async () => {
      for (const record of this._records.values()) {
        if (Object.keys(record.continuations).length === 0) continue;
        await this.persist({ ...record, continuations: {} });
        record.continuations = {};
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
      if (this._collections.length >= 200)
        throw new Error('Es sind bereits 200 Sammlungen vorhanden.');
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
      if (!collection) throw new Error('Die Sammlung wurde nicht gefunden.');
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
      if (!info.isFile()) throw new Error('Bitte wähle eine Datei aus.');
      const extension = extname(path).toLowerCase();
      const now = new Date().toISOString();
      let session: ISession;
      if (extension === '.json') {
        if (info.size > 10 * 1024 * 1024) throw new Error('Die Importdatei ist größer als 10 MiB.');
        const document = z
          .object({
            format: z.literal('resonanz-session'),
            version: z.literal(1),
            session: dataSchemas.session,
          })
          .parse(JSON.parse(await readFile(path, 'utf8')));
        session = {
          ...document.session,
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
        if (!mimeType) throw new Error('Dieses Audioformat wird nicht unterstützt.');
        if (info.size > maximumAudioBytes)
          throw new Error('Die Audiodatei ist größer als 512 MiB.');
        session = {
          id: randomUUID(),
          title: basename(path, extension).slice(0, 200) || 'Importierte Aufnahme',
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

  private requireRecord(sessionId: string): IStoredSession {
    dataSchemas.identifier.parse(sessionId);
    const record = this._records.get(sessionId);
    if (!record) throw new Error('Die Aufzeichnung wurde nicht gefunden.');
    return record;
  }
  private assertCollection(id: string | null): void {
    if (id !== null && !this._collections.some((item) => item.id === id))
      throw new Error('Die Sammlung wurde nicht gefunden.');
  }
  private assertTranscript(segments: readonly ITranscriptSegment[]): void {
    z.array(dataSchemas.transcriptSegment).max(20_000).parse(segments);
    if (segments.reduce((sum, item) => sum + item.text.length, 0) > 2_000_000)
      throw new Error('Das Transkript ist zu lang. Teile die Aufnahme in mehrere Sessions.');
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
    await this.persist({ ...record, session });
    record.session = session;
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
        throw new Error('Im Audiojournal fehlt ein Block. Die Dateien bleiben unverändert.');
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
