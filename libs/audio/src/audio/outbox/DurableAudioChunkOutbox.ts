// #region Imports

import { DOCUMENT } from '@angular/common';
import { inject, Injectable, type OnDestroy } from '@angular/core';
import { DurableAudioStorageCapacityError } from './errors/DurableAudioStorageCapacityError';
import type { IDurableAudioChunk } from './models/IDurableAudioChunk';
import type { IDurableAudioStorageReadiness } from './models/IDurableAudioStorageReadiness';
import type { IStoreDurableAudioChunkInput } from './models/IStoreDurableAudioChunkInput';

// #endregion

interface IAudioChunkRecord {
    readonly key: string;
    readonly sessionId: string;
    readonly sequence: number;
    readonly blob: Blob;
    readonly byteLength: number;
    readonly contentType: string;
    readonly checksum: string;
    readonly capturedAtInMilliseconds: number;
    readonly durationInMilliseconds: number;
    readonly expiresAtInMilliseconds: number;
    readonly storedAtInMilliseconds: number;
    readonly retryCount: number;
    readonly nextAttemptAtInMilliseconds: number;
    readonly lastError: string | null;
}

const DATABASE_NAME = 'realtime-audio-outbox';
const DATABASE_VERSION = 2;
const STORE_NAME = 'audioChunks';
const SESSION_INDEX_NAME = 'sessionId';
const EXPIRATION_INDEX_NAME = 'expiresAtInMilliseconds';
const NEXT_ATTEMPT_INDEX_NAME = 'nextAttemptAtInMilliseconds';
const MAXIMUM_ERROR_CHARACTERS = 500;
const MAXIMUM_SEQUENCE = 2_147_483_647;

/** Persists encoded audio fragments in IndexedDB before any network upload is attempted. */
@Injectable({ providedIn: 'root' })
export class DurableAudioChunkOutbox implements OnDestroy {
    // #region Fields

    private readonly _document: Document = inject(DOCUMENT);
    private _database: IDBDatabase | null = null;
    private _databasePromise: Promise<IDBDatabase> | null = null;

    // #endregion

    // #region Ctor
    // #endregion

    // #region Properties

    /** Indicates whether durable browser storage is available in the current environment. */
    public get isSupported(): boolean {
        return this.resolveFactory() !== null;
    }

    // #endregion

    // #region Methods

    /** Releases the open IndexedDB connection. */
    public ngOnDestroy(): void {
        this._database?.close();
        this._database = null;
        this._databasePromise = null;
    }

    /**
     * Opens and validates the durable outbox.
     *
     * @public
     */
    public async initialize(): Promise<void> {
        await this.openDatabase();
        await this.purgeExpired();
    }

    /**
     * Opens the outbox, requests eviction-resistant storage where supported, and validates free quota.
     *
     * Browsers that do not expose StorageManager estimates remain usable because IndexedDB still
     * provides transactional durability. A known insufficient quota fails before microphone capture.
     */
    public async prepareForRecording(minimumAvailableBytes: number): Promise<IDurableAudioStorageReadiness> {
        if (!Number.isSafeInteger(minimumAvailableBytes) || minimumAvailableBytes < 0) {
            throw new RangeError('The minimum available storage must be a non-negative safe integer.');
        }
        await this.initialize();

        const storage = this._document.defaultView?.navigator.storage;
        if (storage === undefined) {
            return { availableBytes: null, persisted: null };
        }

        let persisted: boolean | null = null;
        try {
            persisted = typeof storage.persisted === 'function' ? await storage.persisted() : null;
            if (persisted === false && typeof storage.persist === 'function') {
                persisted = await storage.persist();
            }
        } catch {
            // Persistence is a best-effort browser policy. The explicit quota check below remains authoritative.
        }

        let availableBytes: number | null = null;
        try {
            if (typeof storage.estimate === 'function') {
                const estimate = await storage.estimate();
                if (Number.isFinite(estimate.quota) && Number.isFinite(estimate.usage)) {
                    availableBytes = Math.max(0, Math.trunc((estimate.quota ?? 0) - (estimate.usage ?? 0)));
                }
            }
        } catch {
            // Some privacy modes expose StorageManager but reject estimates. IndexedDB availability was verified above.
        }

        if (availableBytes !== null && availableBytes < minimumAvailableBytes) {
            throw new DurableAudioStorageCapacityError(minimumAvailableBytes, availableBytes);
        }

        return { availableBytes, persisted };
    }

