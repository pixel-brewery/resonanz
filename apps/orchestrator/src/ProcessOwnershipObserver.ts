// #region Imports
import { ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { tracingChannel } from 'node:diagnostics_channel';
import { ownedProcessMessageSchema } from '@resonanz/contracts';
// #endregion

/**
 * Explicit host observation of Synapse-owned native spawns without replacing its process runtime.
 *
 * @public
 */
export class ProcessOwnershipObserver {
  // #region Fields
  private readonly _trace = tracingChannel('child_process.spawn');
  private readonly _report: (message: unknown) => void;
  private readonly _listeners: { start: (message: unknown) => void };
  private readonly _children = new Map<ChildProcess, { spawn: () => void; close: () => void }>();
  // #endregion
  // #region Ctor
  /**
   * Subscribes only when the Utility bootstrap explicitly creates its observer.
   *
   * @public
   */
  public constructor(report: (message: unknown) => void) {
    this._report = report;
    this._listeners = { start: (message) => this.observe(message) };
    this._trace.subscribe(this._listeners);
  }
  // #endregion
  // #region Methods
  /**
   * Unsubscribes after the application has drained all owned runtime work.
   *
   * @public
   */
  public dispose(): void {
    this._trace.unsubscribe(this._listeners);
    for (const [child, listeners] of this._children) {
      child.removeListener('spawn', listeners.spawn);
      child.removeListener('close', listeners.close);
    }
    this._children.clear();
  }
  private observe(raw: unknown): void {
    if (
      !raw ||
      typeof raw !== 'object' ||
      !('process' in raw) ||
      !(raw.process instanceof ChildProcess) ||
      !('options' in raw)
    )
      return;
    const child = raw.process;
    const options = raw.options;
    const detached = Boolean(
      options && typeof options === 'object' && 'detached' in options && options.detached === true,
    );
    const token = randomUUID();
    let pid: number | undefined;
    const spawn = (): void => {
      pid = child.pid;
      if (!pid) return;
      this._report(
        ownedProcessMessageSchema.parse({ type: 'process.spawned', token, pid, detached }),
      );
    };
    const close = (): void => {
      this._children.delete(child);
      if (pid)
        this._report(ownedProcessMessageSchema.parse({ type: 'process.closed', token, pid }));
    };
    this._children.set(child, { spawn, close });
    child.once('spawn', spawn);
    child.once('close', close);
  }
  // #endregion
}
