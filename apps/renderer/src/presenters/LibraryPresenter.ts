// #region Imports
import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { form, maxLength, required } from '@angular/forms/signals';
import { ActivatedRoute, Router } from '@angular/router';
import type { ISessionSummary } from '@resonanz/contracts';
import { DesktopApi } from '../services/DesktopApi';
import { LibraryStore } from '../services/LibraryStore';
import { CapturePresenter } from './CapturePresenter';
import { ShellPresenter } from './ShellPresenter';
// #endregion

/** Projects the real library into searchable, collection-aware recording views. */
@Injectable()
export class LibraryPresenter {
  private readonly _route = inject(ActivatedRoute);
  private readonly _router = inject(Router);
  private readonly _api = inject(DesktopApi);
  private readonly _parameters = toSignal(this._route.queryParamMap, {
    initialValue: this._route.snapshot.queryParamMap,
  });
  private readonly _filterModel = signal({ query: '' });
  private readonly _collectionModel = signal({ name: '' });
  public readonly library = inject(LibraryStore);
  public readonly capture = inject(CapturePresenter);
  public readonly shell = inject(ShellPresenter);
  public readonly filterForm = form(this._filterModel);
  public readonly collectionForm = form(this._collectionModel, (schema) => {
    required(schema.name);
    maxLength(schema.name, 80);
  });
  public readonly editingCollection = signal(false);
  public readonly confirmCollectionDeletion = signal(false);
  public readonly mutating = signal(false);
  public readonly scope = computed(() => this._parameters().get('scope'));
  public readonly collection = computed(
    () =>
      this.library.collections().find((item) => item.id === this._parameters().get('collection')) ??
      null,
  );
  public readonly sessions = computed(() => {
    const query = this._filterModel().query.trim().toLocaleLowerCase('de-DE');
    const collectionId = this._parameters().get('collection');
    return this.library
      .sessions()
      .filter(
        (session) =>
          (this.scope() !== 'favorites' || session.starred) &&
          (this.scope() !== 'conversations' || session.kind === 'conversation') &&
          (!collectionId || session.collectionId === collectionId) &&
          (!query ||
            `${session.title} ${session.tags.join(' ')}`
              .toLocaleLowerCase('de-DE')
              .includes(query)),
      );
  });

  public constructor() {
    effect(() => {
      this._parameters();
      untracked(() => {
        this.editingCollection.set(false);
        this.confirmCollectionDeletion.set(false);
        this._collectionModel.set({ name: '' });
      });
    });
  }

  /** Toggles a favourite through the durable session owner. */
  public async toggleStar(session: ISessionSummary): Promise<void> {
    await this.perform(async () => {
      await this._api.request('sessions.update', {
        sessionId: session.id,
        starred: !session.starred,
      });
      await this.library.refresh();
    });
  }
  /** Opens the existing collection in a validated name editor. */
  public beginRename(): void {
    const collection = this.collection();
    if (collection) {
      this._collectionModel.set({ name: collection.name });
      this.editingCollection.set(true);
    }
  }
  /** Saves the collection name without moving its sessions. */
  public async renameCollection(): Promise<void> {
    const collection = this.collection();
    if (!collection || this.collectionForm().invalid()) return;
    await this.perform(async () => {
      await this._api.request('collections.update', {
        collectionId: collection.id,
        name: this._collectionModel().name,
      });
      await this.library.refresh();
      this.editingCollection.set(false);
    });
  }
  /** Removes a confirmed collection; its recordings remain in the library. */
  public async deleteCollection(): Promise<void> {
    const collection = this.collection();
    if (!collection || !this.confirmCollectionDeletion()) return;
    await this.perform(async () => {
      await this._api.request('collections.delete', { collectionId: collection.id });
      await this.library.refresh();
      await this._router.navigate(['/']);
    });
  }
  private async perform(action: () => Promise<void>): Promise<void> {
    if (this.mutating()) return;
    this.mutating.set(true);
    try {
      await action();
    } catch (error) {
      this.library.report(error);
    } finally {
      this.mutating.set(false);
    }
  }
}