    /**
     * Atomically stores a fragment or returns the byte-identical existing entry.
     *
     * @param input - Audio fragment and retention metadata.
     * @returns Durable outbox entry.
     * @public
     */
    public async store(input: IStoreDurableAudioChunkInput): Promise<IDurableAudioChunk> {
        this.validateInput(input);
        const database = await this.openDatabase();
        const transaction = database.transaction(STORE_NAME, 'readwrite', { durability: 'strict' });
        const store = transaction.objectStore(STORE_NAME);
        const key = this.createKey(input.sessionId, input.sequence);
        const existing = await this.request<IAudioChunkRecord | undefined>(store.get(key));

        if (existing !== undefined) {
            if (existing.checksum !== input.checksum || existing.byteLength !== input.blob.size) {
                transaction.abort();
                throw new Error('The audio sequence already exists with different content.');
            }
            await this.transactionCompleted(transaction);
            return this.toEntity(existing);
        }

        const now = Date.now();
        const record: IAudioChunkRecord = {
            key,
            sessionId: input.sessionId,
            sequence: input.sequence,
            blob: input.blob,
            byteLength: input.blob.size,
            contentType: input.blob.type || 'application/octet-stream',
            checksum: input.checksum,
            capturedAtInMilliseconds: input.capturedAt.getTime(),
            durationInMilliseconds: input.durationInMilliseconds,
            expiresAtInMilliseconds: input.expiresAt.getTime(),
            storedAtInMilliseconds: now,
            retryCount: 0,
            nextAttemptAtInMilliseconds: now,
            lastError: null
        };
        await this.request(store.add(record));
        await this.transactionCompleted(transaction);
        return this.toEntity(record);
    }

