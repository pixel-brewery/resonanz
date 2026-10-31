// #region Imports
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { ownedProcessMessageSchema } from '@resonanz/contracts';
import type { IProcessIdentity } from './IProcessIdentity.js';
import { readProcessIdentity } from './readProcessIdentity.js';
// #endregion

interface IOwnedRecord {
  readonly pid: number;
  readonly detached: boolean;
  readonly owner: number;
  identity: IProcessIdentity | undefined;
  capture: Promise<void>;
}
const execute = promisify(execFile);

/**
 * Confirms and reaps only native work registered by one exact Utility Process generation.
 *
 * @public
 */
export class OwnedProcessSupervisor {
  // #region Fields
  private readonly _ownerPid: () => number | undefined;
  private readonly _readIdentity: (pid: number) => Promise<IProcessIdentity | null>;
  private readonly _owned = new Map<string, IOwnedRecord>();
  // #endregion
  // #region Ctor
  /**
   * Captures the exact process owner and an explicit identity reader for bounded native verification.
   *
   * @public
   */
  public constructor(
    ownerPid: () => number | undefined,
    readIdentity: (pid: number) => Promise<IProcessIdentity | null> = readProcessIdentity,
  ) {
    this._ownerPid = ownerPid;
    this._readIdentity = readIdentity;
  }
  // #endregion
  // #region Methods
  /**
   * Records a trusted spawn or releases a closed process only after its owned group is absent.
   *
   * @public
   */
  public async observe(raw: unknown): Promise<void> {
    const message = ownedProcessMessageSchema.parse(raw);
    if (message.type === 'process.closed') {
      const record = this._owned.get(message.token);
      if (!record || record.pid !== message.pid) return;
      await record.capture.catch(() => undefined);
      if (process.platform !== 'win32' && !this.present(record)) this._owned.delete(message.token);
      return;
    }
    if (this._owned.has(message.token))
      throw new Error('A native process ownership token was reused.');
    const owner = this._ownerPid();
    if (!owner) throw new Error('The native process owner is unavailable.');
    const record: IOwnedRecord = {
      pid: message.pid,
      detached: message.detached,
      owner,
      identity: undefined,
      capture: Promise.resolve(),
    };
    this._owned.set(message.token, record);
    record.capture = (async () => {
      const identity = await this._readIdentity(message.pid);
      if (!identity) {
        if (await this.awaitAbsence(record, 2000)) {
          this._owned.delete(message.token);
          return;
        }
        throw new Error('The owned native process identity could not be confirmed.');
      }
      if (
        identity.parentPid !== owner ||
        (message.detached && process.platform !== 'win32' && identity.groupId !== message.pid)
      )
        throw new Error('The reported native process does not match its Utility owner.');
      record.identity = identity;
    })();
    await record.capture;
  }
  /**
   * Awaits confirmed cleanup before a background replacement may reuse application profiles.
   *
   * @public
   */
  public async cleanup(graceful = false): Promise<void> {
    const failures: unknown[] = [];
    for (const [token, record] of this._owned) {
      try {
        await record.capture.catch(() => undefined);
        if (process.platform === 'win32') await this.cleanupWindows(record, graceful);
        else await this.cleanupPosix(record);
        this._owned.delete(token);
      } catch (cause) {
        failures.push(cause);
      }
    }
    if (failures.length)
      throw new Error(
        'Native Assistentenprozesse konnten nicht sicher bereinigt werden. Der Hintergrunddienst wird nicht automatisch ersetzt.',
        { cause: new AggregateError(failures) },
      );
  }
  private target(record: IOwnedRecord): number {
    return record.detached && process.platform !== 'win32' ? -record.pid : record.pid;
  }
  private present(record: IOwnedRecord): boolean {
    try {
      process.kill(this.target(record), 0);
      return true;
    } catch (cause) {
      if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ESRCH')
        return false;
      throw cause;
    }
  }
  private async proveIdentity(record: IOwnedRecord): Promise<boolean> {
    if (!this.present(record)) return false;
    if (!record.identity) throw new Error('The native process has no confirmed original identity.');
    const current = await this._readIdentity(record.pid);
    if (
      current &&
      (current.startedAt !== record.identity.startedAt ||
        current.groupId !== record.identity.groupId)
    )
      throw new Error('A reused process identifier must not be signalled.');
    if (!current && !record.detached)
      throw new Error(
        'The original native process is absent but its ownership cannot be established.',
      );
    return true;
  }
  private async cleanupPosix(record: IOwnedRecord): Promise<void> {
    if (!(await this.proveIdentity(record))) return;
    this.signal(record, 'SIGTERM');
    if (await this.awaitAbsence(record, 500)) return;
    if (!(await this.proveIdentity(record))) return;
    this.signal(record, 'SIGKILL');
    if (!(await this.awaitAbsence(record, 1500)))
      throw new Error('The owned native process group is still present.');
  }
  private signal(record: IOwnedRecord, signal: 'SIGTERM' | 'SIGKILL'): void {
    try {
      process.kill(this.target(record), signal);
    } catch (cause) {
      if (!cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'ESRCH')
        throw cause;
    }
  }
  private async awaitAbsence(record: IOwnedRecord, budget: number): Promise<boolean> {
    const deadline = performance.now() + budget;
    while (performance.now() < deadline) {
      if (!this.present(record)) return true;
      await delay(10);
    }
    return !this.present(record);
  }
  private async cleanupWindows(record: IOwnedRecord, graceful: boolean): Promise<void> {
    const current = await this._readIdentity(record.pid);
    if (!current) {
      if (graceful) return;
      throw new Error(
        'After an unexpected Windows owner exit, descendant cleanup cannot be established from an absent root.',
      );
    }
    if (!record.identity || current.startedAt !== record.identity.startedAt)
      throw new Error('The Windows native process identity no longer matches.');
    const systemRoot = process.env['SystemRoot'] ?? process.env['SYSTEMROOT'];
    if (!systemRoot) throw new Error('Windows native cleanup tools are unavailable.');
    await execute(
      join(systemRoot, 'System32', 'taskkill.exe'),
      ['/PID', String(record.pid), '/T', '/F'],
      { timeout: 5000, maxBuffer: 64 * 1024, windowsHide: true },
    );
    if (!(await this.awaitAbsence(record, 1500)))
      throw new Error('The owned Windows process did not terminate.');
  }
  // #endregion
}
