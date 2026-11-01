// #region Imports
import { utilityProcess, type UtilityProcess } from 'electron';
import { randomUUID } from 'node:crypto';
import {
  appEventSchema,
  requestEnvelopeSchema,
  responseEnvelopeSchema,
  ownedProcessMessageSchema,
  type AppEvent,
  type RequestMethod,
} from '@resonanz/contracts';
import { OwnedProcessSupervisor } from './OwnedProcessSupervisor.js';
// #endregion

/**
 * Supervises one Utility Process, native descendants and correlated bounded requests.
 *
 * @public
 */
export class BackgroundService {
  // #region Fields
  private readonly _entry: string;
  private readonly _root: string;
  private readonly _publish: (event: AppEvent) => void;
  private _process: UtilityProcess | undefined;
  private _ready: Promise<void> | undefined;
  private _resolveReady: (() => void) | undefined;
  private _rejectReady: ((cause: Error) => void) | undefined;
  private readonly _pending = new Map<
    string,
    { resolve: (value: unknown) => void; reject: (cause: Error) => void; timer: NodeJS.Timeout }
  >();
  private _stopping = false;
  private _restarts = 0;
  private _restartTimer: NodeJS.Timeout | undefined;
  private _cleanup: Promise<void> | undefined;
  private _cleanupFailure: Error | undefined;
  // #endregion
  // #region Ctor
  /**
   * Captures the built executable, private data root and event publisher.
   *
   * @public
   */
  public constructor(entry: string, root: string, publish: (event: AppEvent) => void) {
    this._entry = entry;
    this._root = root;
    this._publish = publish;
  }
  // #endregion
  // #region Methods
  /**
   * Starts one background generation only after cleanup of the prior generation is proven.
   *
   * @public
   */
  public start(): Promise<void> {
    if (this._stopping) return Promise.reject(new Error('loc.resonanz.error.quitting'));
    if (this._cleanup) return this._cleanup.then(() => this.start());
    if (this._cleanupFailure) return Promise.reject(this._cleanupFailure);
    if (this._ready) return this._ready;
    this._publish({ type: 'runtime.status', state: this._restarts ? 'restarting' : 'starting' });
    this._ready = new Promise((resolve, reject) => {
      this._resolveReady = resolve;
      this._rejectReady = reject;
    });
    void this._ready.catch(() => undefined);
    const worker = utilityProcess.fork(this._entry, [], {
      serviceName: 'Resonanz background service',
      env: { ...process.env, RESONANZ_DATA_ROOT: this._root },
      stdio: 'pipe',
    });
    this._process = worker;
    const ownership = new OwnedProcessSupervisor(() => worker.pid);
    let graceful = false;
    const readyTimeout = setTimeout(() => {
      this._rejectReady?.(new Error('loc.resonanz.error.backgroundStart'));
      worker.kill();
    }, 30_000);
    worker.stdout?.on('data', (bytes: Buffer) => process.stdout.write(bytes));
    worker.stderr?.on('data', (bytes: Buffer) => process.stderr.write(bytes));
    worker.on('message', (raw: unknown) => {
      const owned = ownedProcessMessageSchema.safeParse(raw);
      if (owned.success) {
        void ownership.observe(owned.data).catch(() => {
          this._cleanupFailure = new Error('loc.resonanz.error.ownerUnconfirmed');
          worker.kill();
        });
        return;
      }
      if (raw && typeof raw === 'object' && 'type' in raw) {
        if (raw.type === 'background.ready') {
          clearTimeout(readyTimeout);
          this._resolveReady?.();
          this._publish({ type: 'runtime.status', state: 'ready' });
          return;
        }
        if (raw.type === 'background.stopped') {
          graceful = true;
          return;
        }
        if (raw.type === 'app.event' && 'event' in raw) {
          const event = appEventSchema.safeParse(raw.event);
          if (event.success) this._publish(event.data);
          return;
        }
      }
      const response = responseEnvelopeSchema.safeParse(raw);
      if (!response.success) return;
      const waiting = this._pending.get(response.data.correlationId);
      if (!waiting) return;
      clearTimeout(waiting.timer);
      this._pending.delete(response.data.correlationId);
      if (response.data.ok) waiting.resolve(response.data.data);
      else waiting.reject(new Error(response.data.error.message));
    });
    worker.once('exit', () => {
      clearTimeout(readyTimeout);
      this._process = undefined;
      this._ready = undefined;
      this._rejectReady?.(new Error('loc.resonanz.error.backgroundExit'));
      for (const pending of this._pending.values()) {
        clearTimeout(pending.timer);
        pending.reject(new Error('loc.resonanz.error.backgroundInterrupted'));
      }
      this._pending.clear();
      const cleanup = ownership.cleanup(graceful);
      this._cleanup = cleanup;
      void cleanup.then(
        () => {
          if (this._cleanup === cleanup) this._cleanup = undefined;
          this._cleanupFailure = undefined;
          if (this._stopping) return;
          if (this._restarts++ < 3)
            this._restartTimer = setTimeout(() => {
              void this.start().catch(() => undefined);
            }, 500);
          else this.stopped('loc.resonanz.error.backgroundRestart');
        },
        (cause: unknown) => {
          if (this._cleanup === cleanup) this._cleanup = undefined;
          this._cleanupFailure =
            cause instanceof Error ? cause : new Error('loc.resonanz.error.assistantCleanup');
          this.stopped(this._cleanupFailure.message);
        },
      );
    });
    return this._ready;
  }
  /**
   * Sends only one validated public operation to the Utility Process.
   *
   * @public
   */
  public async request(method: RequestMethod, payload: unknown): Promise<unknown> {
    return this.send(
      requestEnvelopeSchema.parse({ correlationId: randomUUID(), method, payload }),
      30_000,
    );
  }
  /**
   * Imports only the path chosen by a native file dialog.
   *
   * @public
   */
  public async importFile(path: string): Promise<unknown> {
    return this.send({ type: 'host.import-file', correlationId: randomUUID(), path }, 30_000);
  }
  /**
   * Awaits real Utility exit and confirmed native cleanup instead of treating a kill request as completion.
   *
   * @public
   */
  public async dispose(): Promise<void> {
    this._stopping = true;
    if (this._restartTimer) clearTimeout(this._restartTimer);
    const worker = this._process;
    if (worker) {
      await new Promise<void>((resolve, reject) => {
        let forced: NodeJS.Timeout | undefined;
        const graceful = setTimeout(() => {
          worker.kill();
          forced = setTimeout(
            () => reject(new Error('loc.resonanz.error.backgroundTerminate')),
            2500,
          );
        }, 10_000);
        worker.once('exit', () => {
          clearTimeout(graceful);
          if (forced) clearTimeout(forced);
          resolve();
        });
        worker.postMessage({ type: 'host.shutdown' });
      });
    }
    if (this._cleanup) await this._cleanup;
    if (this._cleanupFailure) throw this._cleanupFailure;
  }
  private stopped(message: string): void {
    this._publish({ type: 'runtime.status', state: 'stopped', message });
  }
  private async send(
    message: { correlationId: string; [key: string]: unknown },
    timeout: number,
  ): Promise<unknown> {
    await this.start();
    if (this._pending.size >= 100) throw new Error('loc.resonanz.error.queueFull');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._pending.delete(message.correlationId);
        reject(new Error('loc.resonanz.error.backgroundTimeout'));
      }, timeout);
      this._pending.set(message.correlationId, { resolve, reject, timer });
      this._process?.postMessage(message);
    });
  }
  // #endregion
}
