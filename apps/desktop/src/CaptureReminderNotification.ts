import type { IMiniRecorderSnapshot, RequestPayload } from '@resonanz/contracts';
import type { TranslationKey } from '@resonanz/intl';

/** Minimal native-notification seam; no Electron or OS driver is loaded here. */
export interface ICaptureReminderNotice {
  on(event: 'click', listener: () => void): unknown;
  on(event: 'failed', listener: () => void): unknown;
  on(event: 'close', listener: (event?: unknown) => void): unknown;
  on(event: 'action', listener: (event: unknown, index?: number) => void): unknown;
  show(): void;
  close(): void;
}

export interface ICaptureReminderNotificationDependencies {
  readonly current: () => IMiniRecorderSnapshot;
  readonly create: (options: {
    readonly title: string;
    readonly body: string;
    readonly actions: readonly string[];
  }) => ICaptureReminderNotice | null;
  readonly open: () => Promise<void> | void;
  readonly command: (sessionId: string, action: 'continue' | 'stop') => void;
  readonly text: (key: TranslationKey) => string;
  readonly failed: (sessionId: string) => void;
}

interface IReminderEntry {
  readonly sessionId: string;
  readonly reminderId: string;
  notice: ICaptureReminderNotice | null;
  consumed: boolean;
}

/** Owns one native reminder while capture and its visible fallback stay elsewhere. */
export class CaptureReminderNotification {
  // Five-minute reminders cannot normally reach this bound within a 24-hour archive.
  private static readonly _maximumIdentitiesPerCapture = 512;
  private _sessionId: string | null = null;
  private _entry: IReminderEntry | null = null;
  private _unclosed: ICaptureReminderNotice | null = null;
  private readonly _seen = new Map<string, boolean>();
  private _overflowReported = false;

  public constructor(private readonly _dependencies: ICaptureReminderNotificationDependencies) {}

  /** Accepts only a currently active, matching capture; duplicate identities never redeliver. */
  public update(input: RequestPayload<'capture.reminder'>): void {
    const current = this._dependencies.current();
    this.sync(current);
    if (!current.active || current.sessionId !== input.sessionId) return;
    if (!input.visible) {
      this.remember(input.reminderId);
      if (
        this._entry?.sessionId === input.sessionId &&
        this._entry.reminderId === input.reminderId
      ) {
        if (!this.clearCurrent()) this.report(input.sessionId, input.reminderId);
      }
      return;
    }
    if (!this.eligible(current, input.sessionId)) return;
    const identity = this.remember(input.reminderId);
    if (identity === 'existing') return;
    if (identity === 'full') {
      if (!this._overflowReported) {
        this._overflowReported = true;
        this._dependencies.failed(input.sessionId);
      }
      return;
    }
    if (!this.clearCurrent()) {
      this.report(input.sessionId, input.reminderId);
      return;
    }
    let notice: ICaptureReminderNotice | null;
    try {
      notice = this._dependencies.create({
        title: this._dependencies.text('loc.resonanz.capture.silenceTitle'),
        body: this._dependencies.text('loc.resonanz.capture.silenceDescription'),
        actions: [
          this._dependencies.text('loc.resonanz.capture.continueRecording'),
          this._dependencies.text('loc.resonanz.capture.saveStop'),
        ],
      });
    } catch {
      this.report(input.sessionId, input.reminderId);
      return;
    }
    // Unsupported/headless delivery is a valid absence; the visible banner remains available.
    if (!notice) return;
    if (!this.eligible(this._dependencies.current(), input.sessionId)) {
      this.closeNotice(notice);
      return;
    }
    const entry: IReminderEntry = {
      sessionId: input.sessionId,
      reminderId: input.reminderId,
      notice,
      consumed: false,
    };
    this._entry = entry;
    try {
      notice.on('click', () => this.clicked(entry));
      notice.on('action', (event, index) =>
        this.action(
          entry,
          event &&
            typeof event === 'object' &&
            'actionIndex' in event &&
            typeof event.actionIndex === 'number'
            ? event.actionIndex
            : index,
        ),
      );
      notice.on('failed', () => this.failed(entry));
      notice.on('close', (event) => {
        if (this._entry !== entry) return;
        if (!this.eligible(this._dependencies.current(), entry.sessionId)) {
          this.clearCurrent();
          return;
        }
        // Windows can retain a timed-out notice in Action Center; its later click
        // still has to pass the same live capture/reminder checks.
        if (!(
          event &&
          typeof event === 'object' &&
          'reason' in event &&
          event.reason === 'timedOut'
        ))
          entry.consumed = true;
      });
      if (this.usable(entry)) notice.show();
      else this.clearCurrent();
    } catch {
      this.failed(entry);
    }
  }

