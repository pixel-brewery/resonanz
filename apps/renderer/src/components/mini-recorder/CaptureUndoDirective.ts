import { Directive, inject } from '@angular/core';
import { CapturePresenter } from '../../presenters/CapturePresenter';

/** Preserves text editing's undo while an acknowledged capture marker is visible. */
@Directive({ selector: '[resonanzCaptureUndo]', host: { '(window:keydown)': 'keydown($event)' } })
export class CaptureUndoDirective {
  private readonly _capture = inject(CapturePresenter);
  protected keydown(event: KeyboardEvent): void {
    if (
      event.defaultPrevented ||
      !(event.metaKey || event.ctrlKey) ||
      event.shiftKey ||
      event.key.toLowerCase() !== 'z' ||
      !this._capture.markerFeedback()
    )
      return;
    if (
      event
        .composedPath()
        .some(
          (target) =>
            target instanceof Element &&
            target.matches(
              'input,textarea,[contenteditable="true"],mosaik-textbox,mosaik-searchbox',
            ),
        )
    )
      return;
    event.preventDefault();
    void this._capture.undoLastMoment();
  }
}