    /**
     * Returns a bounded sequence-ordered upload batch whose retry delay elapsed.
     *
     * @param sessionId - Logical live-session identifier.
     * @param limit - Maximum number of fragments to return.
     * @param now - Retry and retention comparison time.
     * @returns Ready audio fragments.
     * @public
     */
    public async listReady(
        sessionId: string,
        limit = 8,
        now: Date = new Date()
    ): Promise<ReadonlyArray<IDurableAudioChunk>> {
        const normalizedLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
        const database = await this.openDatabase();
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const index = transaction.objectStore(STORE_NAME).index(SESSION_INDEX_NAME);
        const records = await new Promise<Array<IAudioChunkRecord>>((resolve, reject) => {
            const result: Array<IAudioChunkRecord> = [];
            const request = index.openCursor(sessionId);
            request.onerror = () => reject(request.error ?? new Error('Could not read the audio outbox.'));
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor === null || result.length >= normalizedLimit) {
                    resolve(result);
                    return;
                }
                const record = cursor.value as IAudioChunkRecord;
                if (
                    record.expiresAtInMilliseconds > now.getTime() &&
                    record.nextAttemptAtInMilliseconds <= now.getTime()
                ) {
                    result.push(record);
                } else if (record.expiresAtInMilliseconds > now.getTime()) {
                    // A later fragment must never overtake the first unacknowledged
                    // fragment or the server cannot advance its contiguous ACK.
                    resolve(result);
                    return;
                }
                cursor.continue();
            };
        });
        await this.transactionCompleted(transaction);
        return records.map((record) => this.toEntity(record));
    }

    /**
     * Returns retry-ready fragments across logical sessions in retry-deadline order.
     *
     * @param limit - Maximum number of fragments to return.
     * @param now - Retry and retention comparison time.
     * @returns Ready audio fragments from any session.
     * @public
     */
    public async listReadyAcrossSessions(
        limit = 8,
        now: Date = new Date()
    ): Promise<ReadonlyArray<IDurableAudioChunk>> {
        const normalizedLimit = Math.max(1, Math.min(Math.trunc(limit), 100));
        const database = await this.openDatabase();
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const records = (await this.readSessionHeads(transaction.objectStore(STORE_NAME), now))
            .filter((record) => record.nextAttemptAtInMilliseconds <= now.getTime())
            .sort(
                (left, right) =>
                    left.nextAttemptAtInMilliseconds - right.nextAttemptAtInMilliseconds ||
                    left.storedAtInMilliseconds - right.storedAtInMilliseconds ||
                    left.sessionId.localeCompare(right.sessionId)
            )
            .slice(0, normalizedLimit);
        await this.transactionCompleted(transaction);
        return records.map((record) => this.toEntity(record));
    }

    /**
     * Counts all unacknowledged fragments for a logical session.
     *
     * @param sessionId - Logical live-session identifier.
     * @returns Pending fragment count.
     * @public
     */
    public async count(sessionId: string): Promise<number> {
        const database = await this.openDatabase();
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const count = await this.request<number>(
            transaction.objectStore(STORE_NAME).index(SESSION_INDEX_NAME).count(sessionId)
        );
        await this.transactionCompleted(transaction);
        return count;
    }

    /**
     * Returns the highest locally stored sequence for a session.
     *
     * @param sessionId - Logical live-session identifier.
     * @returns Highest sequence or zero when the outbox is empty.
     * @public
     */
    public async getLastSequence(sessionId: string): Promise<number> {
        const database = await this.openDatabase();
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const index = transaction.objectStore(STORE_NAME).index(SESSION_INDEX_NAME);
        const record = await new Promise<IAudioChunkRecord | null>((resolve, reject) => {
            const request = index.openCursor(sessionId, 'prev');
            request.onerror = () => reject(request.error ?? new Error('Could not read the audio outbox.'));
            request.onsuccess = () =>
                resolve(request.result === null ? null : (request.result.value as IAudioChunkRecord));
        });
        await this.transactionCompleted(transaction);
        return record?.sequence ?? 0;
    }

    /**
     * Returns the earliest retry deadline for a non-expired session fragment.
     *
     * @param sessionId - Logical live-session identifier.
     * @param now - Retention comparison time.
     * @returns Earliest retry time or null when no upload remains.
     * @public
     */
    public async getNextAttemptAt(sessionId: string, now: Date = new Date()): Promise<Date | null> {
        const database = await this.openDatabase();
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const index = transaction.objectStore(STORE_NAME).index(SESSION_INDEX_NAME);
        const nextAttemptAtInMilliseconds = await new Promise<number | null>((resolve, reject) => {
            const request = index.openCursor(sessionId);
            request.onerror = () => reject(request.error ?? new Error('Could not read the audio outbox.'));
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor === null) {
                    resolve(null);
                    return;
                }
                const record = cursor.value as IAudioChunkRecord;
                if (record.expiresAtInMilliseconds > now.getTime()) {
                    resolve(record.nextAttemptAtInMilliseconds);
                    return;
                }
                cursor.continue();
            };
        });
        await this.transactionCompleted(transaction);
        return nextAttemptAtInMilliseconds === null ? null : new Date(nextAttemptAtInMilliseconds);
    }

    /** Returns the earliest retry deadline across every non-expired live-session fragment. */
    public async getNextAttemptAtForAll(now: Date = new Date()): Promise<Date | null> {
        const database = await this.openDatabase();
        const transaction = database.transaction(STORE_NAME, 'readonly');
        const heads = await this.readSessionHeads(transaction.objectStore(STORE_NAME), now);
        const nextAttemptAtInMilliseconds = heads.reduce<number | null>(
            (earliest, record) =>
                earliest === null
                    ? record.nextAttemptAtInMilliseconds
                    : Math.min(earliest, record.nextAttemptAtInMilliseconds),
            null
        );
        await this.transactionCompleted(transaction);
        return nextAttemptAtInMilliseconds === null ? null : new Date(nextAttemptAtInMilliseconds);
    }

    /**
     * Records a failed upload and its deterministic retry time.
     *
     * @param sessionId - Logical live-session identifier.
     * @param sequence - Failed fragment sequence.
     * @param message - Safe, user-displayable failure summary.
     * @param nextAttemptAt - Earliest retry time.
     * @public
     */
    public async markFailed(sessionId: string, sequence: number, message: string, nextAttemptAt: Date): Promise<void> {
        const database = await this.openDatabase();
        const transaction = database.transaction(STORE_NAME, 'readwrite', { durability: 'strict' });
        const store = transaction.objectStore(STORE_NAME);
        const key = this.createKey(sessionId, sequence);
        const record = await this.request<IAudioChunkRecord | undefined>(store.get(key));
        if (record !== undefined) {
            await this.request(
                store.put({
                    ...record,
                    retryCount: record.retryCount + 1,
                    nextAttemptAtInMilliseconds: nextAttemptAt.getTime(),
                    lastError: message.trim().slice(0, MAXIMUM_ERROR_CHARACTERS) || 'Upload failed.'
                } satisfies IAudioChunkRecord)
            );
        }
        await this.transactionCompleted(transaction);
    }

    /**
     * Removes only fragments covered by the server's contiguous acknowledgement.
     *
     * @param sessionId - Logical live-session identifier.
     * @param acknowledgedSequence - Highest consecutively persisted server sequence.
     * @returns Number of removed local fragments.
     * @public
     */
    public async acknowledgeThrough(sessionId: string, acknowledgedSequence: number): Promise<number> {
        if (!Number.isSafeInteger(acknowledgedSequence) || acknowledgedSequence < 0) {
            throw new Error('The acknowledged audio sequence must be a non-negative safe integer.');
        }
        const database = await this.openDatabase();
        const transaction = database.transaction(STORE_NAME, 'readwrite', { durability: 'strict' });
        const index = transaction.objectStore(STORE_NAME).index(SESSION_INDEX_NAME);
        const removed = await this.deleteMatchingCursor(
            index.openCursor(sessionId),
            (record) => record.sequence <= acknowledgedSequence,
            (record) => record.sequence > acknowledgedSequence
        );
        await this.transactionCompleted(transaction);
        return removed;
    }

    /**
     * Deletes expired locally retained raw audio whenever the browser outbox next runs.
     *
     * @param now - Retention comparison time.
     * @returns Number of purged fragments.
     * @public
     */
    public async purgeExpired(now: Date = new Date()): Promise<number> {
        const database = await this.openDatabase();
        const transaction = database.transaction(STORE_NAME, 'readwrite', { durability: 'strict' });
        const index = transaction.objectStore(STORE_NAME).index(EXPIRATION_INDEX_NAME);
        const removed = await this.deleteMatchingCursor(
            index.openCursor(),
            (record) => record.expiresAtInMilliseconds <= now.getTime(),
            (record) => record.expiresAtInMilliseconds > now.getTime()
        );
        await this.transactionCompleted(transaction);
        return removed;
    }

    private async openDatabase(): Promise<IDBDatabase> {
        if (this._database !== null) {
            return this._database;
        }
        if (this._databasePromise !== null) {
            return this._databasePromise;
        }
        const factory = this.resolveFactory();
        if (factory === null) {
            throw new Error('Durable browser audio storage is unavailable.');
        }
        this._databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
            const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
            request.onerror = () => reject(request.error ?? new Error('Could not open durable audio storage.'));
            request.onblocked = () => reject(new Error('A previous audio-storage version is still open.'));
            request.onupgradeneeded = () => {
                const database = request.result;
                const transaction = request.transaction;
                if (transaction === null) {
                    reject(new Error('Could not access the audio-storage upgrade transaction.'));
                    return;
                }
                const store = database.objectStoreNames.contains(STORE_NAME)
                    ? transaction.objectStore(STORE_NAME)
                    : database.createObjectStore(STORE_NAME, { keyPath: 'key' });
                if (!store.indexNames.contains(SESSION_INDEX_NAME)) {
                    store.createIndex(SESSION_INDEX_NAME, 'sessionId', { unique: false });
                }
                if (!store.indexNames.contains(EXPIRATION_INDEX_NAME)) {
                    store.createIndex(EXPIRATION_INDEX_NAME, 'expiresAtInMilliseconds', { unique: false });
                }
                if (!store.indexNames.contains(NEXT_ATTEMPT_INDEX_NAME)) {
                    store.createIndex(NEXT_ATTEMPT_INDEX_NAME, 'nextAttemptAtInMilliseconds', { unique: false });
                }
            };
            request.onsuccess = () => {
                const database = request.result;
                database.onversionchange = () => {
                    database.close();
                    if (this._database === database) {
                        this._database = null;
                        this._databasePromise = null;
                    }
                };
                this._database = database;
                resolve(database);
            };
        });
        try {
            return await this._databasePromise;
        } catch (error: unknown) {
            this._databasePromise = null;
            throw error;
        }
    }

    private resolveFactory(): IDBFactory | null {
        return this._document.defaultView?.indexedDB ?? null;
    }

    /** Reads only the first non-expired fragment of every session without scanning each session tail. */
    private readSessionHeads(store: IDBObjectStore, now: Date): Promise<ReadonlyArray<IAudioChunkRecord>> {
        return new Promise((resolve, reject) => {
            const heads: Array<IAudioChunkRecord> = [];
            const request = store.openCursor();
            request.onerror = () => reject(request.error ?? new Error('Could not read the audio outbox.'));
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor === null) {
                    resolve(heads);
                    return;
                }
                const record = cursor.value as IAudioChunkRecord;
                if (record.expiresAtInMilliseconds <= now.getTime()) {
                    cursor.continue();
                    return;
                }
                heads.push(record);
                // Primary keys are `${sessionId}:${zero-padded sequence}`. Jump
                // directly behind this session instead of traversing thousands of chunks.
                cursor.continue(`${record.sessionId}:\uffff`);
            };
        });
    }

    private createKey(sessionId: string, sequence: number): string {
        return `${sessionId}:${sequence.toString().padStart(12, '0')}`;
    }

    private validateInput(input: IStoreDurableAudioChunkInput): void {
        if (input.sessionId.trim().length === 0 || input.sessionId.length > 200) {
            throw new Error('The live-session identifier is invalid.');
        }
        if (!Number.isSafeInteger(input.sequence) || input.sequence < 1 || input.sequence > MAXIMUM_SEQUENCE) {
            throw new Error(`The audio sequence must be an integer between 1 and ${MAXIMUM_SEQUENCE}.`);
        }
        if (input.blob.size < 1) {
            throw new Error('The audio fragment must not be empty.');
        }
        if (!/^[a-f0-9]{64}$/u.test(input.checksum)) {
            throw new Error('The audio fragment checksum is invalid.');
        }
        if (!Number.isFinite(input.capturedAt.getTime()) || !Number.isFinite(input.expiresAt.getTime())) {
            throw new Error('The audio fragment timestamps are invalid.');
        }
        if (input.expiresAt.getTime() <= input.capturedAt.getTime()) {
            throw new Error('The audio fragment retention deadline must follow capture time.');
        }
        if (!Number.isSafeInteger(input.durationInMilliseconds) || input.durationInMilliseconds < 1) {
            throw new Error('The audio fragment duration must be a positive integer.');
        }
    }

    private request<TResult>(request: IDBRequest<TResult>): Promise<TResult> {
        return new Promise<TResult>((resolve, reject) => {
            request.onerror = () => reject(request.error ?? new Error('The durable audio operation failed.'));
            request.onsuccess = () => resolve(request.result);
        });
    }

    private transactionCompleted(transaction: IDBTransaction): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error ?? new Error('The durable audio transaction failed.'));
            transaction.onabort = () =>
                reject(transaction.error ?? new Error('The durable audio transaction was aborted.'));
        });
    }

    private deleteMatchingCursor(
        request: IDBRequest<IDBCursorWithValue | null>,
        shouldDelete: (record: IAudioChunkRecord) => boolean,
        shouldStop: (record: IAudioChunkRecord) => boolean
    ): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            let removed = 0;
            request.onerror = () => reject(request.error ?? new Error('Could not update the audio outbox.'));
            request.onsuccess = () => {
                const cursor = request.result;
                if (cursor === null) {
                    resolve(removed);
                    return;
                }
                const record = cursor.value as IAudioChunkRecord;
                if (shouldStop(record)) {
                    resolve(removed);
                    return;
                }
                if (shouldDelete(record)) {
                    const deleteRequest = cursor.delete();
                    deleteRequest.onerror = () => reject(deleteRequest.error ?? new Error('Could not remove audio.'));
                    deleteRequest.onsuccess = () => {
                        removed += 1;
                        cursor.continue();
                    };
                    return;
                }
                cursor.continue();
            };
        });
    }

    private toEntity(record: IAudioChunkRecord): IDurableAudioChunk {
        return {
            blob: record.blob,
            capturedAt: new Date(record.capturedAtInMilliseconds),
            checksum: record.checksum,
            contentType: record.contentType,
            durationInMilliseconds: record.durationInMilliseconds,
            expiresAt: new Date(record.expiresAtInMilliseconds),
            lastError: record.lastError,
            nextAttemptAt: new Date(record.nextAttemptAtInMilliseconds),
            retryCount: record.retryCount,
            sequence: record.sequence,
            sessionId: record.sessionId,
            storedAt: new Date(record.storedAtInMilliseconds)
        };
    }

    // #endregion
}