  /** Invalidates native callbacks immediately on stop, capture change, pause or busy state. */
  public sync(snapshot: IMiniRecorderSnapshot): void {
    const sessionId = snapshot.active ? snapshot.sessionId : null;
    if (sessionId !== this._sessionId) {
      this.clearCurrent();
      this._sessionId = sessionId;
      this._seen.clear();
      this._overflowReported = false;
    }
    if (this._entry && !this.eligible(snapshot, this._entry.sessionId)) this.clearCurrent();
  }

  /** Closes the owned notice and invalidates callbacks; same-capture tombstones remain bounded. */
  public reset(): void {
    this.clearCurrent();
  }

  private eligible(snapshot: IMiniRecorderSnapshot, sessionId: string): boolean {
    return (
      snapshot.active && snapshot.sessionId === sessionId && !snapshot.paused && !snapshot.busy
    );
  }

  private usable(entry: IReminderEntry): boolean {
    return (
      this._entry === entry &&
      !entry.consumed &&
      this.eligible(this._dependencies.current(), entry.sessionId)
    );
  }

  private clicked(entry: IReminderEntry): void {
    if (!this.usable(entry)) return;
    this.consume(entry);
    try {
      const opening = this._dependencies.open();
      if (opening)
        void opening.catch(() => {
          if (this._entry === entry) this.report(entry.sessionId, entry.reminderId);
        });
    } catch {
      if (this._entry === entry) this.report(entry.sessionId, entry.reminderId);
    }
  }

  private action(entry: IReminderEntry, index: number | undefined): void {
    if (!this.usable(entry) || (index !== 0 && index !== 1)) return;
    this.consume(entry);
    if (!this.eligible(this._dependencies.current(), entry.sessionId) || this._entry !== entry)
      return;
    try {
      this._dependencies.command(entry.sessionId, index === 0 ? 'continue' : 'stop');
    } catch {
      this.report(entry.sessionId, entry.reminderId);
    }
  }

  private failed(entry: IReminderEntry): void {
    if (!this.usable(entry)) return;
    this.consume(entry);
    this.report(entry.sessionId, entry.reminderId);
  }

  private consume(entry: IReminderEntry): void {
    entry.consumed = true;
    const notice = entry.notice;
    entry.notice = null;
    if (notice && !this.closeNotice(notice)) this.report(entry.sessionId, entry.reminderId);
  }

  private remember(reminderId: string): 'new' | 'existing' | 'full' {
    if (this._seen.has(reminderId)) return 'existing';
    if (this._seen.size >= CaptureReminderNotification._maximumIdentitiesPerCapture) return 'full';
    this._seen.set(reminderId, false);
    return 'new';
  }

  private report(sessionId: string, reminderId: string): void {
    if (
      this._seen.get(reminderId) !== false ||
      !this.eligible(this._dependencies.current(), sessionId)
    )
      return;
    this._seen.set(reminderId, true);
    this._dependencies.failed(sessionId);
  }

  private closeNotice(notice: ICaptureReminderNotice): boolean {
    try {
      notice.close();
      return true;
    } catch {
      this._unclosed = notice;
      return false;
    }
  }

  private clearCurrent(): boolean {
    const entry = this._entry;
    this._entry = null;
    const old = entry?.notice ?? this._unclosed;
    if (entry) {
      entry.consumed = true;
      entry.notice = null;
    }
    if (!old) return true;
    this._unclosed = null;
    return this.closeNotice(old);
  }
}
