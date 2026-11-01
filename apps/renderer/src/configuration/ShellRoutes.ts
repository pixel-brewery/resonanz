// #region Imports
import type { Routes } from '@angular/router';
// #endregion

/** Bookmarkable desktop views keep feature composition lazy. */
export const shellRoutes: Routes = [
  {
    path: '',
    loadComponent: () => import('../views/LibraryView').then((module) => module.LibraryView),
  },
  {
    path: 'session/:id',
    loadComponent: () => import('../views/SessionView').then((module) => module.SessionView),
  },
  {
    path: 'settings',
    loadComponent: () => import('../views/SettingsView').then((module) => module.SettingsView),
  },
  {
    path: 'voice',
    loadComponent: () => import('../views/VoiceView').then((module) => module.VoiceView),
  },
  {
    path: 'voice/:id',
    loadComponent: () => import('../views/VoiceView').then((module) => module.VoiceView),
  },
  {
    path: 'onboarding',
    loadComponent: () => import('../views/OnboardingView').then((module) => module.OnboardingView),
  },
  { path: '**', redirectTo: '' },
];
