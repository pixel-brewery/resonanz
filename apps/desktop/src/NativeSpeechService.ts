// #region Imports
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { LiveSpeechResult, SpeechSession } from 'electron-native-speech';
import { dataSchemas, type ICapabilities, type ITranscriptSegment } from '@resonanz/contracts';
import type { INativeSpeechHost } from './INativeSpeechHost.js';
import { WindowsSpeechSession } from './WindowsSpeechSession.js';
// #endregion

const require = createRequire(import.meta.url);
type Voice = ICapabilities['speechVoices'][number];
interface IRecognition {
  readonly operationId?: string;
  readonly sessionId: string;
  readonly locale: string;
  readonly origin: number;
  readonly baseMs: number;
  generation: number;
  recognition?: SpeechSession | undefined;
  pending?: ITranscriptSegment | undefined;
  timer?: NodeJS.Timeout | undefined;
}

/** Native microphone recognition and bounded, archiveable system-voice WAV clips. */
export class NativeSpeechService {
  // #region Fields
  private readonly _host: INativeSpeechHost;
  private readonly _windowsExecutable = join(
    process.env['SystemRoot'] ?? 'C:\\Windows',
    'System32/WindowsPowerShell/v1.0/powershell.exe',
  );
  private readonly _children = new Map<ChildProcess, Promise<void>>();
  private readonly _synthesis = new Map<string, AbortController>();
  private readonly _synthesisDone = new Map<string, Promise<void>>();
  private readonly _closedSessions = new Set<string>();
  private readonly _transcriptions = new Set<Promise<readonly ITranscriptSegment[]>>();
  private readonly _clips = new Map<string, { sessionId: string; path: string; bytes: number }>();
  private _active: IRecognition | undefined;
  private _tail: Promise<unknown> = Promise.resolve();
  private _native: typeof import('electron-native-speech') | undefined;
  private _metadata: Promise<{ locales: string[]; voices: Voice[] }> | undefined;
  private _disposed = false;
  // #endregion
  // #region Ctor
  public constructor(host: INativeSpeechHost) {
    this._host = host;
  }
  // #endregion
  // #region Methods
  public async capabilities(): Promise<ICapabilities> {
    const unavailable = {
      platform: process.platform,
      nativeTranscription: false,
      nativeConversation: false,
      speechLocales: [],
      speechVoices: [],
    };
    if (!['darwin', 'win32'].includes(process.platform))
      return {
        ...unavailable,
        speechMessage: 'loc.resonanz.error.noSpeechBridge',
      };
    try {
      const metadata = await (this._metadata ??= this.metadata());
      const settings = await this._host.settings();
      const localeAvailable = metadata.locales.some(
        (locale) => locale.toLowerCase() === settings.locale.toLowerCase(),
      );
      const availability =
        process.platform === 'darwin' ? await this.native().getSpeechAvailability() : undefined;
      const available = availability ? availability.available : metadata.locales.length > 0;
      const voiceAvailable = metadata.voices.some(
        (voice) =>
          voice.locale.toLowerCase().split('-')[0] === settings.locale.toLowerCase().split('-')[0],
      );
      return {
        platform: process.platform,
        nativeTranscription: available && localeAvailable,
        nativeConversation:
          available && localeAvailable && voiceAvailable && availability?.mode !== 'file',
        speechLocales: metadata.locales,
        speechVoices: metadata.voices,
        ...(!available || !localeAvailable || !voiceAvailable
          ? {
              speechMessage: 'loc.resonanz.settings.speechHint',
            }
          : {}),
      };
    } catch {
      this._metadata = undefined;
      return {
        ...unavailable,
        speechMessage: 'loc.resonanz.error.speechUnavailable',
      };
    }
  }

