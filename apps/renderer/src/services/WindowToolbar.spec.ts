// #region Imports
import '@angular/compiler';
import type { TemplateRef } from '@angular/core';
import { describe, expect, it } from 'vitest';
import { WindowToolbar } from './WindowToolbar';
// #endregion

describe('WindowToolbar', () => {
  it('shows the latest screen and keeps it when an earlier screen leaves late', () => {
    const toolbar = new WindowToolbar();
    const library = {};
    const session = {};
    const actions = {} as TemplateRef<unknown>;

    toolbar.register(library, 'Sessions', '7 sessions');
    toolbar.register(session, 'Release 2.0', 'Friday', actions, 'session-title');
    toolbar.unregister(library);

    expect(toolbar.title()).toBe('Release 2.0');
    expect(toolbar.subtitle()).toBe('Friday');
    expect(toolbar.actions()).toBe(actions);
    expect(toolbar.titleTestId()).toBe('session-title');

    toolbar.unregister(session);
    expect(toolbar.title()).toBe('');
    expect(toolbar.titleTestId()).toBe('window-title-text');
  });

  it('updates a registration in place', () => {
    const toolbar = new WindowToolbar();
    const owner = {};

    toolbar.register(owner, 'Sessions', '');
    toolbar.register(owner, 'Favorites', '2 sessions');

    expect(toolbar.title()).toBe('Favorites');
    expect(toolbar.subtitle()).toBe('2 sessions');
  });
});
