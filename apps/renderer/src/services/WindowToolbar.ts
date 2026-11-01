// #region Imports
import { Injectable, computed, signal, type Signal, type TemplateRef } from '@angular/core';
// #endregion

interface IWindowToolbarRegistration {
  readonly owner: object;
  readonly title: string;
  readonly subtitle: string;
  readonly titleTestId?: string;
  readonly actions?: TemplateRef<unknown>;
}

/**
 * Holds what the routed screen shows in the window's unified toolbar: its title, its one-line
 * subtitle and its contextual actions (Symphony's window-toolbar pattern).
 *
 * The toolbar belongs to the window chrome and is the window's drag region; the title and the
 * actions belong to the screen. A screen registers them through `WindowToolbarDirective`.
 * Registrations are owned, so a screen that is destroyed after its successor registered cannot
 * clear the successor's toolbar.
 *
 * @public
 */
@Injectable({ providedIn: 'root' })
export class WindowToolbar {
  private readonly _registrations = signal<readonly IWindowToolbarRegistration[]>([]);
  private readonly _current = computed(() => this._registrations().at(-1));

  /** Title of the current screen, empty while no screen registered one. */
  public readonly title: Signal<string> = computed(() => this._current()?.title ?? '');

  /** One-line subtitle of the current screen. */
  public readonly subtitle: Signal<string> = computed(() => this._current()?.subtitle ?? '');

  /** Test id of the title element, so acceptance checks can wait for one specific screen. */
  public readonly titleTestId: Signal<string> = computed(
    () => this._current()?.titleTestId ?? 'window-title-text',
  );

  /** Contextual actions of the current screen, rendered at the trailing end of the toolbar. */
  public readonly actions: Signal<TemplateRef<unknown> | undefined> = computed(
    () => this._current()?.actions,
  );

  /**
   * Registers or replaces the toolbar content of one screen.
   *
   * @param owner - Identity of the registering screen.
   * @param title - Screen title.
   * @param subtitle - One-line subtitle.
   * @param actions - Optional contextual actions.
   * @param titleTestId - Optional test id of the rendered title.
   */
  public register(
    owner: object,
    title: string,
    subtitle: string,
    actions?: TemplateRef<unknown>,
    titleTestId?: string,
  ): void {
    const registration: IWindowToolbarRegistration = {
      owner,
      title,
      subtitle,
      ...(actions ? { actions } : {}),
      ...(titleTestId ? { titleTestId } : {}),
    };
    this._registrations.update((current) => {
      const index = current.findIndex((entry) => entry.owner === owner);
      if (index < 0) return [...current, registration];
      return current.map((entry, position) => (position === index ? registration : entry));
    });
  }

  /**
   * Removes the toolbar content of one screen.
   *
   * @param owner - Identity of the screen that registered it.
   */
  public unregister(owner: object): void {
    this._registrations.update((current) => current.filter((entry) => entry.owner !== owner));
  }
}