  public async start(sessionId: string, operationId?: string): Promise<void> {
    await this.serial(async () => {
      if (this._disposed) throw new Error('loc.resonanz.error.recognitionStopped');
      const session = await this._host.session(dataSchemas.identifier.parse(sessionId));
      if (this._disposed) throw new Error('loc.resonanz.error.recognitionStopped');
      if (!operationId && !['recording', 'paused'].includes(session.status))
        throw new Error('loc.resonanz.error.captureFirst');
      if (
        this._active &&
        (this._active.sessionId !== sessionId || this._active.operationId !== operationId)
      )
        throw new Error('loc.resonanz.error.micBusy');
      if (!this._active)
        this._active = {
          sessionId,
          locale: (await this._host.settings()).locale,
          baseMs: session.durationMs,
          origin: performance.now(),
          generation: 0,
          ...(operationId ? { operationId } : {}),
        };
      await this.listenActive(this._active);
    });
  }

  public async listen(sessionId: string, enabled: boolean): Promise<void> {
    await this.serial(async () => {
      const active = this._active;
      if (!active || active.sessionId !== sessionId) {
        if (enabled) throw new Error('loc.resonanz.error.recognitionStartFirst');
        return;
      }
      if (enabled) await this.listenActive(active);
      else await this.pauseActive(active);
    });
  }

  public async flush(sessionId: string): Promise<void> {
    await this.listen(sessionId, false);
  }

  public async stop(sessionId: string, operationId?: string): Promise<void> {
    await this.serial(async () => {
      if (this._active?.sessionId !== sessionId) return;
      if (operationId && this._active.operationId !== operationId) return;
      await this.pauseActive(this._active);
      this._active = undefined;
    });
  }

  public async transcribeFile(
    path: string,
    locale: string,
  ): Promise<readonly ITranscriptSegment[]> {
    if (this._disposed) throw new Error('loc.resonanz.error.recognitionStopped');
    const operation = this.transcribeOwnedFile(path, locale);
    this._transcriptions.add(operation);
    try {
      return await operation;
    } finally {
      this._transcriptions.delete(operation);
    }
  }

  private async transcribeOwnedFile(
    path: string,
    locale: string,
  ): Promise<readonly ITranscriptSegment[]> {
    if (process.platform === 'darwin') {
      const result = await this.native().transcribeFile({ filePath: path, locale });
      return result.segments.map((segment) => ({
        ...segment,
        speaker: 'participant',
        final: true,
      }));
    }
    if (process.platform !== 'win32') throw new Error('loc.resonanz.error.noFileTranscription');
    if (!path.toLowerCase().endsWith('.wav')) throw new Error('loc.resonanz.error.wavRequired');
    const result = JSON.parse(
      await this.windows('transcribe', { locale, filePath: path }, undefined, 180_000),
    ) as { segments: { id: string; text: string; startMs: number; endMs: number }[] };
    return result.segments.map((segment) =>
      dataSchemas.transcriptSegment.parse({ ...segment, speaker: 'participant', final: true }),
    );
  }

