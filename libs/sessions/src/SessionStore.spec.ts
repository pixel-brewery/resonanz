// #region Imports
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm, rename, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionStore } from './SessionStore.js';
// #endregion

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
const roots: string[] = [];
async function createStore() {
  const root = await mkdtemp(join(tmpdir(), 'resonanz-store-'));
  roots.push(root);
  const store = new SessionStore(root);
  await store.initialize();
  return { root, store };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('SessionStore', () => {
  it('persists ordered recording media, transcript, questions and organization across restart', async () => {
    // arrange
    const { root, store } = await createStore();
    const collection = await store.createCollection('Produktgespräche');
    const session = await store.create({
      kind: 'recording',
      title: 'Planung',
      mimeType: 'audio/webm',
      collectionId: collection.id,
    });
    // act
    await store.appendAudio({
      sessionId: session.id,
      sequence: 1,
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/webm',
      elapsedMs: 1000,
    });
    await store.appendAudio({
      sessionId: session.id,
      sequence: 2,
      bytes: new Uint8Array([4, 5]),
      mimeType: 'audio/webm',
      elapsedMs: 2000,
    });
    await store.appendTranscript({
      sessionId: session.id,
      id: 'turn-1',
      speaker: 'participant',
      text: 'Wir starten am Freitag.',
      startMs: 100,
      endMs: 900,
      final: true,
    });
    await store.update({
      sessionId: session.id,
      title: 'Freitagsplanung',
      starred: true,
      tags: ['Release', 'Release'],
    });
    const finished = await store.finish(session.id, 2300);
    await store.dispose();
    const reopened = new SessionStore(root);
    await reopened.initialize();
    // assert
    expect(reopened.list()).toMatchObject([
      {
        id: session.id,
        title: 'Freitagsplanung',
        status: 'ready',
        starred: true,
        tags: ['Release'],
        collectionId: collection.id,
        audioBytes: 5,
        durationMs: 2300,
      },
    ]);
    expect(reopened.get(session.id).transcript).toHaveLength(1);
    expect(finished.audioUrl).toBe(`resonanz-audio://session/${session.id}`);
    expect([...(await readFile(reopened.audioPath(session.id)))]).toEqual([1, 2, 3, 4, 5]);
  });

  it('accepts an identical retry once and rejects gaps, changed retries and writes after finalization', async () => {
    // arrange
    const { store } = await createStore();
    const session = await store.create({ kind: 'recording', mimeType: 'audio/webm' });
    const chunk = {
      sessionId: session.id,
      sequence: 1,
      bytes: new Uint8Array([8, 9]),
      mimeType: 'audio/webm',
      elapsedMs: 1000,
    };
    // act / assert
    await store.appendAudio(chunk);
    await expect(store.appendAudio(chunk)).resolves.toEqual({ sequence: 1, totalBytes: 2 });
    await expect(store.appendAudio({ ...chunk, bytes: new Uint8Array([7, 9]) })).rejects.toThrow(
      'andere Daten',
    );
    await expect(store.appendAudio({ ...chunk, sequence: 3 })).rejects.toThrow('Reihenfolge');
    expect(store.get(session.id).audioBytes).toBe(2);
    await store.finish(session.id, 1000);
    await expect(store.appendAudio({ ...chunk, sequence: 2 })).rejects.toThrow('keine weiteren');
  });

  it('recovers a committed audio chunk even when its metadata write was interrupted', async () => {
    // arrange
    const { root, store } = await createStore();
    const session = await store.create({ kind: 'recording', mimeType: 'audio/webm' });
    await store.appendAudio({
      sessionId: session.id,
      sequence: 1,
      bytes: new Uint8Array([3, 1, 4]),
      mimeType: 'audio/webm',
      elapsedMs: 1000,
    });
    const path = join(root, 'library', 'sessions', `${session.id}.json`);
    const record = JSON.parse(await readFile(path, 'utf8')) as {
      session: { audioBytes: number; nextAudioSequence: number };
    };
    record.session.audioBytes = 0;
    record.session.nextAudioSequence = 1;
    await writeFile(path, JSON.stringify(record));
    // act
    const recovered = new SessionStore(root);
    await recovered.initialize();
    // assert
    expect(recovered.get(session.id)).toMatchObject({
      status: 'interrupted',
      audioBytes: 3,
      nextAudioSequence: 2,
      audioAvailable: true,
    });
    expect([...(await readFile(recovered.audioPath(session.id)))]).toEqual([3, 1, 4]);
  });

  it('keeps an errored partial recording playable rather than claiming capture completed', async () => {
    // arrange
    const { store } = await createStore();
    const session = await store.create({ kind: 'recording', mimeType: 'audio/webm' });
    await store.appendAudio({
      sessionId: session.id,
      sequence: 1,
      bytes: new Uint8Array([4]),
      mimeType: 'audio/webm',
      elapsedMs: 500,
    });
    // act
    const finished = await store.finish(session.id, 500, 'Speicher voll.');
    // assert
    expect(finished).toMatchObject({
      status: 'error',
      error: 'Speicher voll.',
      audioAvailable: true,
      audioBytes: 1,
    });
  });

  it('does not publish a metadata edit when the atomic filesystem commit fails', async () => {
    // arrange
    const { root, store } = await createStore();
    const session = await store.create({
      kind: 'recording',
      title: 'Original',
      mimeType: 'audio/webm',
    });
    vi.mocked(rename).mockRejectedValueOnce(Object.assign(new Error('denied'), { code: 'EACCES' }));
    // act / assert
    await expect(
      store.update({ sessionId: session.id, title: 'Unbestätigte Änderung' }),
    ).rejects.toThrow('denied');
    expect(store.get(session.id).title).toBe('Original');
    vi.mocked(rename).mockRejectedValueOnce(new Error('catalog denied'));
    await expect(store.saveSettings({ locale: 'en-US' })).rejects.toThrow('catalog denied');
    expect(store.settings.locale).toBe('de-DE');
    const reopened = new SessionStore(root);
    await reopened.initialize();
    expect(reopened.get(session.id).title).toBe('Original');
  });

  it('deletes a collection without deleting its recordings and removes only a selected session', async () => {
    // arrange
    const { root, store } = await createStore();
    const collection = await store.createCollection('Kunden');
    const first = await store.create({
      kind: 'recording',
      mimeType: 'audio/webm',
      collectionId: collection.id,
    });
    const second = await store.create({
      kind: 'conversation',
      mimeType: 'audio/webm',
      collectionId: collection.id,
    });
    // act
    await store.deleteCollection(collection.id);
    await store.delete(first.id);
    const reopened = new SessionStore(root);
    await reopened.initialize();
    // assert
    expect(reopened.collections).toHaveLength(0);
    expect(reopened.list()).toMatchObject([{ id: second.id, collectionId: null }]);
    expect(() => reopened.get(first.id)).toThrow('nicht gefunden');
    await expect(store.delete('../outside')).rejects.toThrow();
  });

  it('imports audio into owned storage and rejects invalid transcript edits without changing the previous content', async () => {
    // arrange
    const { root, store } = await createStore();
    const source = join(root, 'source.wav');
    await writeFile(source, new Uint8Array([1, 5, 9]));
    // act
    const session = await store.importFile(source);
    await rm(source);
    await store.appendTranscript({
      sessionId: session.id,
      speaker: 'participant',
      text: 'Gespeichert.',
      startMs: 0,
      endMs: 100,
      final: true,
    });
    // assert
    expect(session).toMatchObject({
      title: 'source',
      mimeType: 'audio/wav',
      status: 'ready',
      audioAvailable: true,
    });
    expect([...(await readFile(store.audioPath(session.id)))]).toEqual([1, 5, 9]);
    await expect(
      store.replaceTranscript(session.id, [
        {
          id: 'invalid',
          speaker: 'participant',
          text: 'Falsch',
          startMs: 200,
          endMs: 100,
          final: true,
        },
      ]),
    ).rejects.toThrow();
    expect(store.get(session.id).transcript[0]?.text).toBe('Gespeichert.');
  });
});
