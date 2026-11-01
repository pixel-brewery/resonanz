import type { BrowserWindow, Rectangle } from 'electron';
import type { RequestPayload } from '@resonanz/contracts';

type Surface = RequestPayload<'window.present'>['surface'];
type Window = Pick<
  BrowserWindow,
  | 'getBounds'
  | 'getContentBounds'
  | 'getNormalBounds'
  | 'isMaximized'
  | 'isFullScreen'
  | 'maximize'
  | 'unmaximize'
  | 'setBounds'
  | 'setContentSize'
  | 'setMinimumSize'
  | 'setPosition'
  | 'setResizable'
  | 'setWindowButtonVisibility'
>;
interface ISavedPresentation {
  readonly bounds: Rectangle;
  readonly maximized: boolean;
}

/** Changes the existing workspace's native presentation without replacing its renderer/media owner. */
export class WindowPresentation {
  private _surface: Surface = 'workspace';
  private _requested: Surface = 'workspace';
  private _tray = false;
  private _traySizingActive = false;
  private _trayAnchor: Rectangle | null = null;
  private _trayHeight = 660;
  private readonly _saved = new Map<Surface, ISavedPresentation>();

  public constructor(
    private readonly _workArea: (bounds: Rectangle) => Rectangle,
    private readonly _platform: string,
  ) {}
  public get requested(): Surface {
    return this._requested;
  }
  /** Hidden/restored windows reject late measurements from a closing tray. */
  public get traySizingActive(): boolean {
    return this._tray && this._traySizingActive;
  }

  /** A route change adjusts geometry only; showing/focusing stays an explicit Main action. */
  public present(window: Window, surface: Surface): void {
    this._requested = surface;
    if (this._tray || window.isFullScreen() || surface === this._surface) return;
    this.remember(window);
    if (window.isMaximized()) window.unmaximize();
    this._surface = surface;
    this.apply(window, surface);
  }

  /** Reopens the presentation that was visible before the tray reused this window. */
  public restore(window: Window): void {
    this._traySizingActive = false;
    if (!this._tray || window.isFullScreen()) return;
    this._tray = false;
    this._surface = this._requested;
    this.apply(window, this._surface);
  }

  public tray(window: Window, anchor: Rectangle, area: Rectangle): void {
    if (window.isFullScreen()) return;
    if (!this._tray) this.remember(window);
    this._tray = true;
    this._traySizingActive = true;
    this._trayAnchor = { ...anchor };
    if (window.isMaximized()) window.unmaximize();
    window.setMinimumSize(1, 1);
    window.setResizable(false);
    if (this._platform === 'darwin') window.setWindowButtonVisibility(false);
    this.applyTray(window, area);
  }

  /** Resizes only the current tray and leaves saved workspace geometry untouched. */
  public resizeTray(window: Window, height: number): void {
    if (
      !this.traySizingActive ||
      window.isFullScreen() ||
      !Number.isInteger(height) ||
      height < 1 ||
      height > 4096 ||
      !this._trayAnchor
    )
      return;
    this._trayHeight = height;
    this.applyTray(window, this._workArea(this._trayAnchor));
  }

  /** Hiding preserves restoration history while invalidating pending renderer measurements. */
  public hideTray(): void {
    this._traySizingActive = false;
  }

  public reset(): void {
    this._surface = 'workspace';
    this._requested = 'workspace';
    this._tray = false;
    this._traySizingActive = false;
    this._trayAnchor = null;
    this._trayHeight = 660;
    this._saved.clear();
  }

  private remember(window: Window): void {
    this._saved.set(this._surface, {
      bounds: window.isMaximized() ? window.getNormalBounds() : window.getBounds(),
      maximized: window.isMaximized(),
    });
  }

  private applyTray(window: Window, area: Rectangle): void {
    const anchor = this._trayAnchor;
    if (!anchor) return;
    const frame = this.frame(window);
    const width = Math.min(368, Math.max(1, area.width - 16 - frame.width));
    const height = Math.min(this._trayHeight, Math.max(1, area.height - 24 - frame.height));
    const content = window.getContentBounds();
    if (content.width !== width || content.height !== height) window.setContentSize(width, height);
    const bounds = window.getBounds();
    const x = anchor.x + anchor.width / 2 - bounds.width / 2;
    const y =
      this._platform === 'darwin' ? anchor.y + anchor.height + 6 : anchor.y - bounds.height - 8;
    const fitted = this.fit({ ...bounds, x, y }, area, 8);
    if (bounds.x !== fitted.x || bounds.y !== fitted.y) window.setPosition(fitted.x, fitted.y);
  }

  private apply(window: Window, surface: Surface): void {
    const area = this._workArea(window.getBounds());
    const frame = this.frame(window);
    const saved = this._saved.get(surface);
    const target =
      surface === 'workspace'
        ? { width: 1440, height: 900 }
        : surface === 'onboarding'
          ? { width: 1000, height: 720 }
          : { width: 1000, height: 1180 };
    window.setMinimumSize(
      Math.max(1, Math.min(960 + frame.width, area.width - 32)),
      Math.max(1, Math.min(640 + frame.height, area.height - 32)),
    );
    window.setResizable(true);
    if (this._platform === 'darwin') window.setWindowButtonVisibility(true);
    if (saved) {
      window.setBounds(this.fit(saved.bounds, area, 16));
      if (saved.maximized) window.maximize();
    } else {
      const previous = window.getBounds();
      window.setContentSize(
        Math.max(1, Math.min(target.width, area.width - 32 - frame.width)),
        Math.max(1, Math.min(target.height, area.height - 32 - frame.height)),
      );
      const bounds = window.getBounds();
      const fitted = this.fit(
        {
          ...bounds,
          x: previous.x + (previous.width - bounds.width) / 2,
          y: previous.y + (previous.height - bounds.height) / 2,
        },
        area,
        16,
      );
      window.setPosition(fitted.x, fitted.y);
    }
  }

  private frame(window: Window): { width: number; height: number } {
    const outer = window.getBounds();
    const inner = window.getContentBounds();
    return {
      width: Math.max(0, outer.width - inner.width),
      height: Math.max(0, outer.height - inner.height),
    };
  }

  private fit(bounds: Rectangle, area: Rectangle, margin: number): Rectangle {
    const width = Math.max(1, Math.min(bounds.width, area.width - margin * 2));
    const height = Math.max(1, Math.min(bounds.height, area.height - margin * 2));
    return {
      width: Math.round(width),
      height: Math.round(height),
      x: Math.round(
        Math.max(area.x + margin, Math.min(bounds.x, area.x + area.width - width - margin)),
      ),
      y: Math.round(
        Math.max(area.y + margin, Math.min(bounds.y, area.y + area.height - height - margin)),
      ),
    };
  }
}
