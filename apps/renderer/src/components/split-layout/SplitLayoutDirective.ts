// #region Imports
import { afterRenderEffect, Directive, ElementRef, inject, input } from '@angular/core';
import type { SplitElement } from '@pixel-brewery/mosaik-elements-foundation';
import { SplitLayoutMemory } from './SplitLayoutMemory';
// #endregion

/** Restores pane preferences while Mosaik owns constraints, pointer and keyboard interaction. */
@Directive({
  selector: 'mosaik-split[resonanzSplitLayout]',
  host: { '(splitReposition)': 'remember()' },
})
export class SplitLayoutDirective {
  private readonly _element = inject<ElementRef<SplitElement>>(ElementRef).nativeElement;
  private readonly _memory = new SplitLayoutMemory(this.storage());
  private _ready = false;
  private _revision = 0;
  private _preferred: SplitElement['position'] = '50%';
  private _identity = '';

  /** Stable pane identity, shared across sessions and route remounts. */
  public readonly resonanzSplitLayout = input.required<string>();

  /** Starting size until the user adjusts this pane. */
  public readonly splitInitialPosition = input.required<SplitElement['position']>();

  /** Temporarily hides the locked pane without overwriting its remembered size. */
  public readonly splitLayoutActive = input(true);

  public constructor() {
    afterRenderEffect((onCleanup) => {
      const active = this.splitLayoutActive();
      const unit = this._element.lock === 'none' ? '%' : 'px';
      const pane = this.resonanzSplitLayout();
      const initial = this.splitInitialPosition();
      const identity = `${pane}:${unit}:${initial}`;
      if (identity !== this._identity) {
        const saved = this._memory.read(pane, unit);
        this._preferred = saved === undefined ? initial : `${saved}${unit}`;
        this._identity = identity;
      }
      const resize = new ResizeObserver(() => void this.apply(active));
      resize.observe(this._element);
      void this.apply(active);
      onCleanup(() => {
        resize.disconnect();
        this._ready = false;
        this._revision++;
      });
    });
  }

  protected remember(): void {
    if (!this._ready) return;
    const unit = this._element.lock === 'none' ? '%' : 'px';
    const size = unit === '%' ? this._element.positionPercentage : this._element.positionInPixels;
    this._memory.remember(this.resonanzSplitLayout(), size, unit);
    this._preferred = `${size}${unit}`;
    // Locked panes keep pixels across resizes, including after Mosaik's percentage-based drag.
    if (unit === 'px') void this.apply(true);
  }

  private async apply(active: boolean): Promise<void> {
    const revision = ++this._revision;
    this._ready = false;
    await this._element.updateComplete;
    if (revision !== this._revision) return;
    const extent =
      this._element.orientation === 'vertical'
        ? this._element.clientHeight
        : this._element.clientWidth;
    if (extent <= 1) return;
    // Mosaik treats >=100% as collapsed before applying min/max. Bound restored pixel sizes
    // to the current frame so a preference from a larger window cannot collapse its peer.
    const position =
      typeof this._preferred === 'string' && this._preferred.endsWith('px')
        ? (`${Math.min(Number.parseFloat(this._preferred), extent - 1)}px` as const)
        : this._preferred;
    this._element.position = active ? position : '0%';
    await this._element.updateComplete;
    if (revision === this._revision) this._ready = active;
  }

  private storage(): Storage | undefined {
    try {
      return this._element.ownerDocument.defaultView?.localStorage;
    } catch {
      return undefined;
    }
  }
}
