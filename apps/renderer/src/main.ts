// #region Imports
import { bootstrapApplication } from '@angular/platform-browser';
import { shellConfig } from './configuration/ShellConfig';
import { ShellView } from './views/ShellView';
// #endregion

void bootstrapApplication(ShellView, shellConfig).catch((error: unknown) => {
  const message = document.createElement('p');
  message.textContent = `Resonanz konnte nicht gestartet werden: ${error instanceof Error ? error.message : 'Unbekannter Fehler'}`;
  document.body.replaceChildren(message);
});
