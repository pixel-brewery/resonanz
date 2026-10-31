// #region Imports
import { Injectable, inject, signal } from '@angular/core';
import { form, maxLength, required } from '@angular/forms/signals';
import { Router } from '@angular/router';
import { LibraryStore } from '../services/LibraryStore';
import { CapturePresenter } from './CapturePresenter';
// #endregion

/** Owns shell commands while views remain declarative Mosaik composition. */
@Injectable({ providedIn: 'root' })
export class ShellPresenter {
  private readonly _router = inject(Router);
  private readonly _collectionModel = signal({ name: '' });
  public readonly library = inject(LibraryStore);
  public readonly capture = inject(CapturePresenter);
  public readonly creatingCollection = signal(false);
  public readonly savingCollection = signal(false);
  public readonly collectionForm = form(this._collectionModel, (schema) => {
    required(schema.name);
    maxLength(schema.name, 80);
  });

  /** Loads the desktop projection when the shell mounts. */
  public async initialize(): Promise<void> {
    await this.library.initialize();
  }

  /** Creates a named collection once, then opens it. */
  public async createCollection(): Promise<void> {
    if (this.collectionForm().invalid() || this.savingCollection()) return;
    this.savingCollection.set(true);
    try {
      await this.library.createCollection(this._collectionModel().name);
      this._collectionModel.set({ name: '' });
      this.creatingCollection.set(false);
    } catch (error) {
      this.library.report(error);
    } finally {
      this.savingCollection.set(false);
    }
  }

  /** Imports a selected recording/session through the native file picker. */
  public async importSession(): Promise<void> {
    try {
      const session = await this.library.importSession();
      if (session) await this._router.navigate(['/session', session.id]);
    } catch (error) {
      this.library.report(error);
    }
  }
}
