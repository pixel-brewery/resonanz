// #region Imports
import { bootstrapApplication } from '@angular/platform-browser';
// #endregion

async function bootstrap(): Promise<void> {
  if (window.location.hash === '#/mini-recorder') {
    const [{ MiniRecorderView }, { miniRecorderConfig }] = await Promise.all([
      import('./views/MiniRecorderView'),
      import('./configuration/MiniRecorderConfig'),
    ]);
    document
      .querySelector('resonanz-shell')
      ?.replaceWith(document.createElement('resonanz-mini-surface'));
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    await bootstrapApplication(MiniRecorderView, miniRecorderConfig);
  } else {
    const [{ ShellView }, { shellConfig }] = await Promise.all([
      import('./views/ShellView'),
      import('./configuration/ShellConfig'),
    ]);
    await bootstrapApplication(ShellView, shellConfig);
  }
}

void bootstrap().catch((error: unknown) => {
  const message = document.createElement('p');
  message.textContent = `Resonanz could not start: ${error instanceof Error ? error.message : 'Unknown error'}`;
  document.body.replaceChildren(message);
});
