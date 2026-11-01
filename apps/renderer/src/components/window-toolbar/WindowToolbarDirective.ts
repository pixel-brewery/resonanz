// #region Imports
import { DestroyRef, Directive, TemplateRef, effect, inject, input } from '@angular/core';
import { WindowToolbar } from '../../services/WindowToolbar';
// #endregion

/**
 * Hands a screen's title, subtitle and contextual actions to the window's unified toolbar.
 *
 * Place it on an `ng-template` in the screen's own template; the template content becomes the
 * toolbar actions and keeps the screen's bindings, because it is declared there:
 *
 * ```html
 * <ng-template resonanzWindowToolbar [toolbarTitle]="title" [toolbarSubtitle]="subtitle">
 *   <mosaik-button … />
 * </ng-template>
 * ```
 *
 * @public
 */
@Directive({ selector: 'ng-template[resonanzWindowToolbar]' })
export class WindowToolbarDirective {
  private readonly _toolbar = inject(WindowToolbar);
  private readonly _template = inject<TemplateRef<unknown>>(TemplateRef);

  /** Screen title shown in the toolbar. */
  public readonly toolbarTitle = input.required<string>();

  /** One-line subtitle shown below the title. */
  public readonly toolbarSubtitle = input<string>('');

  /** Whether the template content is rendered as toolbar actions. */
  public readonly toolbarActions = input<boolean>(true);

  /** Test id of the rendered title, for acceptance checks that wait for this screen. */
  public readonly toolbarTitleTestId = input<string>('');

  public constructor() {
    effect(() => {
      this._toolbar.register(
        this,
        this.toolbarTitle(),
        this.toolbarSubtitle(),
        this.toolbarActions() ? this._template : undefined,
        this.toolbarTitleTestId() || undefined,
      );
    });
    inject(DestroyRef).onDestroy(() => this._toolbar.unregister(this));
  }
}
