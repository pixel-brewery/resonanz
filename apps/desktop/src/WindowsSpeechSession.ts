// #region Imports
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type {
  LiveSpeechResult,
  SpeechError,
  SpeechSession,
  SpeechSessionStartOptions,
  SpeechSessionState,
} from 'electron-native-speech';
// #endregion

/** Owns one Windows System.Speech recognizer and its bounded process cleanup. */
export class WindowsSpeechSession implements SpeechSession {
  // #region Fields
  private readonly _events = new EventEmitter();
  private readonly _executable: string;
  private readonly _script: string;
  private _child: ChildProcessWithoutNullStreams | undefined;
  private _closed: Promise<void> = Promise.resolve();
  private _stopping = false;
  // #endregion
  // #region Ctor
  public constructor(executable: string, script: string) {
    this._executable = executable;
    this._script = script;
  }
  // #endregion
  // #region Methods
  public async start(options: SpeechSessionStartOptions = {}): Promise<void> {
    if (this._child) throw new Error('loc.resonanz.error.recognitionRunning');
    this._stopping = false;
    const child = spawn(
      this._executable,
      [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        this._script,
        '-Mode',
        'listen',
      ],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
    this._child = child;
    this._closed = new Promise((resolve) =>
      child.once('close', () => {
        this._child = undefined;
        resolve();
      }),
    );
    let buffer = '';
    await new Promise<void>((resolve, reject) => {
      let ready = false;
      const timeout = setTimeout(() => {
        child.kill();
        reject(new Error('loc.resonanz.error.windowsRecognitionStart'));
      }, 15_000);
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => {
        buffer += chunk;
        if (buffer.length > 128_000) {
          child.kill();
          return;
        }
        const lines = buffer.split(/\r?\n/u);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const event = JSON.parse(line) as {
              type: string;
              text?: string;
              isFinal?: boolean;
              timestampMs?: number;
            };
            if (event.type === 'ready') {
              ready = true;
              clearTimeout(timeout);
              this._events.emit('state', 'listening');
              resolve();
            } else if (
              event.type === 'result' &&
              typeof event.text === 'string' &&
              event.text.length <= 40_000
            )
              this._events.emit('result', {
                text: event.text,
                isFinal: event.isFinal === true,
                timestampMs: event.timestampMs,
              } satisfies LiveSpeechResult);
            else if (event.type === 'error')
              this._events.emit('error', {
                code: 'backend-failure',
                message: 'loc.resonanz.error.windowsSpeechInterrupted',
              });
          } catch {
            child.kill();
          }
        }
      });
      child.stderr.resume();
      child.once('error', () => {
        clearTimeout(timeout);
        reject(new Error('loc.resonanz.error.powershell'));
      });
      child.once('close', () => {
        clearTimeout(timeout);
        if (!ready) reject(new Error('loc.resonanz.error.recognitionLanguage'));
        else {
          if (!this._stopping)
            this._events.emit('error', {
              code: 'backend-failure',
              message: 'loc.resonanz.error.windowsSpeechExit',
            });
          this._events.emit('state', 'stopped');
        }
      });
      child.stdin.on('error', () => undefined);
      child.stdin.write(`${JSON.stringify({ locale: options.locale })}\n`);
    });
  }
  public async stop(): Promise<void> {
    await this.abort();
  }
  public async abort(): Promise<void> {
    const child = this._child;
    if (!child) return;
    this._stopping = true;
    child.stdin.end('stop\n');
    const timeout = setTimeout(() => child.kill('SIGKILL'), 1500);
    try {
      await this._closed;
    } finally {
      clearTimeout(timeout);
    }
  }
  public async dispose(): Promise<void> {
    await this.abort();
    this._events.removeAllListeners();
  }
  public on(event: 'result', listener: (result: LiveSpeechResult) => void): () => void;
  public on(event: 'error', listener: (error: SpeechError) => void): () => void;
  public on(event: 'state', listener: (state: SpeechSessionState) => void): () => void;
  public on(
    event: string,
    listener:
      | ((result: LiveSpeechResult) => void)
      | ((error: SpeechError) => void)
      | ((state: SpeechSessionState) => void),
  ): () => void {
    this._events.on(event, listener);
    return () => this._events.off(event, listener);
  }
  // #endregion
}