  public async synthesize(
    sessionId: string,
    speechId: string,
    text: string,
    requestedVoice?: string,
  ): Promise<string> {
    dataSchemas.identifier.parse(sessionId);
    dataSchemas.identifier.parse(speechId);
    if (!text.trim() || text.length > 4000) throw new Error('loc.resonanz.error.clipText');
    if (
      this._disposed ||
      this._closedSessions.has(sessionId) ||
      this._synthesis.size >= 2 ||
      this._synthesis.has(sessionId)
    )
      throw new Error('loc.resonanz.error.speechPending');
    if (this._clips.has(`${sessionId}:${speechId}`)) throw new Error('loc.resonanz.error.clipUsed');
    const controller = new AbortController();
    this._synthesis.set(sessionId, controller);
    let complete!: () => void;
    this._synthesisDone.set(
      sessionId,
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
    );
    const directory = join(this._host.dataDirectory, 'voice', sessionId);
    const path = join(directory, `${speechId}.wav`);
    const source = join(directory, `${speechId}.txt`);
    const intermediate = join(directory, `${speechId}.aiff`);
    try {
      const session = await this._host.session(sessionId);
      controller.signal.throwIfAborted();
      if (session.kind !== 'conversation' || !['recording', 'paused'].includes(session.status))
        throw new Error('loc.resonanz.error.conversationInactive');
      const settings = dataSchemas.settings.parse(await this._host.settings());
      const speechRate = settings.speechRate ?? 1;
      controller.signal.throwIfAborted();
      const metadata = await (this._metadata ??= this.metadata());
      controller.signal.throwIfAborted();
      const chosen = requestedVoice ?? settings.voice;
      const voice = chosen
        ? metadata.voices.find((item) => item.id === chosen)
        : (metadata.voices.find(
            (item) => item.locale.toLowerCase() === settings.locale.toLowerCase(),
          ) ??
          metadata.voices.find(
            (item) => item.locale.split('-')[0] === settings.locale.split('-')[0],
          ));
      if (!voice) throw new Error('loc.resonanz.error.noMatchingVoice');
      await mkdir(directory, { recursive: true, mode: 0o700 });
      if (process.platform === 'darwin') {
        await writeFile(source, text, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        await this.command(
          '/usr/bin/say',
          [
            '-v',
            voice.id,
            // Neutral preserves the voice's own default. Other settings use a
            // documented 180-WPM reference; native engines have different scales.
            ...(speechRate === 1 ? [] : ['-r', String(Math.round(180 * speechRate))]),
            '-o',
            intermediate,
            '-f',
            source,
          ],
          undefined,
          controller.signal,
        );
        await this.command(
          '/usr/bin/afconvert',
          ['-f', 'WAVE', '-d', 'LEI16@24000', '-c', '1', intermediate, path],
          undefined,
          controller.signal,
        );
      } else if (process.platform === 'win32')
        await this.windows(
          'synthesize',
          { text, voice: voice.id, outputPath: path, rate: Math.round(10 * Math.log2(speechRate)) },
          controller.signal,
        );
      else throw new Error('loc.resonanz.error.noSystemVoice');
      controller.signal.throwIfAborted();
      const information = await stat(path);
      if (information.size < 44 || information.size > 32 * 1024 * 1024)
        throw new Error('loc.resonanz.error.clipSize');
      const header = (await readFile(path)).subarray(0, 12);
      if (
        information.size < 44 ||
        information.size > 32 * 1024 * 1024 ||
        header.toString('ascii', 0, 4) !== 'RIFF' ||
        header.toString('ascii', 8, 12) !== 'WAVE'
      )
        throw new Error('loc.resonanz.error.speechFormat');
      this._clips.set(`${sessionId}:${speechId}`, { sessionId, path, bytes: information.size });
      await this.trimClips(sessionId);
      return `resonanz-voice://session/${sessionId}/${speechId}`;
    } catch (cause) {
      await rm(path, { force: true });
      throw controller.signal.aborted ? new Error('loc.resonanz.error.speechAborted') : cause;
    } finally {
      try {
        await Promise.all([rm(source, { force: true }), rm(intermediate, { force: true })]);
      } finally {
        if (this._synthesis.get(sessionId) === controller) this._synthesis.delete(sessionId);
        this._synthesisDone.delete(sessionId);
        complete();
      }
    }
  }

  public voicePath(sessionId: string, speechId: string): string {
    dataSchemas.identifier.parse(sessionId);
    dataSchemas.identifier.parse(speechId);
    const clip = this._clips.get(`${sessionId}:${speechId}`);
    if (!clip) throw new Error('loc.resonanz.error.nativeClip');
    return clip.path;
  }

  public async cancel(sessionId: string): Promise<void> {
    this._synthesis.get(sessionId)?.abort();
    await this._synthesisDone.get(sessionId);
  }

  public async closeSession(sessionId: string): Promise<void> {
    this._closedSessions.add(dataSchemas.identifier.parse(sessionId));
    const cancelled = this.cancel(sessionId);
    try {
      await this.stop(sessionId);
    } finally {
      await cancelled;
      for (const [key, clip] of this._clips)
        if (clip.sessionId === sessionId) this._clips.delete(key);
      await rm(join(this._host.dataDirectory, 'voice', dataSchemas.identifier.parse(sessionId)), {
        recursive: true,
        force: true,
      });
    }
  }

  public async dispose(): Promise<void> {
    this._disposed = true;
    await this._tail;
    let stopError: unknown;
    try {
      if (this._active) await this.stop(this._active.sessionId);
    } catch (cause) {
      stopError = cause;
    }
    for (const controller of this._synthesis.values()) controller.abort();
    for (const child of this._children.keys()) child.kill('SIGKILL');
    await Promise.allSettled([...this._children.values()]);
    await Promise.allSettled([...this._synthesisDone.values()]);
    if (this._native && process.platform === 'darwin') {
      const backend =
        require('electron-native-speech-backend-macos') as typeof import('electron-native-speech-backend-macos');
      await backend.disposeHelperProcess();
      this._native.resetBackend();
    }
    await Promise.allSettled([...this._transcriptions]);
    this._clips.clear();
    await rm(join(this._host.dataDirectory, 'voice'), { recursive: true, force: true });
    await rm(join(this._host.dataDirectory, 'transcription'), { recursive: true, force: true });
    if (stopError) throw stopError;
  }

  private native(): typeof import('electron-native-speech') {
    return (this._native ??=
      require('electron-native-speech') as typeof import('electron-native-speech'));
  }

  private async listenActive(active: IRecognition): Promise<void> {
    if (this._disposed) throw new Error('loc.resonanz.error.recognitionStopped');
    if (active.recognition) return;
    const recognition = this._host.createSession
      ? await this._host.createSession()
      : process.platform === 'darwin'
        ? await this.native().createSpeechSession()
        : process.platform === 'win32'
          ? new WindowsSpeechSession(this._windowsExecutable, this._host.windowsScript)
          : undefined;
    if (!recognition) throw new Error('loc.resonanz.error.recognitionUnavailable');
    if (this._disposed) {
      await recognition.dispose();
      throw new Error('loc.resonanz.error.recognitionStopped');
    }
    active.recognition = recognition;
    const generation = ++active.generation;
    recognition.on('result', (result) => {
      if (this._active !== active || active.generation !== generation) return;
      this.result(active, result);
    });
    recognition.on('error', (error) => {
      if (error.code === 'no-speech-detected') {
        void this.serial(async () => {
          if (this._active !== active || active.generation !== generation) return;
          const hadText = Boolean(active.pending);
          await this.pauseActive(active);
          if (!hadText && this._active === active && !this._disposed)
            await this.listenActive(active);
        }).catch(() =>
          this._host.publish({
            type: 'speech.error',
            sessionId: active.sessionId,
            message: 'loc.resonanz.error.recognitionSilenceResume',
          }),
        );
        return;
      }
      if (this._active === active && active.generation === generation)
        this._host.publish({
          type: 'speech.error',
          sessionId: active.sessionId,
          message: 'loc.resonanz.error.recognitionInterrupted',
        });
    });
    try {
      await recognition.start({ locale: active.locale, continuous: true, interimResults: true });
    } catch (cause) {
      active.generation++;
      active.recognition = undefined;
      // SDK dispose may skip abort once a failed start has entered its error state.
      try {
        await recognition.abort();
      } finally {
        await recognition.dispose();
      }
      throw cause;
    }
  }

  private result(active: IRecognition, result: LiveSpeechResult): void {
    const text = result.text.trim();
    if (!text || text.length > 40_000) return;
    const now = Math.min(86_400_000, active.baseMs + performance.now() - active.origin);
    const changed = active.pending?.text !== text;
    active.pending = {
      id: active.pending?.id ?? randomUUID(),
      speaker: 'participant',
      text,
      final: false,
      startMs: active.pending?.startMs ?? Math.max(active.baseMs, now - 500),
      endMs: now,
    };
    this._host.publish({
      type: 'speech.result',
      sessionId: active.sessionId,
      ...active.pending,
      ...(active.operationId ? { operationId: active.operationId } : {}),
    });
    // Native recognizers can keep cumulative hypotheses open for a long time.
    // Endpoint only stable text and retire this recognition generation before committing.
    if (result.isFinal || changed) {
      if (active.timer) clearTimeout(active.timer);
      active.timer = setTimeout(
        () => {
          void this.serial(async () => {
            if (this._active === active) await this.pauseActive(active);
          }).catch(() =>
            this._host.publish({
              type: 'speech.error',
              sessionId: active.sessionId,
              message: 'loc.resonanz.error.recognizedSave',
            }),
          );
        },
        result.isFinal ? 0 : 900,
      );
    }
  }

  private async pauseActive(active: IRecognition): Promise<void> {
    if (active.timer) clearTimeout(active.timer);
    active.timer = undefined;
    const recognition = active.recognition;
    active.recognition = undefined;
    active.generation++;
    if (recognition) {
      try {
        await recognition.abort();
      } finally {
        await recognition.dispose();
      }
    }
    const pending = active.pending;
    if (!pending) return;
    const final = { ...pending, final: true };
    if (!active.operationId) await this._host.persist(active.sessionId, final);
    active.pending = undefined;
    this._host.publish({
      type: 'speech.result',
      sessionId: active.sessionId,
      ...final,
      ...(active.operationId ? { operationId: active.operationId } : {}),
    });
  }

  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this._tail.then(operation);
    this._tail = result.catch(() => undefined);
    return result;
  }

