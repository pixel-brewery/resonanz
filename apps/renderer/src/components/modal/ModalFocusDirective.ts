import { DestroyRef, Directive, ElementRef, afterNextRender, inject, output } from '@angular/core';

function activeElement(): Element | null {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element;
}

/** Modal keyboard ownership includes the public Mosaik controls' open shadow roots. */
@Directive({
  selector: '[resonanzModal]',
  host: { tabindex: '-1', '(document:keydown)': 'key($event)' },
})
export class ModalFocusDirective {
  private readonly _element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly _previous = activeElement();
  public readonly modalDismiss = output<void>();
  public constructor() {
    afterNextRender(() => (this.targets()[0] ?? this._element).focus({ preventScroll: true }));
    inject(DestroyRef).onDestroy(() => {
      if (this._previous instanceof HTMLElement && this._previous.isConnected)
        this._previous.focus({ preventScroll: true });
    });
  }
  protected key(event: KeyboardEvent): void {
    if (event.defaultPrevented) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      this.modalDismiss.emit();
      return;
    }
    if (event.key !== 'Tab') return;
    const targets = this.targets();
    if (!targets.length) {
      event.preventDefault();
      this._element.focus();
      return;
    }
    const current = targets.indexOf(activeElement() as HTMLElement);
    const next =
      current < 0
        ? event.shiftKey
          ? targets.length - 1
          : 0
        : (current + (event.shiftKey ? -1 : 1) + targets.length) % targets.length;
    event.preventDefault();
    targets[next]!.focus();
  }
  private targets(): HTMLElement[] {
    const result = new Set<HTMLElement>();
    const walk = (parent: ParentNode) => {
      for (const child of parent.children) {
        if (!(child instanceof HTMLElement)) continue;
        if (child.shadowRoot) walk(child.shadowRoot);
        else if (
          child.matches('button, input, textarea, select, a[href], [tabindex]') &&
          child.tabIndex >= 0 &&
          !child.matches(':disabled, [aria-disabled="true"]') &&
          child.getClientRects().length
        )
          result.add(child);
        walk(child);
      }
    };
    walk(this._element);
    return [...result];
  }
}
