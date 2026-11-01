import { BrowserWindow, screen, type WebContents, type WebFrameMain } from 'electron';
import {
  appEventSchema,
  channels,
  initialMiniRecorderSnapshot,
  type IMiniRecorderSnapshot,
  type MiniRecorderMode,
} from '@resonanz/contracts';

export interface IMiniRecorderWindowOptions {
  readonly preload: string;
  readonly index: string;
  readonly developmentUrl?: string;
  readonly hidden: boolean;
}

/** Owns only a passive native surface; media remains in the main renderer. */
export class MiniRecorderWindow {
  private _window: BrowserWindow | undefined;
  private _creating: Promise<void> | undefined;
  private _snapshot: IMiniRecorderSnapshot = initialMiniRecorderSnapshot;
  private _mode: MiniRecorderMode = 'expanded';
  private _disposed = false;
  private _unavailable = false;

  public constructor(private readonly _options: IMiniRecorderWindowOptions) {}

  public get snapshot(): IMiniRecorderSnapshot {
    return this._snapshot;
  }

  /** Restricts requests to this exact surface's main frame. */
  public trusts(sender: WebContents, frame: WebFrameMain | null): boolean {
    return Boolean(
      this._window &&
      !this._window.isDestroyed() &&
      sender === this._window.webContents &&
      frame === this._window.webContents.mainFrame,
    );
  }

  /** Coalesced caller data is validated at IPC and never acquires a microphone here. */
  public async update(snapshot: IMiniRecorderSnapshot): Promise<void> {
    if (this._disposed) return;
    const newSession = snapshot.sessionId !== this._snapshot.sessionId;
    this._snapshot = snapshot;
    if (newSession) {
      this._mode = 'expanded';
      this._unavailable = false;
    }
    if (!snapshot.active || !snapshot.visible) {
      if (this._window && !this._window.isDestroyed()) {
        this._window.webContents.send(
          channels.event,
          appEventSchema.parse({ type: 'mini.state', snapshot }),
        );
        this._window.hide();
      }
      return;
    }
    if (this._unavailable) throw new Error('loc.resonanz.error.miniUnavailable');
    await this.ensureWindow();
    if (this._disposed || !this._window || this._window.isDestroyed()) return;
    this.resize(this._snapshot.feedback ? 'feedback' : this._mode);
    this._window.webContents.send(
      channels.event,
      appEventSchema.parse({ type: 'mini.state', snapshot: this._snapshot }),
    );
    if (this._snapshot.active && this._snapshot.visible && !this._options.hidden)
      this._window.showInactive();
    else this._window.hide();
  }

  /** Preserves the right/bottom anchor when the passive UI changes its compact mode. */
  public resize(mode: MiniRecorderMode): void {
    this._mode = mode;
    if (!this._window || this._window.isDestroyed()) return;
    const current = this._window.getBounds();
    const width = mode === 'collapsed' ? 122 : mode === 'feedback' ? 430 : 332;
    const height = mode === 'collapsed' ? 48 : 60;
    const area = screen.getDisplayMatching(current).workArea;
    this._window.setBounds({
      x: Math.round(
        Math.max(area.x, Math.min(current.x + current.width - width, area.x + area.width - width)),
      ),
      y: Math.round(
        Math.max(
          area.y,
          Math.min(current.y + current.height - height, area.y + area.height - height),
        ),
      ),
      width,
      height,
    });
  }

  /** Invalidates controls synchronously when their recording owner disappears. */
  public reset(): void {
    this._snapshot = {
      ...this._snapshot,
      active: false,
      sessionId: null,
      visible: false,
      feedback: null,
    };
    if (this._window && !this._window.isDestroyed()) {
      this._window.webContents.send(
        channels.event,
        appEventSchema.parse({ type: 'mini.state', snapshot: this._snapshot }),
      );
      this._window.hide();
    }
  }

  /** Closes only the surface owned by this application. */
  public dispose(): void {
    this._disposed = true;
    this.reset();
    this._window?.destroy();
    this._window = undefined;
  }

  private async ensureWindow(): Promise<void> {
    if (this._window && !this._window.isDestroyed()) return;
    if (!this._creating)
      this._creating = this.create()
        .catch((error) => {
          this._unavailable = true;
          this._window?.destroy();
          throw error;
        })
        .finally(() => {
          this._creating = undefined;
        });
    await this._creating;
  }

  private async create(): Promise<void> {
    if (this._disposed) return;
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
    const window = new BrowserWindow({
      x: area.x + area.width - 356,
      y: area.y + area.height - 84,
      width: 332,
      height: 60,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      resizable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#00000000',
      title: 'Resonanz Mini Recorder',
      webPreferences: {
        preload: this._options.preload,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webSecurity: true,
        backgroundThrottling: false,
        additionalArguments: ['--resonanz-surface=mini'],
      },
    });
    this._window = window;
    window.setAlwaysOnTop(true, 'floating');
    if (process.platform === 'darwin')
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.on('render-process-gone', () => {
      this._unavailable = true;
      window.destroy();
    });
    window.on('closed', () => {
      if (this._window === window) this._window = undefined;
    });
    if (this._options.developmentUrl) {
      const url = new URL(this._options.developmentUrl);
      url.hash = '/mini-recorder';
      await window.loadURL(url.toString());
    } else await window.loadFile(this._options.index, { hash: '/mini-recorder' });
    if (this._disposed && !window.isDestroyed()) window.destroy();
  }
}