  private async metadata(): Promise<{ locales: string[]; voices: Voice[] }> {
    if (process.platform === 'win32')
      return JSON.parse(await this.windows('inspect', {}, undefined, 15_000)) as {
        locales: string[];
        voices: Voice[];
      };
    if (process.platform !== 'darwin') return { locales: [], voices: [] };
    const voices = (await this.command('/usr/bin/say', ['-v', '?'], undefined, undefined, 10_000))
      .split('\n')
      .flatMap((line) => {
        const match = /^(.+?)\s+([a-z]{2,3}_[A-Z]{2})\s+#/u.exec(line);
        return match
          ? [{ id: match[1]!.trim(), name: match[1]!.trim(), locale: match[2]!.replace('_', '-') }]
          : [];
      });
    const locales = JSON.parse(
      await this.command(
        '/usr/bin/osascript',
        [
          '-l',
          'JavaScript',
          '-e',
          'ObjC.import("Speech"); var locales=$.SFSpeechRecognizer.supportedLocales.allObjects; var result=[]; for(var i=0;i<locales.count;i++) result.push(ObjC.unwrap(locales.objectAtIndex(i).localeIdentifier).replace(/_/g,"-")); JSON.stringify(result);',
        ],
        undefined,
        undefined,
        10_000,
      ),
    ) as string[];
    return { locales, voices };
  }

