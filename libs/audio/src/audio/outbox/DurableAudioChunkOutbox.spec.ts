// #region Imports

import { TestBed } from '@angular/core/testing';
import { Blob as NodeBlob } from 'node:buffer';
import { IDBFactory } from 'fake-indexeddb';
import { DurableAudioChunkOutbox } from './DurableAudioChunkOutbox';
import type { IStoreDurableAudioChunkInput } from './models/IStoreDurableAudioChunkInput';

// #endregion

describe('DurableAudioChunkOutbox', () => {
    beforeEach(() => {
        TestBed.resetTestingModule();
        Object.defineProperty(window, 'indexedDB', {
            configurable: true,
            value: new IDBFactory()
        });
    });

    it('commits audio before returning it as ready for upload', async () => {
        const outbox = TestBed.inject(DurableAudioChunkOutbox);
        const input = createInput(1);

        await outbox.store(input);

        expect(await outbox.count(input.sessionId)).toBe(1);
        const ready = await outbox.listReady(input.sessionId);
        expect(ready).toHaveLength(1);
        expect(ready[0]?.sequence).toBe(1);
        expect(ready[0]?.blob.size).toBe(input.blob.size);
    });

    it('requests persistent storage and validates the maximum recording runway before capture', async () => {
        const persisted = vi.fn().mockResolvedValue(false);
        const persist = vi.fn().mockResolvedValue(true);
        const estimate = vi.fn().mockResolvedValue({ quota: 500_000_000, usage: 100_000_000 });
        Object.defineProperty(window.navigator, 'storage', {
            configurable: true,
            value: { persisted, persist, estimate }
        });
        const outbox = TestBed.inject(DurableAudioChunkOutbox);

        await expect(outbox.prepareForRecording(320_000_000)).resolves.toEqual({
            availableBytes: 400_000_000,
            persisted: true
        });
        expect(persist).toHaveBeenCalledOnce();
    });

    it('rejects capture before opening the microphone when the known browser quota is insufficient', async () => {
        Object.defineProperty(window.navigator, 'storage', {
            configurable: true,
            value: {
                persisted: vi.fn().mockResolvedValue(true),
                estimate: vi.fn().mockResolvedValue({ quota: 350_000_000, usage: 100_000_000 })
            }
        });
        const outbox = TestBed.inject(DurableAudioChunkOutbox);

        await expect(outbox.prepareForRecording(320_000_000)).rejects.toMatchObject({
            name: 'DurableAudioStorageCapacityError',
            requiredBytes: 320_000_000,
            availableBytes: 250_000_000
        });
    });

    it('keeps a byte-identical retry and rejects conflicting sequence content', async () => {
        const outbox = TestBed.inject(DurableAudioChunkOutbox);
        const input = createInput(1);

        await outbox.store(input);
        await outbox.store(input);

        expect(await outbox.count(input.sessionId)).toBe(1);
        await expect(
            outbox.store({
                ...input,
                blob: new Blob(['different'], { type: 'audio/webm' }),
                checksum: 'b'.repeat(64)
            })
        ).rejects.toThrow('different content');
    });

    it('honors retry delays and deletes only a contiguous server acknowledgement', async () => {
        const outbox = TestBed.inject(DurableAudioChunkOutbox);
        const now = new Date();
        await outbox.store(createInput(1, now));
        await outbox.store(createInput(2, now));
        await outbox.markFailed('session-1', 1, 'Network unavailable', new Date(now.getTime() + 10_000));

        const nextAttemptAt = await outbox.getNextAttemptAt('session-1', now);
        expect(nextAttemptAt).not.toBeNull();
        expect(nextAttemptAt?.getTime()).toBe(now.getTime() + 10_000);

        const beforeRetry = await outbox.listReady('session-1', 8, new Date(now.getTime() + 5_000));
        expect(beforeRetry).toEqual([]);

        await outbox.acknowledgeThrough('session-1', 1);
        expect(await outbox.count('session-1')).toBe(1);
        expect(await outbox.getLastSequence('session-1')).toBe(2);
    });

    it('purges unacknowledged raw audio when its local retention deadline elapses', async () => {
        const outbox = TestBed.inject(DurableAudioChunkOutbox);
        const capturedAt = new Date('2026-07-30T12:00:00.000Z');
        await outbox.store(createInput(1, capturedAt, new Date('2026-07-31T12:00:00.000Z')));
        await outbox.store(createInput(2, capturedAt, new Date('2026-08-01T12:00:00.000Z')));

        expect(await outbox.purgeExpired(new Date('2026-07-31T12:00:00.000Z'))).toBe(1);
        expect(await outbox.count('session-1')).toBe(1);
    });

    it('recovers retry-ready chunks across previous logical sessions', async () => {
        const outbox = TestBed.inject(DurableAudioChunkOutbox);
        const now = new Date();
        await outbox.store(createInput(1, now, new Date(now.getTime() + 86_400_000), 'session-previous'));
        await outbox.store(createInput(1, now, new Date(now.getTime() + 86_400_000), 'session-current'));
        await outbox.markFailed('session-previous', 1, 'Network unavailable', new Date(now.getTime() + 10_000));

        const ready = await outbox.listReadyAcrossSessions(8, new Date(now.getTime() + 1_000));
        expect(ready.map((chunk) => chunk.sessionId)).toEqual(['session-current']);
        expect(await outbox.getNextAttemptAtForAll(new Date(now.getTime() + 1_000))).not.toBeNull();
    });

    it('never lets a later fragment overtake the retry-delayed head of its session', async () => {
        const outbox = TestBed.inject(DurableAudioChunkOutbox);
        const now = new Date();
        await outbox.store(createInput(1, now));
        await outbox.store(createInput(2, now));
        await outbox.markFailed('session-1', 1, 'Network unavailable', new Date(now.getTime() + 10_000));

        expect(await outbox.listReadyAcrossSessions(8, new Date(now.getTime() + 1_000))).toEqual([]);
        expect((await outbox.getNextAttemptAtForAll(now))?.getTime()).toBe(now.getTime() + 10_000);

        expect(
            (await outbox.listReadyAcrossSessions(8, new Date(now.getTime() + 10_000))).map((chunk) => chunk.sequence)
        ).toEqual([1]);
    });
});

function createInput(
    sequence: number,
    capturedAt: Date = new Date(),
    expiresAt: Date = new Date(capturedAt.getTime() + 86_400_000),
    sessionId = 'session-1'
): IStoreDurableAudioChunkInput {
    return {
        blob: new NodeBlob([`audio-${sequence}`], { type: 'audio/webm' }) as Blob,
        capturedAt,
        checksum: sequence.toString(16).padStart(64, '0'),
        durationInMilliseconds: 1_000,
        expiresAt,
        sequence,
        sessionId
    };
}
