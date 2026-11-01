// #region Imports
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, readFile, writeFile, rm, rename, mkdir, symlink, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { SessionStore } from './SessionStore.js';
// #endregion

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return { ...actual, rename: vi.fn(actual.rename) };
});
const roots: string[] = [];
async function createStore() {
  await mkdir('.codex-work/session-tests', { recursive: true });
  const root = await mkdtemp(resolve('.codex-work/session-tests/run-'));
  roots.push(root);
  const store = new SessionStore(root);
  await store.initialize();
  return { root, store };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('SessionStore', () => {
  it('persists authorized retry intent privately and projects only its deadline across restart', async () => {
    const { root, store } = await createStore();
    const session = await store.create({ kind: 'recording', mimeType: 'audio/wav' });
    await store.finish(session.id, 0);
    await store.setPipeline({
      sessionId: session.id,
      stage: 'analysis',
      step: { state: 'failed', provider: 'codex' },
    });
    const dueAt = new Date(Date.now() + 240_000).toISOString();
    await store.setAnalysisRetry(session.id, { dueAt, attempt: 1 });
    const file = join(root, 'library/sessions', `${session.id}.json`);
    const stored = await readFile(file, 'utf8');
    const record = JSON.parse(stored) as { analysisRetry: { binding: string } };
    expect(record.analysisRetry.binding).toMatch(/^[a-f0-9]{64}$/u);
    expect(JSON.stringify(store.get(session.id))).not.toContain(record.analysisRetry.binding);
    expect(store.list()[0]?.pipeline?.analysis?.retryAt).toBe(dueAt);
    await store.dispose();
    const reopened = new SessionStore(root);
    await reopened.initialize();
    expect(reopened.analysisRetries()).toEqual([
      { id: expect.any(String), sessionId: session.id, dueAt, attempt: 1 },
    ]);
    expect(reopened.get(session.id).pipeline?.analysis?.retryAt).toBe(dueAt);
    expect(await readFile(file, 'utf8')).toBe(stored);
    await reopened.dispose();
  });
  it('does not let an obsolete attempt clear or reschedule a newer intent', async () => {
    const { store, root } = await createStore();
    const session = await store.create({ kind: 'recording', mimeType: 'audio/wav' });
    await store.finish(session.id, 0);
    await store.setPipeline({
      sessionId: session.id,
      stage: 'analysis',
      step: { state: 'failed' },
    });
    const retry = { dueAt: new Date(Date.now() + 240_000).toISOString(), attempt: 1 };
    await store.setAnalysisRetry(session.id, retry);
    const oldId = store.analysisRetries()[0]!.id;
    await store.setAnalysisRetry(session.id, retry);
    const current = store.analysisRetries()[0]!;
    const file = join(root, 'library/sessions', `${session.id}.json`);
    const bytes = await readFile(file, 'utf8');
    expect(current.id).not.toBe(oldId);
    expect(await store.setAnalysisRetry(session.id, null, oldId)).toBeUndefined();
    expect(
      await store.setAnalysisRetry(session.id, { ...retry, attempt: 2 }, oldId),
    ).toBeUndefined();
    expect(store.analysisRetries()).toEqual([current]);
    expect(await readFile(file, 'utf8')).toBe(bytes);
    await store.dispose();
  });
  it('fences automatic admission behind an already queued durable cancellation', async () => {
    const { store } = await createStore();
    const session = await store.create({ kind: 'recording', mimeType: 'audio/wav' });
    await store.finish(session.id, 0);
    await store.setPipeline({
      sessionId: session.id,
      stage: 'analysis',
      step: { state: 'failed' },
    });
    await store.setAnalysisRetry(session.id, {
      dueAt: new Date(Date.now() + 240_000).toISOString(),
      attempt: 1,
    });
    const id = store.analysisRetries()[0]!.id;
    const cancel = store.setAnalysisRetry(session.id, null);
    const admission = store.isCurrentAnalysisRetry(session.id, id);
    await cancel;
    expect(await admission).toBe(false);
    expect(store.analysisRetries()).toEqual([]);
    await store.dispose();
  });
  it('does not import retry authorization and clears it after transcript replacement or explicit cancellation', async () => {
    const { root, store } = await createStore();
    const session = await store.create({ kind: 'recording', mimeType: 'audio/wav' });
    await store.finish(session.id, 0);
    await store.setPipeline({
      sessionId: session.id,
      stage: 'analysis',
      step: { state: 'failed' },
    });
    const dueAt = new Date(Date.now() + 240_000).toISOString();
    await store.setAnalysisRetry(session.id, { dueAt, attempt: 1 });
    const path = join(root, 'exported.json');
    await writeFile(
      path,
      JSON.stringify({ format: 'resonanz-session', version: 1, session: store.get(session.id) }),
    );
    const imported = await store.importFile(path);
    expect(store.get(imported.id).pipeline?.analysis?.retryAt).toBeUndefined();
    expect(store.analysisRetries().map((item) => item.sessionId)).toEqual([session.id]);
    await store.replaceTranscript(session.id, []);
    expect(store.analysisRetries()).toEqual([]);
    await store.setPipeline({
      sessionId: session.id,
      stage: 'analysis',
      step: { state: 'failed' },
    });
    await store.setAnalysisRetry(session.id, { dueAt, attempt: 1 });
    await store.setAnalysisRetry(session.id, null);
    expect(store.get(session.id).pipeline?.analysis?.retryAt).toBeUndefined();
    await expect(store.setAnalysisRetry(session.id, { dueAt, attempt: 6 })).rejects.toThrow();
    await store.dispose();
  });
  it.each(['transcription', 'analysis'] as const)(
    'imports a running %s export as interrupted without losing completed content or blocking immediate library clearing',
    async (stage) => {
      const { root: sourceRoot, store: source } = await createStore();
      const { root: targetRoot, store: target } = await createStore();
      const session = await source.create({ kind: 'recording', mimeType: 'audio/wav' });
      const segment = {
        id: 'original-segment',
        speaker: 'participant' as const,
        text: 'Mara will send the report.',
        startMs: 0,
        endMs: 1000,
        final: true,
      };
      const evidence = [{ segmentId: segment.id, atMs: 0, endMs: 1000, quote: segment.text }];
      const task = {
        id: 'original-task',
        text: 'Send the report.',
        assignee: 'Mara',
        completed: true,
        evidence,
      };
      await source.finish(session.id, 1000);
      await source.replaceTranscript(session.id, [segment]);
      await source.saveSummary(session.id, 'A saved summary.', {
        provider: 'codex',
        createdAt: session.createdAt,
        summary: [{ id: 'original-summary', text: 'The report will be sent.', evidence }],
        decisions: [],
        tasks: [task],
        openQuestions: [],
        chapters: [
          { id: 'original-chapter', title: 'Report', summary: '', startMs: 0, endMs: 1000 },
        ],
      });
      await source.saveMessage(session.id, {
        id: crypto.randomUUID(),
        role: 'assistant',
        provider: 'codex',
        text: 'Mara will send the report.',
        createdAt: session.createdAt,
        state: 'complete',
        answer: { kind: 'evidenced', claims: [task], related: evidence },
      });
      await source.mark({
        sessionId: session.id,
        moment: {
          id: crypto.randomUUID(),
          kind: 'question',
          atMs: 250,
          origin: 'note',
          label: 'Follow-up',
        },
      });
      await source.recordPause({
        sessionId: session.id,
        pause: { id: crypto.randomUUID(), atMs: 500, durationMs: 200 },
      });
      await source.setContinuation(session.id, 'codex:default:default', 'private-original-binding');
      await source.setPipeline({
        sessionId: session.id,
        stage: 'transcription',
        step: { state: 'done', progress: 100 },
      });
      await source.setPipeline({
        sessionId: session.id,
        stage,
        step: {
          state: 'running',
          progress: 64,
          provider: stage === 'analysis' ? 'codex' : 'system',
        },
      });
      const exported = source.get(session.id);
      const dueAt = new Date(Date.now() + 240_000).toISOString();
      const path = join(sourceRoot, `controlled-${stage}-export.json`);
      await writeFile(
        path,
        JSON.stringify({
          format: 'resonanz-session',
          version: 1,
          session: {
            ...exported,
            pipeline: {
              transcription: { ...exported.pipeline?.transcription, retryAt: dueAt },
              analysis: { ...exported.pipeline?.analysis, retryAt: dueAt },
            },
          },
          // Public imports must not acquire opaque host authorization even if a document supplies it.
          continuations: { 'codex:default:default': 'private-original-binding' },
          analysisRetry: { id: crypto.randomUUID(), binding: 'a'.repeat(64), dueAt, attempt: 1 },
        }),
      );

      const imported = await target.importFile(path);

      expect(imported.id).not.toBe(session.id);
      expect(imported).toMatchObject({
        status: 'ready',
        audioAvailable: false,
        audioBytes: 0,
        audioUrl: null,
        transcript: exported.transcript,
        summary: exported.summary,
        analysis: exported.analysis,
        messages: exported.messages,
        moments: exported.moments,
        pauses: exported.pauses,
      });
      expect(imported.pipeline?.[stage]).toEqual({
        state: 'failed',
        provider: stage === 'analysis' ? 'codex' : 'system',
        error: 'loc.resonanz.error.backgroundInterrupted',
      });
      const completedStage = stage === 'analysis' ? 'transcription' : 'analysis';
      expect(imported.pipeline?.[completedStage]).toMatchObject({ state: 'done' });
      for (const step of Object.values(imported.pipeline ?? {})) {
        expect(step?.progress).toBeUndefined();
        expect(step?.retryAt).toBeUndefined();
      }
      const persisted = JSON.parse(
        await readFile(join(targetRoot, 'library/sessions', `${imported.id}.json`), 'utf8'),
      ) as {
        session: typeof imported;
        continuations: Record<string, string>;
        analysisRetry?: unknown;
      };
      expect(persisted.session).toEqual(imported);
      expect(persisted.continuations).toEqual({});
      expect(persisted.analysisRetry).toBeUndefined();
      expect(target.analysisRetries()).toEqual([]);
      expect(target.getContinuation(imported.id, 'codex:default:default')).toBeUndefined();
      // No restart/recovery is allowed to hide the import bug before this call.
      await expect(target.clearLibrary({ confirm: true })).resolves.toEqual({
        deletedSessionCount: 1,
      });
      expect(target.list()).toEqual([]);
      expect(source.get(session.id).pipeline?.[stage]?.state).toBe('running');
      expect(source.getContinuation(session.id, 'codex:default:default')).toBe(
        'private-original-binding',
      );
      await target.dispose();
      await source.dispose();
    },
  );
  it.each([null, 'resonanz-audio://session/00000000-0000-4000-8000-000000000000'])(
    'derives the current protected playback URL for available audio when the stored URL is %s without repairing the record',
    async (storedUrl) => {
      const { root, store } = await createStore();
      const source = join(root, 'controlled.wav');
      const wav = Buffer.alloc(60);
      wav.write('RIFF', 0);
      wav.writeUInt32LE(52, 4);
      wav.write('WAVEfmt ', 8);
      wav.writeUInt32LE(16, 16);
      wav.writeUInt16LE(1, 20);
      wav.writeUInt16LE(1, 22);
      wav.writeUInt32LE(8000, 24);
      wav.writeUInt32LE(16000, 28);
      wav.writeUInt16LE(2, 32);
      wav.writeUInt16LE(16, 34);
      wav.write('data', 36);
      wav.writeUInt32LE(16, 40);
      await writeFile(source, wav);
      const imported = await store.importFile(source);
      await store.dispose();
      const path = join(root, 'library', 'sessions', `${imported.id}.json`);
      const record = JSON.parse(await readFile(path, 'utf8')) as {
        session: { audioUrl: string | null };
      };
      record.session.audioUrl = storedUrl;
      const persisted = JSON.stringify(record);
      await writeFile(path, persisted);
      const reopened = new SessionStore(root);
      await reopened.initialize();

      const session = reopened.get(imported.id);

      expect(session).toMatchObject({
        id: imported.id,
        audioAvailable: true,
        audioBytes: wav.byteLength,
        audioUrl: `resonanz-audio://session/${imported.id}`,
      });
      expect(await readFile(reopened.audioPath(imported.id))).toEqual(wav);
      expect(await readFile(path, 'utf8')).toBe(persisted);
      await reopened.dispose();
    },
  );

  it('withholds a stale playback URL when persisted audio is unavailable without inventing media or rewriting metadata', async () => {
    const { root, store } = await createStore();
    const created = await store.create({ kind: 'recording', mimeType: 'audio/wav' });
    await store.finish(created.id, 0);
    await store.dispose();
    const path = join(root, 'library', 'sessions', `${created.id}.json`);
    const record = JSON.parse(await readFile(path, 'utf8')) as {
      session: { audioUrl: string | null };
    };
    record.session.audioUrl = `resonanz-audio://session/${created.id}`;
    const persisted = JSON.stringify(record);
    await writeFile(path, persisted);
    const reopened = new SessionStore(root);
    await reopened.initialize();

    expect(reopened.get(created.id)).toMatchObject({
      audioAvailable: false,
      audioBytes: 0,
      audioUrl: null,
    });
    await expect(stat(reopened.audioPath(created.id))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(path, 'utf8')).toBe(persisted);
    await reopened.dispose();
  });

  it('measures managed logical bytes and accounts for Unicode payloads without including profiles or unrelated files', async () => {
    const { root, store } = await createStore();
    const session = await store.create({ kind: 'recording', mimeType: 'audio/webm' });
    await store.appendAudio({
      sessionId: session.id,
      sequence: 1,
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: session.mimeType,
      elapsedMs: 1000,
    });
    await store.appendTranscript({
      sessionId: session.id,
      id: 'source',
      speaker: 'participant',
      text: 'Überprüfung ✓',
      startMs: 0,
      endMs: 1000,
      final: true,
    });
    await store.saveSummary(session.id, 'Résumé', {
      provider: 'codex',
      createdAt: new Date().toISOString(),
      summary: [],
      decisions: [],
      tasks: [],
      openQuestions: [],
      chapters: [],
    });
    await store.saveMessage(session.id, {
      id: crypto.randomUUID(),
      role: 'user',
      text: 'Question?',
      createdAt: new Date().toISOString(),
      state: 'complete',
    });
    await store.finish(session.id, 1000);
    await mkdir(join(root, 'ai-profiles'), { recursive: true });
    await writeFile(
      join(root, 'ai-profiles', 'profile-sentinel.txt'),
      'Unrelated controlled profile',
    );
    await writeFile(
      join(root, 'library', 'audio', session.id, 'user-note.txt'),
      'Unrelated controlled file',
    );
    const record = await readFile(join(root, 'library', 'sessions', `${session.id}.json`));
    const data = JSON.parse(record.toString()).session;
    const catalog = await readFile(join(root, 'library', 'catalog.json'));
    const transcriptBytes = Buffer.byteLength(JSON.stringify(data.transcript));
    const analysisBytes =
      Buffer.byteLength(JSON.stringify(data.summary)) +
      Buffer.byteLength(JSON.stringify(data.messages)) +
      Buffer.byteLength(JSON.stringify(data.analysis));

    const usage = await store.storageUsage();

    expect(usage).toMatchObject({
      audioBytes: 6,
      transcriptBytes,
      analysisBytes,
      metadataBytes: record.byteLength + catalog.byteLength - transcriptBytes - analysisBytes,
      totalBytes: record.byteLength + catalog.byteLength + 6,
      sessionCount: 1,
    });
    expect(Number.isFinite(Date.parse(usage.measuredAt))).toBe(true);
  });
  it('keeps retention disabled by default and removes only expired audio while preserving written content across restart', async () => {
    const { root, store } = await createStore();
    const session = await store.create({ kind: 'recording', mimeType: 'audio/webm' });
    await store.appendAudio({
      sessionId: session.id,
      sequence: 1,
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: session.mimeType,
      elapsedMs: 1000,
    });
    await store.appendTranscript({
      sessionId: session.id,
      id: 'source',
      speaker: 'participant',
      text: 'Keep the original transcript.',
      startMs: 0,
      endMs: 1000,
      final: true,
    });
    await store.saveSummary(session.id, 'Keep this summary.');
    await store.saveMessage(session.id, {
      id: crypto.randomUUID(),
      role: 'assistant',
      text: 'Keep this answer.',
      createdAt: new Date().toISOString(),
      state: 'complete',
    });
    await store.finish(session.id, 1000);
    const previous = store.get(session.id);
    const day = 86_400_000;
    const created = Date.parse(session.createdAt);
    expect(await store.cleanupAudioRetention(created + 91 * day)).toEqual({
      removedAudioCount: 0,
      freedBytes: 0,
    });
    await store.saveSettings({ audioRetentionDays: 90 });
    expect(await store.cleanupAudioRetention(created + 31 * day)).toEqual({
      removedAudioCount: 0,
      freedBytes: 0,
    });

    expect(await store.cleanupAudioRetention(created + 91 * day)).toEqual({
      removedAudioCount: 1,
      freedBytes: 6,
    });
    expect(await store.cleanupAudioRetention(created + 92 * day)).toEqual({
      removedAudioCount: 0,
      freedBytes: 0,
    });

    const reopened = new SessionStore(root);
    await reopened.initialize();
    expect(reopened.get(session.id)).toMatchObject({
      transcript: previous.transcript,
      summary: previous.summary,
      messages: previous.messages,
      durationMs: 1000,
      audioBytes: 0,
      audioAvailable: false,
      audioUrl: null,
      nextAudioSequence: 1,
    });
    await expect(stat(reopened.audioPath(session.id))).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('skips active, processing and admitted sessions and bounds each retention pass to32 recordings', async () => {
    const { store } = await createStore();
    const sessions = [];
    for (let index = 0; index < 37; index++) {
      const session = await store.create({ kind: 'recording', mimeType: 'audio/webm' });
      await store.appendAudio({
        sessionId: session.id,
        sequence: 1,
        bytes: new Uint8Array([index]),
        mimeType: session.mimeType,
        elapsedMs: 1000,
      });
      if (index !== 0) await store.finish(session.id, 1000);
      sessions.push(session);
    }
    await store.transitionStatus(sessions[1]!.id, 'ready', 'processing');
    await store.setPipeline({
      sessionId: sessions[2]!.id,
      stage: 'analysis',
      step: { state: 'running' },
    });
    await store.saveSettings({ audioRetentionDays: 30 });
    const protectedIds = new Set([sessions[3]!.id]);
    const now = Date.parse(sessions[36]!.createdAt) + 31 * 86_400_000;

    expect(await store.cleanupAudioRetention(now, protectedIds)).toEqual({
      removedAudioCount: 32,
      freedBytes: 64,
    });
    expect(await store.cleanupAudioRetention(now, protectedIds)).toEqual({
      removedAudioCount: 1,
      freedBytes: 2,
    });
    expect(await store.cleanupAudioRetention(now, protectedIds)).toEqual({
      removedAudioCount: 0,
      freedBytes: 0,
    });

    for (const session of sessions.slice(0, 4)) expect(store.get(session.id).audioBytes).toBe(1);
  });
  it('does not delete audio before a failed retention metadata commit and retries remaining owned files after restart', async () => {
    const { root, store } = await createStore();
    const session = await store.create({ kind: 'recording', mimeType: 'audio/webm' });
    await store.appendAudio({
      sessionId: session.id,
      sequence: 1,
      bytes: new Uint8Array([7, 8]),
      mimeType: session.mimeType,
      elapsedMs: 1000,
    });
    await store.finish(session.id, 1000);
    await store.saveSettings({ audioRetentionDays: 30 });
    const now = Date.parse(session.createdAt) + 31 * 86_400_000;
    vi.mocked(rename).mockRejectedValueOnce(new Error('controlled metadata denial'));
    await expect(store.cleanupAudioRetention(now)).rejects.toThrow(
      'loc.resonanz.error.storageCleanup',
    );
    expect([...(await readFile(store.audioPath(session.id)))]).toEqual([7, 8]);
    const path = join(root, 'library', 'sessions', `${session.id}.json`);
    const record = JSON.parse(await readFile(path, 'utf8'));
    record.session.audioAvailable = false;
    record.session.audioBytes = 0;
    record.session.audioUrl = null;
    record.session.nextAudioSequence = 1;
    await writeFile(path, JSON.stringify(record));

    const reopened = new SessionStore(root);
    await reopened.initialize();
    expect(await reopened.cleanupAudioRetention(now)).toEqual({
      removedAudioCount: 1,
      freedBytes: 4,
    });
    expect(await reopened.cleanupAudioRetention(now)).toEqual({
      removedAudioCount: 0,
      freedBytes: 0,
    });
  });
  it('requires a fully idle library before clear and preserves settings, profiles and unrelated files', async () => {
    const { root, store } = await createStore();
    const collection = await store.createCollection('Controlled collection');
    const first = await store.create({
      kind: 'recording',
      mimeType: 'audio/webm',
      collectionId: collection.id,
    });
    await store.appendAudio({
      sessionId: first.id,
      sequence: 1,
      bytes: new Uint8Array([1]),
      mimeType: first.mimeType,
      elapsedMs: 1000,
    });
    await store.finish(first.id, 1000);
    const active = await store.create({ kind: 'recording', mimeType: 'audio/webm' });
    await store.saveSettings({
      uiLanguage: 'de',
      userName: 'Controlled Name',
      audioRetentionDays: 'never',
    });
    const settings = store.settings;
    await mkdir(join(root, 'ai-profiles'), { recursive: true });
    const profile = join(root, 'ai-profiles', 'profile-sentinel.txt');
    const unrelated = join(root, 'library', 'audio', first.id, 'user-note.txt');
    const other = join(root, 'library', 'sessions', 'user-note.md');
    await writeFile(profile, 'Keep profile');
    await writeFile(unrelated, 'Keep note');
    await writeFile(other, 'Keep source note');
    await expect(store.clearLibrary({ confirm: true })).rejects.toThrow(
      'loc.resonanz.error.libraryBusy',
    );
    expect(store.list()).toHaveLength(2);
    await store.finish(active.id, 1000);
    await store.setPipeline({
      sessionId: first.id,
      stage: 'transcription',
      step: { state: 'running' },
    });
    await expect(store.clearLibrary({ confirm: true })).rejects.toThrow(
      'loc.resonanz.error.libraryBusy',
    );
    expect([...(await readFile(store.audioPath(first.id)))]).toEqual([1]);
    await store.setPipeline({
      sessionId: first.id,
      stage: 'transcription',
      step: { state: 'done' },
    });

    expect(await store.clearLibrary({ confirm: true })).toEqual({ deletedSessionCount: 2 });
    expect(await store.clearLibrary({ confirm: true })).toEqual({ deletedSessionCount: 0 });

    const reopened = new SessionStore(root);
    await reopened.initialize();
    expect(reopened.list()).toEqual([]);
    expect(reopened.collections).toEqual([]);
    expect(reopened.settings).toEqual(settings);
    expect(await readFile(profile, 'utf8')).toBe('Keep profile');
    expect(await readFile(unrelated, 'utf8')).toBe('Keep note');
    expect(await readFile(other, 'utf8')).toBe('Keep source note');
    expect((await reopened.storageUsage()).audioBytes).toBe(0);
  });
  it('refuses managed audio symlinks without following or removing an unrelated target', async () => {
    const { root, store } = await createStore();
    const session = await store.create({ kind: 'recording', mimeType: 'audio/webm' });
    await store.appendAudio({
      sessionId: session.id,
      sequence: 1,
      bytes: new Uint8Array([1]),
      mimeType: session.mimeType,
      elapsedMs: 1000,
    });
    await store.finish(session.id, 1000);
    const target = join(root, 'unrelated-audio.webm');
    await writeFile(target, 'Keep original');
    await rm(store.audioPath(session.id));
    await symlink(target, store.audioPath(session.id));

    await expect(store.storageUsage()).rejects.toThrow('loc.resonanz.error.storageMeasure');
    await expect(store.clearLibrary({ confirm: true })).rejects.toThrow(
      'loc.resonanz.error.libraryClear',
    );

    expect(await readFile(target, 'utf8')).toBe('Keep original');
    expect(store.list()).toHaveLength(1);
  });
  it('journals observed pause completions after finalization without rewriting timing or losing concurrent audio', async () => {
    const { root, store } = await createStore();
    const session = await store.create({ kind: 'recording', mimeType: 'audio/webm' });
    const pause = { id: crypto.randomUUID(), atMs: 500 };
    await Promise.all([
      store.recordPause({ sessionId: session.id, pause }),
      store.appendAudio({
        sessionId: session.id,
        sequence: 1,
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: session.mimeType,
        elapsedMs: 1000,
      }),
    ]);
    await store.finish(session.id, 1000);
    const completed = { ...pause, durationMs: 2 * 86_400_000 };
    await store.recordPause({ sessionId: session.id, pause: completed });
    await store.recordPause({ sessionId: session.id, pause });
    await store.recordPause({ sessionId: session.id, pause: completed });
    const later = { id: crypto.randomUUID(), atMs: 750, durationMs: 1000 };
    await store.recordPause({ sessionId: session.id, pause: later });
    await expect(
      store.recordPause({ sessionId: session.id, pause: { ...completed, durationMs: 5 } }),
    ).rejects.toThrow('loc.resonanz.error.pauseChanged');
    await expect(
      store.recordPause({ sessionId: session.id, pause: { ...completed, atMs: 600 } }),
    ).rejects.toThrow('loc.resonanz.error.pauseChanged');
    await expect(
      store.recordPause({ sessionId: session.id, pause: { id: crypto.randomUUID(), atMs: 800 } }),
    ).rejects.toThrow('loc.resonanz.error.captureFinished');

    const reopened = new SessionStore(root);
    await reopened.initialize();
    expect(reopened.get(session.id)).toMatchObject({
      status: 'ready',
      audioBytes: 3,
      durationMs: 1000,
      pauses: [completed, later],
    });
    const exported = join(root, 'controlled-pause-export.json');
    await writeFile(
      exported,
      JSON.stringify({ format: 'resonanz-session', version: 1, session: reopened.get(session.id) }),
    );
    const imported = await reopened.importFile(exported);
    expect(imported.id).not.toBe(session.id);
    expect(imported.pauses).toEqual([completed, later]);
    expect(imported.transcript).toEqual([]);
  });
  it('preserves an observed pause start without inventing its end after interruption or import', async () => {
    const { root, store } = await createStore();
    const session = await store.create({ kind: 'recording', mimeType: 'audio/webm' });
    const pause = { id: crypto.randomUUID(), atMs: 0 };
    await store.recordPause({ sessionId: session.id, pause });

    const reopened = new SessionStore(root);
    await reopened.initialize();
    const recovered = reopened.get(session.id);
    expect(recovered.status).toBe('interrupted');
    expect(recovered.pauses).toEqual([pause]);
    const exported = join(root, 'controlled-open-pause-export.json');
    await writeFile(
      exported,
      JSON.stringify({ format: 'resonanz-session', version: 1, session: recovered }),
    );
    const imported = await reopened.importFile(exported);
    expect(imported.pauses).toEqual([pause]);
    expect(imported.transcript).toEqual([]);
  });
  it('undoes only an active session marker idempotently alongside audio and preserves other sessions', async () => {
    const { root, store } = await createStore();
    const session = await store.create({ kind: 'recording', mimeType: 'audio/webm' });
    const other = await store.create({ kind: 'recording', mimeType: 'audio/webm' });
    const removed = { id: crypto.randomUUID(), kind: 'decision' as const, atMs: 500 };
    const retained = { id: crypto.randomUUID(), kind: 'task' as const, atMs: 750 };
    await store.mark({ sessionId: session.id, moment: removed });
    await store.mark({ sessionId: session.id, moment: retained });
    await store.mark({ sessionId: other.id, moment: removed });
    await Promise.all([
      store.unmark({ sessionId: session.id, momentId: removed.id }),
      store.appendAudio({
        sessionId: session.id,
        sequence: 1,
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: session.mimeType,
        elapsedMs: 1000,
      }),
    ]);
    await store.unmark({ sessionId: session.id, momentId: removed.id });
    expect(store.get(session.id).moments).toEqual([retained]);
    expect(store.get(other.id).moments).toEqual([removed]);
    expect(store.get(session.id).audioBytes).toBe(3);
    await store.finish(session.id, 1000);
    await expect(store.unmark({ sessionId: session.id, momentId: retained.id })).rejects.toThrow(
      'loc.resonanz.error.captureChanged',
    );
    const reopened = new SessionStore(root);
    await reopened.initialize();
    expect(reopened.get(session.id).moments).toEqual([retained]);
    expect(reopened.get(session.id).audioBytes).toBe(3);
  });
  it('persists separate processing failures and recovers a stale running stage without losing text', async () => {
    const { root, store } = await createStore();
    const session = await store.create({ kind: 'recording', mimeType: 'audio/webm' });
    await store.replaceTranscript(session.id, [
      {
        id: 'source',
        speaker: 'participant',
        text: 'Keep this original text.',
        startMs: 0,
        endMs: 1000,
        final: true,
      },
    ]);
    await store.finish(session.id, 1000);
    await store.setPipeline({
      sessionId: session.id,
      stage: 'analysis',
      step: { state: 'running', provider: 'codex' },
    });
    const reopened = new SessionStore(root);
    await reopened.initialize();
    expect(reopened.get(session.id).pipeline?.transcription?.state).toBe('done');
    expect(reopened.get(session.id).pipeline?.analysis).toEqual({
      state: 'failed',
      provider: 'codex',
      error: 'loc.resonanz.error.backgroundInterrupted',
    });
    expect(reopened.get(session.id).transcript[0]?.text).toBe('Keep this original text.');
    expect(reopened.get(session.id).status).toBe('ready');
    await reopened.setPipeline({
      sessionId: session.id,
      stage: 'transcription',
      step: { state: 'failed', error: 'native recognition failed' },
    });
    expect(reopened.list()[0]?.pipeline?.transcription?.error).toBe('native recognition failed');
    expect(reopened.list()[0]?.transcriptAvailable).toBe(true);
  });
  it('journals task completion with concurrent audio and retains it after restart and an equivalent analysis', async () => {
    const { root, store } = await createStore();
    const session = await store.create({ kind: 'recording', mimeType: 'audio/webm' });
    const task = { id: 'task-notes', text: 'Prepare release notes', evidence: [] };
    const analysis = {
      provider: 'codex',
      createdAt: new Date().toISOString(),
      summary: [],
      decisions: [],
      tasks: [task],
      openQuestions: [],
      chapters: [],
    };
    await store.saveSummary(session.id, task.text, analysis);
    await Promise.all([
      store.setTaskCompleted({ sessionId: session.id, taskId: task.id, completed: true }),
      store.appendAudio({
        sessionId: session.id,
        sequence: 1,
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: session.mimeType,
        elapsedMs: 1000,
      }),
    ]);
    const reopened = new SessionStore(root);
    await reopened.initialize();
    expect(reopened.get(session.id).analysis?.tasks[0]?.completed).toBe(true);
    expect(reopened.get(session.id).audioBytes).toBe(3);
    await reopened.saveSummary(session.id, task.text, {
      ...analysis,
      tasks: [{ ...task, id: 'new-task-id' }],
    });
    expect(reopened.get(session.id).analysis?.tasks[0]?.completed).toBe(true);
    await expect(
      reopened.setTaskCompleted({ sessionId: session.id, taskId: task.id, completed: false }),
    ).rejects.toThrow('loc.resonanz.error.taskMissing');
    await reopened.setTaskCompleted({
      sessionId: session.id,
      taskId: 'new-task-id',
      completed: false,
    });
    expect(reopened.get(session.id).analysis?.tasks[0]?.completed).toBe(false);
  });
  it('persists interface language separately from speech and retains existing session content', async () => {
    const { root, store } = await createStore();
    expect(store.settings.uiLanguage).toBe('en');
    const original = await store.create({
      kind: 'recording',
      mimeType: 'audio/webm',
      title: 'Mein Gespräch',
    });
    await store.saveSettings({ uiLanguage: 'de' });
    expect(store.settings.locale).toBe('de-DE');
    const next = await store.create({ kind: 'recording', mimeType: 'audio/webm' });
    expect(next.title).toBe('Neue Aufnahme');
    const reopened = new SessionStore(root);
    await reopened.initialize();
    expect(reopened.settings.uiLanguage).toBe('de');
    expect(reopened.settings.locale).toBe('de-DE');
    expect(reopened.get(original.id).title).toBe('Mein Gespräch');
    await reopened.saveSettings({ uiLanguage: 'en' });
    expect((await reopened.create({ kind: 'recording', mimeType: 'audio/webm' })).title).toBe(
      'New recording',
    );
  });
  it('journals user moments idempotently alongside audio and retains measured peaks after restart', async () => {
    const { root, store } = await createStore();
    const session = await store.create({ kind: 'recording', mimeType: 'audio/webm' });
    const moment = { id: crypto.randomUUID(), kind: 'decision' as const, atMs: 500 };
    await Promise.all([
      store.mark({ sessionId: session.id, moment }),
      store.appendAudio({
        sessionId: session.id,
        sequence: 1,
        bytes: new Uint8Array([1, 2, 3]),
        mimeType: session.mimeType,
        elapsedMs: 1000,
      }),
    ]);
    await store.mark({ sessionId: session.id, moment });
    await store.saveWaveform({ sessionId: session.id, values: [0, 0.5, 1, 0] });
    await store.finish(session.id, 1000);
    const restarted = new SessionStore(root);
    await restarted.initialize();
    expect(restarted.get(session.id).moments).toEqual([moment]);
    expect(restarted.get(session.id).audioBytes).toBe(3);
    expect(restarted.list()[0]?.waveform).toEqual([0, 0.5, 1, 0]);
    await restarted.dispose();
  });
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
      'loc.resonanz.error.blockChanged',
    );
    await expect(store.appendAudio({ ...chunk, sequence: 3 })).rejects.toThrow(
      'loc.resonanz.error.blockMissing',
    );
    expect(store.get(session.id).audioBytes).toBe(2);
    await store.finish(session.id, 1000);
    await expect(store.appendAudio({ ...chunk, sequence: 2 })).rejects.toThrow(
      'loc.resonanz.error.audioClosed',
    );
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
    expect(() => reopened.get(first.id)).toThrow('loc.resonanz.error.sessionMissing');
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
