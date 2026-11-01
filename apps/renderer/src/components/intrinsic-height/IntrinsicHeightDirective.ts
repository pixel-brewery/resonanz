import {
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  effect,
  inject,
  input,
  output,
} from '@angular/core';

/** Measures unconstrained content, independent of the viewport receiving its height. */
@Directive({ selector: '[resonanzIntrinsicHeight]' })
export class IntrinsicHeightDirective {
  private readonly _element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private _observer: ResizeObserver | null = null;
  private _timer: ReturnType<typeof setTimeout> | null = null;
  private _lastHeight: number | null = null;
  private _ready = false;
  private _disposed = false;
  public readonly enabled = input(true, { alias: 'intrinsicHeightEnabled' });
  public readonly heightChanged = output<number>({ alias: 'intrinsicHeightChanged' });

  public constructor() {
    // A hidden native tray can reopen without remounting this content.
    const focused = (): void => {
      this._lastHeight = null;
      this.schedule();
    };
    afterNextRender(() => {
      if (this._disposed) return;
      this._ready = true;
      this._observer = new ResizeObserver(() => this.schedule());
      this._observer.observe(this._element);
      window.addEventListener('focus', focused);
      this.schedule();
    });
    effect(() => {
      this._lastHeight = null;
      if (this.enabled()) this.schedule();
      else this.cancel();
    });
    inject(DestroyRef).onDestroy(() => {
      this._disposed = true;
      this.cancel();
      this._observer?.disconnect();
      window.removeEventListener('focus', focused);
    });
  }

  private schedule(): void {
    if (this._disposed || !this._ready || !this.enabled() || this._timer !== null) return;
    this._timer = setTimeout(() => {
      this._timer = null;
      if (this._disposed || !this.enabled() || !this._element.isConnected) return;
      const measured = this._element.getBoundingClientRect().height;
      if (!Number.isFinite(measured) || measured <= 0) return;
      const height = Math.min(4096, Math.max(1, Math.ceil(measured)));
      if (height === this._lastHeight) return;
      this._lastHeight = height;
      this.heightChanged.emit(height);
    }, 100);
  }

  private cancel(): void {
    if (this._timer !== null) clearTimeout(this._timer);
    this._timer = null;
  }
}
