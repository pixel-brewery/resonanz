// #region Imports
import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { NavigationEnd, NavigationStart, Router } from '@angular/router';
import { filter } from 'rxjs';
// #endregion

interface IHistoryState {
  readonly ids: readonly number[];
  readonly index: number;
}

/**
 * Tracks the window's in-app navigation entries so the toolbar can offer back and forward like
 * Symphony's window chrome. Angular's navigation ids identify entries; a popstate restores the
 * index of the entry it returns to.
 *
 * @public
 */
@Injectable({ providedIn: 'root' })
export class NavigationHistory {
  private readonly _router = inject(Router);
  private readonly _location = inject(Location);
  private readonly _history = signal<IHistoryState>({ ids: [], index: -1 });
  private _pendingTrigger: NavigationStart['navigationTrigger'];
  private _pendingRestoredId: number | undefined;
  private _pendingReplacesUrl = false;

  /** Whether toolbar back navigation is available. */
  public readonly canGoBack = computed(() => this._history().index > 0);

  /** Whether toolbar forward navigation is available. */
  public readonly canGoForward = computed(() => {
    const history = this._history();
    return history.index >= 0 && history.index < history.ids.length - 1;
  });

  public constructor() {
    const shown = this._router.navigated ? this._router.lastSuccessfulNavigation()?.id : undefined;
    if (shown !== undefined) this._history.set({ ids: [shown], index: 0 });
    const destroyRef = inject(DestroyRef);
    const starts = this._router.events
      .pipe(filter((event): event is NavigationStart => event instanceof NavigationStart))
      .subscribe((event) => {
        this._pendingTrigger = event.navigationTrigger;
        this._pendingRestoredId = event.restoredState?.navigationId;
        this._pendingReplacesUrl = this._router.currentNavigation()?.extras.replaceUrl === true;
      });
    const ends = this._router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => this.record(event.id));
    destroyRef.onDestroy(() => {
      starts.unsubscribe();
      ends.unsubscribe();
    });
  }

  /** Returns to the previous in-app entry. */
  public back(): void {
    if (this.canGoBack()) this._location.back();
  }

  /** Moves to the next in-app entry after going back. */
  public forward(): void {
    if (this.canGoForward()) this._location.forward();
  }

  private record(navigationId: number): void {
    const trigger = this._pendingTrigger;
    const restoredId = this._pendingRestoredId;
    const replaces = this._pendingReplacesUrl;
    this._pendingTrigger = undefined;
    this._pendingRestoredId = undefined;
    this._pendingReplacesUrl = false;
    this._history.update((history) => {
      if (trigger === 'popstate' && restoredId !== undefined) {
        const index = history.ids.indexOf(restoredId);
        // Angular reuses the restored id for the entry it navigates back to.
        if (index >= 0) return { ids: history.ids, index };
      }
      if (replaces && history.index >= 0) {
        const ids = history.ids.map((id, position) =>
          position === history.index ? navigationId : id,
        );
        return { ids, index: history.index };
      }
      const ids = [...history.ids.slice(0, history.index + 1), navigationId];
      return { ids, index: ids.length - 1 };
    });
  }
}