  private async windows(
    mode: string,
    configuration: unknown,
    signal?: AbortSignal,
    timeout = 90_000,
  ): Promise<string> {
    return this.command(
      this._windowsExecutable,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        this._host.windowsScript,
        '-Mode',
        mode,
      ],
      `${JSON.stringify(configuration)}\n`,
      signal,
      timeout,
    );
  }

  private command(
    executable: string,
    arguments_: readonly string[],
    input?: string,
    signal?: AbortSignal,
    timeoutMs = 90_000,
  ): Promise<string> {
    signal?.throwIfAborted();
    const child = spawn(executable, [...arguments_], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let output = '';
    let failed = false;
    const abort = (): void => {
      failed = true;
      child.kill('SIGKILL');
    };
    const timeout = setTimeout(abort, timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
      if (output.length > 4 * 1024 * 1024) abort();
    });
    child.stderr.resume();
    child.stdin.on('error', () => undefined);
    child.stdin.end(input);
    let close!: () => void;
    const closed = new Promise<void>((resolve) => {
      close = resolve;
    });
    this._children.set(child, closed);
    return new Promise<string>((resolve, reject) => {
      child.once('error', () => {
        failed = true;
      });
      child.once('close', (code) => {
        clearTimeout(timeout);
        signal?.removeEventListener('abort', abort);
        this._children.delete(child);
        close();
        if (code === 0 && !failed) resolve(output.trim());
        else
          reject(
            new Error(
              signal?.aborted
                ? 'loc.resonanz.error.recognitionCancelled'
                : 'loc.resonanz.error.speechFailed',
            ),
          );
      });
    });
  }

  private async trimClips(sessionId: string): Promise<void> {
    const clips = [...this._clips.entries()].filter(([, clip]) => clip.sessionId === sessionId);
    let bytes = clips.reduce((total, [, clip]) => total + clip.bytes, 0);
    while (clips.length > 32 || bytes > 64 * 1024 * 1024) {
      const [key, clip] = clips.shift()!;
      this._clips.delete(key);
      bytes -= clip.bytes;
      await rm(clip.path, { force: true });
    }
  }
  // #endregion
}
