import { translate, uiLanguage, type UiLanguage, type TranslationKey } from '@resonanz/intl';
// #region Imports
import {
  app,
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  nativeImage,
  nativeTheme,
  ipcMain,
  session,
  protocol,
  shell,
  systemPreferences,
  globalShortcut,
  screen,
  type NativeImage,
} from 'electron';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { mkdir, stat, copyFile, writeFile, rm } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { randomUUID } from 'node:crypto';
import {
  channels,
  requestEnvelopeSchema,
  responseEnvelopeSchema,
  requestSchemas,
  responseSchemas,
  appEventSchema,
  dataSchemas,
  type AppEvent,
  type ICapabilities,
  type ISession,
  type IAppSnapshot,
  type ISettings,
  type IMiniRecorderSnapshot,
  type RequestMethod,
} from '@resonanz/contracts';
import { recordingFileName } from '@resonanz/sessions';
import { BackgroundService } from './BackgroundService.js';
import { NativeSpeechService } from './NativeSpeechService.js';
import { parseAudioRange } from './parseAudioRange.js';
import { MiniRecorderWindow } from './MiniRecorderWindow.js';
import { WindowPresentation } from './WindowPresentation.js';
import { CaptureReminderNotification } from './CaptureReminderNotification.js';
import { resonanzTheme as theme } from '../../../resources/themes/resonanz-soho.js';
// #endregion

const currentDirectory = dirname(fileURLToPath(import.meta.url));
app.setName('Resonanz');
const dataRoot = process.env['RESONANZ_DATA_ROOT'] ?? app.getPath('userData');
await mkdir(join(dataRoot, 'chromium'), { recursive: true, mode: 0o700 });
app.setPath('userData', join(dataRoot, 'chromium'));
const hidden = process.env['RESONANZ_E2E'] === '1';
const miniRecorder = new MiniRecorderWindow({
  preload: join(currentDirectory, 'preload.cjs'),
  index: join(currentDirectory, '../renderer/browser/index.html'),
  developmentUrl: rendererDevelopmentUrl(),
  hidden,
});
let language: UiLanguage = 'en';
function t(key: TranslationKey, ...parameters: readonly (string | number)[]): string {
  return translate(language, key, ...parameters);
}
let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
const presentation = new WindowPresentation(
  (bounds) => screen.getDisplayMatching(bounds).workArea,
  process.platform,
);
let trayRefresh: NodeJS.Timeout | undefined;
let trayPulse: NodeJS.Timeout | undefined;
let trayPulseSessionId: string | null = null;
let trayPulseFrame = 0;
let trayUpdating = false;
let trayStopped = true;
let trayImageSuffix: string | null = null;
const trayImages = new Map<string, NativeImage>();
let quitting = false;
let quitPending = false;
let startupPhase: 'configuration' | 'background' | 'window' | 'tray' | 'ready' = 'configuration';
const finishWaiters = new Map<string, () => void>();

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'resonanz-audio',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
  {
    scheme: 'resonanz-voice',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);

function publish(event: AppEvent): void {
  const parsed = appEventSchema.parse(event);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channels.event, parsed);
}
const background = new BackgroundService(
  join(currentDirectory, '../orchestrator/main.mjs'),
  dataRoot,
  publish,
);
const speech = new NativeSpeechService({
  dataDirectory: dataRoot,
  windowsScript: app.isPackaged
    ? join(process.resourcesPath, 'speech/windows-speech.ps1')
    : join(app.getAppPath(), 'resources/speech/windows-speech.ps1'),
  session: async (sessionId) =>
    (await background.request('sessions.get', { sessionId })) as ISession,
  settings: async () => ((await background.request('bootstrap.get', {})) as IAppSnapshot).settings,
  persist: async (sessionId, segment) => {
    await background.request('transcript.append', { sessionId, ...segment });
  },
  publish,
});
const captureReminder = new CaptureReminderNotification({
  current: () => miniRecorder.snapshot,
  create: (options) =>
    hidden || !Notification.isSupported()
      ? null
      : new Notification({
          title: options.title,
          body: options.body,
          actions: options.actions.map((text) => ({ type: 'button', text })),
          silent: true,
        }),
  open: () => showTray(),
  command: (sessionId, action) => {
    if (!quitting && !quitPending) publish({ type: 'capture.command', sessionId, action });
  },
  text: t,
  failed: (sessionId) =>
    publish({
      type: 'capture.reminder.failed',
      sessionId,
      message: 'loc.resonanz.error.silenceReminder',
    }),
});

function iconPath(relative: string): string {
  return app.isPackaged
    ? join(process.resourcesPath, 'icons', relative)
    : join(app.getAppPath(), 'resources/icons', relative);
}
function privateAudioPath(session: ISession): string {
  return join(
    dataRoot,
    'library',
    'audio',
    dataSchemas.identifier.parse(session.id),
    recordingFileName(session.mimeType),
  );
}
function trusted(sender: Electron.WebContents, frame: Electron.WebFrameMain | null): boolean {
  return Boolean(
    mainWindow &&
    !mainWindow.isDestroyed() &&
    sender === mainWindow.webContents &&
    frame === mainWindow.webContents.mainFrame,
  );
}

async function capabilities(): Promise<ICapabilities> {
  return speech.capabilities();
}

function rendererDevelopmentUrl(): string | undefined {
  const raw = process.env['RESONANZ_RENDERER_URL'];
  if (!raw) return undefined;
  const url = new URL(raw);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))
    throw new Error('loc.resonanz.error.rendererDev');
  return url.toString();
}

async function createWindow(): Promise<void> {
  const area = screen.getPrimaryDisplay().workArea;
  mainWindow = new BrowserWindow({
    width: Math.max(1, Math.min(1440, area.width - 32)),
    height: Math.max(1, Math.min(900, area.height - 32)),
    useContentSize: true,
    minWidth: Math.max(1, Math.min(960, area.width - 32)),
    minHeight: Math.max(1, Math.min(640, area.height - 32)),
    show: false,
    title: 'Resonanz',
    ...(process.platform === 'darwin'
      ? { titleBarStyle: 'hidden' as const, trafficLightPosition: { x: 20, y: 20 } }
      : {}),
    icon: iconPath('png/app/resonanz-512.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors
      ? theme.scheme.dark.background
      : theme.scheme.light.background,
    webPreferences: {
      preload: join(currentDirectory, 'preload.cjs'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) event.preventDefault();
  });
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      presentation.hideTray();
      mainWindow?.hide();
    }
  });
  mainWindow.webContents.on('render-process-gone', () => {
    stopTrayPulse();
    captureReminder.reset();
    miniRecorder.reset();
    void activeRecordings().then(async (sessions) => {
      for (const session of sessions) await speech.closeSession(session.id);
      await interruptRecordings();
    });
  });
  mainWindow.on('closed', () => {
    stopTrayPulse();
    captureReminder.reset();
    miniRecorder.reset();
    presentation.reset();
    mainWindow = undefined;
  });
  mainWindow.on('leave-full-screen', () => {
    if (mainWindow) {
      presentation.restore(mainWindow);
      presentation.present(mainWindow, presentation.requested);
    }
  });
  const development = rendererDevelopmentUrl();
  if (development) await mainWindow.loadURL(development);
  else await mainWindow.loadFile(join(currentDirectory, '../renderer/browser/index.html'));
  if (!hidden) {
    mainWindow.show();
    mainWindow.focus();
  }
}

async function showWindow(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) await createWindow();
  if (mainWindow) presentation.restore(mainWindow);
  publish({ type: 'ui.command', command: 'window.open' });
  if (hidden) return;
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.show();
  mainWindow?.focus();
  app.focus({ steal: true });
}

async function showTray(): Promise<void> {
  if (!mainWindow || mainWindow.isDestroyed()) await createWindow();
  if (!mainWindow) return;
  if (mainWindow.isFullScreen()) {
    mainWindow.once('leave-full-screen', () => void showTray());
    mainWindow.setFullScreen(false);
    return;
  }
  const cursor = screen.getCursorScreenPoint();
  const anchor = tray?.getBounds() ?? { x: cursor.x, y: cursor.y, width: 0, height: 0 };
  const area = screen.getDisplayNearestPoint({ x: anchor.x, y: anchor.y }).workArea;
  presentation.tray(mainWindow, anchor, area);
  publish({ type: 'ui.command', command: 'tray.open' });
  if (!hidden) {
    mainWindow.show();
    mainWindow.focus();
  }
}

function configureApplicationMenu(): void {
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: 'Resonanz',
        submenu: [
          { label: t('loc.resonanz.tray.open'), click: () => void showWindow() },
          { type: 'separator' },
          {
            label: t('loc.resonanz.tray.quit'),
            accelerator: 'CmdOrCtrl+Q',
            click: () => app.quit(),
          },
        ],
      },
      {
        label: t('loc.resonanz.menu.edit'),
        submenu: [
          { role: 'undo', label: t('loc.resonanz.menu.undo') },
          { role: 'redo', label: t('loc.resonanz.menu.redo') },
          { type: 'separator' },
          { role: 'cut', label: t('loc.resonanz.menu.cut') },
          { role: 'copy', label: t('loc.resonanz.menu.copy') },
          { role: 'paste', label: t('loc.resonanz.menu.paste') },
          { role: 'selectAll', label: t('loc.resonanz.menu.selectAll') },
        ],
      },
      {
        label: t('loc.resonanz.menu.view'),
        submenu: [
          { role: 'reload', label: t('loc.resonanz.menu.reload') },
          { role: 'forceReload', label: t('loc.resonanz.menu.forceReload') },
          { role: 'toggleDevTools', label: t('loc.resonanz.menu.devtools') },
          { type: 'separator' },
          { role: 'resetZoom', label: t('loc.resonanz.menu.resetZoom') },
          { role: 'zoomIn', label: t('loc.resonanz.menu.zoomIn') },
          { role: 'zoomOut', label: t('loc.resonanz.menu.zoomOut') },
          { type: 'separator' },
          { role: 'togglefullscreen', label: t('loc.resonanz.menu.fullScreen') },
        ],
      },
    ]),
  );
}
function syncLanguage(settings: ISettings): void {
  const next = uiLanguage(settings.uiLanguage);
  if (next === language) return;
  language = next;
  configureApplicationMenu();
}

function createTray(): void {
  if (hidden) return;
  trayStopped = false;
  const suffix = process.platform === 'win32' ? windowsTraySuffix('') : '';
  const image = trayImage(suffix);
  tray = new Tray(image);
  trayImageSuffix = suffix;
  tray.setToolTip('Resonanz');
  if (process.platform === 'darwin')
    for (let frame = 1; frame < 8; frame++) trayImage(`-recording-pulse-${frame}`);
  const menu = () =>
    Menu.buildFromTemplate([
      { label: t('loc.resonanz.tray.open'), click: () => void showWindow() },
      {
        label: t('loc.resonanz.capture.newRecording'),
        click: () =>
          void showTray().then(() => publish({ type: 'ui.command', command: 'recording.start' })),
      },
      {
        label: t('loc.resonanz.capture.liveConversation'),
        click: () =>
          void showWindow().then(() =>
            publish({ type: 'ui.command', command: 'conversation.start' }),
          ),
      },
      { type: 'separator' },
      { label: t('loc.resonanz.tray.quit'), click: () => app.quit() },
    ]);
  tray.on('right-click', () => tray?.popUpContextMenu(menu()));
  tray.on('click', () => void showTray());
  trayRefresh = setInterval(() => {
    void updateTray();
  }, 1000);
  trayRefresh.unref();
  void updateTray();
  const commands = {
    'CommandOrControl+Alt+R': 'capture.toggle',
    'CommandOrControl+Alt+M': 'capture.mark',
    'CommandOrControl+Alt+P': 'capture.pause',
    'CommandOrControl+Alt+Space': 'voice.open',
  } as const;
  for (const [accelerator, command] of Object.entries(commands))
    globalShortcut.register(accelerator, () => publish({ type: 'ui.command', command }));
}

function windowsTraySuffix(state: '' | '-recording' | '-paused'): string {
  return `-windows${state}${nativeTheme.shouldUseDarkColors ? '-dark' : ''}`;
}

/** Only a finite set of product-owned state assets reaches this cache. */
function trayImage(suffix: string): NativeImage {
  const cached = trayImages.get(suffix);
  if (cached) return cached;
  const image = nativeImage.createFromPath(iconPath(`png/tray/resonanz-tray${suffix}.png`));
  if (process.platform === 'darwin') image.setTemplateImage(suffix === '');
  trayImages.set(suffix, image);
  return image;
}

function setTrayImage(suffix: string): void {
  if (!tray || tray.isDestroyed() || trayStopped || suffix === trayImageSuffix) return;
  tray.setImage(trayImage(suffix));
  trayImageSuffix = suffix;
}

function trayClock(durationMs: number): string {
  const seconds = Math.floor(Math.max(0, durationMs) / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function trayMotionAllowed(): boolean {
  try {
    const settings = systemPreferences.getAnimationSettings();
    return settings.shouldRenderRichAnimation && !settings.prefersReducedMotion;
  } catch {
    return false;
  }
}

function stopTrayPulse(): void {
  if (trayPulse) clearInterval(trayPulse);
  trayPulse = undefined;
  trayPulseSessionId = null;
  trayPulseFrame = 0;
}

/** One 5Hz timer animates only the current capture; every tick respects native reduced motion. */
function startTrayPulse(sessionId: string): boolean {
  const current = miniRecorder.snapshot;
  if (
    process.platform !== 'darwin' ||
    trayStopped ||
    !current.active ||
    current.paused ||
    current.sessionId !== sessionId ||
    !trayMotionAllowed()
  ) {
    stopTrayPulse();
    return false;
  }
  if (trayPulse && trayPulseSessionId === sessionId) return true;
  stopTrayPulse();
  trayPulseSessionId = sessionId;
  setTrayImage('-recording');
  trayPulse = setInterval(() => {
    const snapshot = miniRecorder.snapshot;
    if (
      !tray ||
      tray.isDestroyed() ||
      trayStopped ||
      quitting ||
      !snapshot.active ||
      snapshot.paused ||
      snapshot.sessionId !== trayPulseSessionId
    ) {
      stopTrayPulse();
      return;
    }
    if (!trayMotionAllowed()) {
      stopTrayPulse();
      setTrayImage('-recording');
      return;
    }
    trayPulseFrame = (trayPulseFrame + 1) % 8;
    setTrayImage(trayPulseFrame === 0 ? '-recording' : `-recording-pulse-${trayPulseFrame}`);
  }, 200);
  trayPulse.unref();
  return true;
}

function renderTrayCapture(sessionId: string, durationMs: number, paused: boolean): void {
  if (!tray || tray.isDestroyed() || trayStopped) return;
  const elapsed = trayClock(durationMs);
  if (process.platform === 'darwin') tray.setTitle(elapsed, { fontType: 'monospacedDigit' });
  tray.setToolTip(
    `Resonanz · ${t(paused ? 'loc.resonanz.capture.paused' : 'loc.resonanz.capture.running')} · ${elapsed}`,
  );
  if (!paused && startTrayPulse(sessionId)) return;
  stopTrayPulse();
  setTrayImage(
    process.platform === 'win32'
      ? windowsTraySuffix(paused ? '-paused' : '-recording')
      : paused
        ? '-paused'
        : '-recording',
  );
}

/** Capture transitions use the existing projection; the catalog refresh owns processing state. */
function syncTrayCapture(snapshot: IMiniRecorderSnapshot): void {
  if (snapshot.active && snapshot.sessionId)
    renderTrayCapture(snapshot.sessionId, snapshot.durationMs, snapshot.paused);
  else stopTrayPulse();
}

function stopTrayUpdates(): void {
  trayStopped = true;
  if (trayRefresh) clearInterval(trayRefresh);
  trayRefresh = undefined;
  stopTrayPulse();
  trayImages.clear();
  trayImageSuffix = null;
}

async function updateTray(): Promise<void> {
  if (!tray || tray.isDestroyed() || quitting || trayStopped || trayUpdating) return;
  trayUpdating = true;
  const currentTray = tray;
  try {
    const snapshot = (await background.request('bootstrap.get', {})) as IAppSnapshot;
    if (tray !== currentTray || currentTray.isDestroyed() || quitting || trayStopped) return;
    const capture = miniRecorder.snapshot;
    const active =
      capture.active && capture.sessionId
        ? {
            id: capture.sessionId,
            status: capture.paused ? 'paused' : 'recording',
            durationMs: capture.durationMs,
          }
        : snapshot.sessions.find((s) => s.status === 'recording' || s.status === 'paused');
    const processing = snapshot.sessions.find(
      (s) =>
        s.pipeline?.transcription?.state === 'running' ||
        s.pipeline?.analysis?.state === 'running' ||
        s.status === 'processing',
    );
    const stage =
      processing?.pipeline?.transcription?.state === 'running'
        ? processing.pipeline.transcription
        : processing?.pipeline?.analysis?.state === 'running'
          ? processing.pipeline.analysis
          : undefined;
    const attention =
      !processing &&
      snapshot.sessions.some(
        (s) =>
          s.pipeline?.transcription?.state === 'failed' ||
          s.pipeline?.analysis?.state === 'failed' ||
          s.status === 'error' ||
          s.status === 'interrupted',
      );
    if (active) {
      renderTrayCapture(active.id, active.durationMs, active.status === 'paused');
      return;
    }
    stopTrayPulse();
    const progress =
      stage?.progress === undefined
        ? undefined
        : `${new Intl.NumberFormat(language).format(Math.round(stage.progress))} %`;
    if (process.platform === 'darwin') tray.setTitle(processing ? (progress ?? '···') : '');
    setTrayImage(
      attention
        ? nativeTheme.shouldUseDarkColors
          ? '-attention-dark'
          : '-attention'
        : process.platform === 'win32'
          ? windowsTraySuffix('')
          : '',
    );
    tray.setToolTip(
      processing
        ? `Resonanz · ${t('loc.resonanz.common.processing')}${progress === undefined ? '' : ` · ${progress}`}`
        : attention
          ? `Resonanz · ${t('loc.resonanz.library.attention')}`
          : 'Resonanz',
    );
  } catch {
    /* A supervised restart keeps the last known status until the next tick. */
  } finally {
    trayUpdating = false;
  }
}

async function activeRecordings(): Promise<readonly ISession[]> {
  const snapshot = (await background.request('bootstrap.get', {})) as IAppSnapshot;
  const active = snapshot.sessions.filter(
    (item) => item.status === 'recording' || item.status === 'paused',
  );
  return Promise.all(
    active.map(
      (item) => background.request('sessions.get', { sessionId: item.id }) as Promise<ISession>,
    ),
  );
}
async function interruptRecordings(): Promise<void> {
  for (const item of await activeRecordings()) {
    await background.request('sessions.finish', {
      sessionId: item.id,
      durationMs: item.durationMs,
      error: 'loc.resonanz.error.rendererInterrupted',
    });
  }
}

async function quitApplication(): Promise<void> {
  if (quitPending || quitting) return;
  quitPending = true;
  try {
    const active = await activeRecordings().catch(() => []);
    if (active.length > 0 && !hidden) {
      const { dialog } = await import('electron');
      const result = await dialog.showMessageBox({
        type: 'question',
        title: t('loc.resonanz.capture.stopConfirm'),
        message: t('loc.resonanz.error.captureRunning'),
        detail: t('loc.resonanz.capture.stopExplain'),
        buttons: [t('loc.resonanz.capture.keepRecording'), t('loc.resonanz.capture.saveStop')],
        defaultId: 0,
        cancelId: 0,
      });
      if (result.response !== 1) return;
    }
    stopTrayUpdates();
    if (active.length > 0) {
      const finished = Promise.all(
        active.map((item) => new Promise<void>((resolve) => finishWaiters.set(item.id, resolve))),
      );
      publish({ type: 'ui.command', command: 'recording.stop' });
      let timeout: NodeJS.Timeout | undefined;
      await Promise.race([
        finished,
        new Promise<void>((resolve) => {
          timeout = setTimeout(resolve, 3500);
        }),
      ]);
      if (timeout) clearTimeout(timeout);
      finishWaiters.clear();
      for (const item of await activeRecordings().catch(() => []))
        await background.request('sessions.finish', {
          sessionId: item.id,
          durationMs: item.durationMs,
          error: 'loc.resonanz.error.quitSaved',
        });
    }
    await speech.dispose();
    captureReminder.reset();
    miniRecorder.dispose();
    globalShortcut.unregisterAll();
    await background.dispose();
    quitting = true;
    tray?.destroy();
    app.quit();
  } finally {
    quitPending = false;
  }
}

function markdown(session: ISession): string {
  const transcript = session.transcript
    .map(
      (segment) =>
        `[${Math.floor(segment.startMs / 1000)}s] **${t(segment.speaker === 'assistant' ? 'loc.resonanz.settings.assistant' : 'loc.resonanz.export.participant')}:** ${segment.text}`,
    )
    .join('\n\n');
  const messages = session.messages
    .map(
      (message) =>
        `**${t(message.role === 'user' ? 'loc.resonanz.export.question' : 'loc.resonanz.export.answer')}:** ${message.text}`,
    )
    .join('\n\n');
  const pauses = session.pauses?.length
    ? `\n\n## ${t('loc.resonanz.export.pauses')}\n\n${t('loc.resonanz.export.pauseNotice')}\n\n${session.pauses
        .map((pause) => {
          const duration =
            pause.durationMs === undefined
              ? t('loc.resonanz.session.pauseEndUnknown')
              : t(
                  'loc.resonanz.session.pauseDuration',
                  `${Math.floor(pause.durationMs / 60000)}:${String(Math.floor(pause.durationMs / 1000) % 60).padStart(2, '0')}`,
                );
          return `- [${Math.floor(pause.atMs / 1000)}s] ${duration}`;
        })
        .join('\n')}`
    : '';
  return `# ${session.title}\n\n${session.createdAt}\n\n## ${t('loc.resonanz.session.summary')}\n\n${session.summary || t('loc.resonanz.session.noSummary')}\n\n## ${t('loc.resonanz.session.transcript')}\n\n${transcript}${pauses}\n\n## ${t('loc.resonanz.export.questionsAnswers')}\n\n${messages}\n`;
}

async function nativeRequest(method: RequestMethod, payload: unknown): Promise<unknown> {
  switch (method) {
    case 'mini.update': {
      const snapshot = requestSchemas[method].parse(payload);
      const previous = miniRecorder.snapshot;
      const captureChanged =
        snapshot.sessionId !== previous.sessionId ||
        snapshot.active !== previous.active ||
        snapshot.paused !== previous.paused;
      if (mainWindow && mainWindow.webContents.getBackgroundThrottling() === snapshot.active)
        mainWindow.webContents.setBackgroundThrottling(!snapshot.active);
      captureReminder.sync(snapshot);
      const updated = miniRecorder.update(snapshot);
      if (captureChanged) syncTrayCapture(snapshot);
      await updated;
      return { ok: true };
    }
    case 'capture.reminder':
      captureReminder.update(requestSchemas[method].parse(payload));
      return { ok: true };
    case 'mini.get':
      return miniRecorder.snapshot;
    case 'mini.resize':
      miniRecorder.resize(requestSchemas[method].parse(payload).mode);
      return { ok: true };
    case 'mini.action': {
      const action = requestSchemas[method].parse(payload);
      const current = miniRecorder.snapshot;
      if (!current.active || current.sessionId !== action.sessionId || current.busy || quitPending)
        return { ok: true };
      if (action.action === 'open') await showTray();
      else publish({ type: 'capture.command', ...action });
      return { ok: true };
    }
    case 'storage.reveal': {
      const error = await shell.openPath(join(dataRoot, 'library'));
      if (error) throw new Error('loc.resonanz.error.storeReveal');
      return { ok: true };
    }
    case 'window.present': {
      const input = requestSchemas[method].parse(payload);
      if (mainWindow) presentation.present(mainWindow, input.surface);
      return { ok: true };
    }
    case 'window.tray':
      await showTray();
      return { ok: true };
    case 'window.tray.resize': {
      const input = requestSchemas[method].parse(payload);
      if (mainWindow && !mainWindow.isDestroyed() && presentation.traySizingActive)
        presentation.resizeTray(mainWindow, input.height);
      return { ok: true };
    }
    case 'settings.save': {
      const settings = (await background.request(method, payload)) as ISettings;
      syncLanguage(settings);
      void updateTray();
      return settings;
    }
    case 'bootstrap.get': {
      const snapshot = (await background.request(method, payload)) as IAppSnapshot;
      syncLanguage(snapshot.settings);
      return { ...snapshot, capabilities: await capabilities() };
    }
    case 'speech.start':
    case 'dictation.start': {
      const input = requestSchemas[method].parse(payload);
      if (
        process.platform === 'darwin' &&
        systemPreferences.getMediaAccessStatus('microphone') !== 'granted' &&
        !(await systemPreferences.askForMediaAccess('microphone'))
      )
        throw new Error('loc.resonanz.error.nativeMicDenied');
      await speech.start(
        input.sessionId,
        method === 'dictation.start'
          ? requestSchemas['dictation.start'].parse(payload).operationId
          : undefined,
      );
      return { started: true };
    }
    case 'dictation.stop': {
      const input = requestSchemas[method].parse(payload);
      await speech.stop(input.sessionId, input.operationId);
      return { stopped: true };
    }
    case 'speech.stop':
      await speech.stop(requestSchemas[method].parse(payload).sessionId);
      return { stopped: true };
    case 'speech.listen': {
      const input = requestSchemas[method].parse(payload);
      await speech.listen(input.sessionId, input.enabled);
      return { listening: input.enabled };
    }
    case 'speech.synthesize': {
      const input = requestSchemas[method].parse(payload);
      return {
        audioUrl: await speech.synthesize(input.sessionId, input.speechId, input.text, input.voice),
      };
    }
    case 'speech.cancel':
      await speech.cancel(requestSchemas[method].parse(payload).sessionId);
      return { cancelled: true };
    case 'live.respond': {
      const input = requestSchemas[method].parse(payload);
      await speech.flush(input.sessionId);
      return background.request(method, input);
    }
    case 'sessions.delete':
      await speech.closeSession(requestSchemas[method].parse(payload).sessionId);
      return background.request(method, payload);
    case 'sessions.finish': {
      const input = requestSchemas[method].parse(payload);
      await speech.closeSession(input.sessionId);
      const result = await background.request(method, payload);
      finishWaiters.get(input.sessionId)?.();
      finishWaiters.delete(input.sessionId);
      return result;
    }
    case 'transcription.run': {
      const input = requestSchemas[method].parse(payload);
      const session = (await background.request('sessions.get', {
        sessionId: input.sessionId,
      })) as ISession;
      if (!session.audioAvailable) throw new Error('loc.resonanz.error.transcribeActive');
      const snapshot = (await background.request('bootstrap.get', {})) as IAppSnapshot;
      const settings = snapshot.settings;
      await background.request('sessions.pipeline', {
        sessionId: session.id,
        stage: 'transcription',
        step: { state: 'running' },
      });
      let preparedPath: string | undefined;
      let transcriptStored = false;
      try {
        if (input.wavBytes) {
          const bytes = Buffer.from(
            input.wavBytes instanceof Uint8Array ? input.wavBytes : new Uint8Array(input.wavBytes),
          );
          if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE')
            throw new Error('loc.resonanz.error.invalidWav');
          await mkdir(join(dataRoot, 'transcription'), { recursive: true, mode: 0o700 });
          preparedPath = join(dataRoot, 'transcription', `${randomUUID()}.wav`);
          await writeFile(preparedPath, bytes, { mode: 0o600, flag: 'wx' });
        }
        const segments = await speech.transcribeFile(
          preparedPath ?? privateAudioPath(session),
          settings.locale,
        );
        const transcribed = await background.request('transcript.replace', {
          sessionId: session.id,
          segments,
        });
        transcriptStored = true;
        if (settings.autoAnalyze && segments.some((segment) => segment.text.trim()))
          await background.request('sessions.analyze', {
            sessionId: session.id,
            runId: randomUUID(),
          });
        return transcribed;
      } catch (error) {
        if (transcriptStored) {
          await background.request('sessions.pipeline', {
            sessionId: session.id,
            stage: 'analysis',
            step: {
              state: 'failed',
              provider: settings.assistant.provider,
              error:
                error instanceof Error
                  ? error.message.slice(0, 1000)
                  : 'loc.resonanz.error.assistantFailed',
            },
          });
          return background.request('sessions.get', { sessionId: session.id });
        }
        await background.request('sessions.pipeline', {
          sessionId: session.id,
          stage: 'transcription',
          step: {
            state: 'failed',
            error:
              error instanceof Error
                ? error.message.slice(0, 1000)
                : 'loc.resonanz.error.operation',
          },
        });
        throw error;
      } finally {
        if (preparedPath) await rm(preparedPath, { force: true });
      }
    }
    case 'sessions.import': {
      const { dialog } = await import('electron');
      const result = await dialog.showOpenDialog({
        title: t('loc.resonanz.export.import'),
        properties: ['openFile'],
        filters: [
          {
            name: t('loc.resonanz.export.formats'),
            extensions: ['webm', 'wav', 'mp3', 'm4a', 'mp4', 'ogg', 'flac', 'json'],
          },
        ],
      });
      return result.canceled || !result.filePaths[0]
        ? null
        : background.importFile(result.filePaths[0]);
    }
    case 'sessions.export': {
      const input = requestSchemas[method].parse(payload);
      const selected = (await background.request('sessions.get', {
        sessionId: input.sessionId,
      })) as ISession;
      const { dialog } = await import('electron');
      if (input.format === 'audio' && !selected.audioAvailable)
        throw new Error('loc.resonanz.error.audioMissing');
      const extension =
        input.format === 'json'
          ? 'json'
          : input.format === 'markdown'
            ? 'md'
            : recordingFileName(selected.mimeType).split('.').at(-1)!;
      const result = await dialog.showSaveDialog({
        title: t('loc.resonanz.export.recording'),
        defaultPath: join(
          app.getPath('downloads'),
          `${selected.title.replace(/[<>:"/\\|?*\u0000-\u001f]/gu, '_')}.${extension}`,
        ),
        filters: [
          { name: input.format === 'audio' ? 'Audio' : 'Resonanz', extensions: [extension] },
        ],
      });
      if (result.canceled || !result.filePath) return { saved: false };
      if (input.format === 'audio') await copyFile(privateAudioPath(selected), result.filePath);
      else
        await writeFile(
          result.filePath,
          input.format === 'markdown'
            ? markdown(selected)
            : JSON.stringify(
                { format: 'resonanz-session', version: 1, session: selected },
                null,
                2,
              ),
          'utf8',
        );
      return { saved: true };
    }
    case 'external.open': {
      const url = new URL(requestSchemas[method].parse(payload).url);
      if (url.protocol !== 'https:' || url.username || url.password)
        throw new Error('loc.resonanz.error.safeLogin');
      await shell.openExternal(url.toString());
      return { ok: true };
    }
    case 'window.show':
      await showWindow();
      return { ok: true };
    case 'window.hide':
      presentation.hideTray();
      mainWindow?.hide();
      return { ok: true };
    case 'app.quit':
      setImmediate(() => app.quit());
      return { ok: true };
    default:
      return background.request(method, payload);
  }
}

/** Reports a bounded secret-free startup failure and drains task-owned native state. */
async function reportStartupFailure(cause: unknown): Promise<void> {
  quitting = true;
  const knownCodes = new Set([
    'EACCES',
    'EPERM',
    'ENOENT',
    'ENOSPC',
    'EROFS',
    'EIO',
    'EMFILE',
    'ENFILE',
  ]);
  const code =
    cause &&
    typeof cause === 'object' &&
    'code' in cause &&
    typeof cause.code === 'string' &&
    knownCodes.has(cause.code)
      ? cause.code
      : 'STARTUP_FAILED';
  // Provider text, persisted session content, credentials and raw error objects are excluded.
  process.stderr.write(`[resonanz] Startup failed: phase=${startupPhase}, code=${code}.\n`);
  stopTrayUpdates();
  tray?.destroy();
  captureReminder.reset();
  miniRecorder.dispose();
  mainWindow?.destroy();
  let timeout: NodeJS.Timeout | undefined;
  const cleanup = Promise.allSettled([background.dispose(), speech.dispose()]);
  const result = await Promise.race([
    cleanup.then((results) => results.every((item) => item.status === 'fulfilled')),
    new Promise<false>((resolve) => {
      timeout = setTimeout(() => resolve(false), 20_000);
    }),
  ]);
  if (timeout) clearTimeout(timeout);
  if (!result)
    process.stderr.write('[resonanz] Native startup cleanup could not be fully confirmed.\n');
  app.exit(1);
}

const ownsLock = app.requestSingleInstanceLock();
if (!ownsLock) {
  quitting = true;
  app.quit();
}
if (ownsLock)
  void app
    .whenReady()
    .then(async () => {
      const development = rendererDevelopmentUrl();
      const developmentOrigin = development ? new URL(development).origin : undefined;
      session.defaultSession.webRequest.onHeadersReceived((details, callback) =>
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [
              `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob: resonanz-audio: resonanz-voice:; connect-src 'self' resonanz-audio: resonanz-voice:${developmentOrigin ? ` ${developmentOrigin} ${developmentOrigin.replace('http:', 'ws:')}` : ''}; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-src 'none'`,
            ],
          },
        }),
      );
      session.defaultSession.setPermissionRequestHandler(
        (contents, permission, callback, details) => {
          callback(
            Boolean(
              mainWindow &&
              contents === mainWindow.webContents &&
              permission === 'media' &&
              (!('mediaTypes' in details) || !details.mediaTypes?.includes('video')),
            ),
          );
        },
      );
      session.defaultSession.setPermissionCheckHandler((contents, permission) =>
        Boolean(mainWindow && contents === mainWindow.webContents && permission === 'media'),
      );
      for (const scheme of ['resonanz-audio', 'resonanz-voice'])
        protocol.handle(scheme, async (request) => {
          const origin = request.headers.get('origin');
          // Electron supplies this native field at runtime; its handle() callback
          // still uses the browser Request type in the installed declarations.
          const initiatorOrigin =
            'initiatorOrigin' in request ? request.initiatorOrigin : undefined;
          const rendererOrigin =
            mainWindow && !mainWindow.isDestroyed()
              ? mainWindow.webContents.mainFrame.origin
              : undefined;
          // Browser-owned requests (including Main's net.fetch) have no initiator.
          // Web requests must match the native origin of the owned renderer frame.
          if (
            (initiatorOrigin !== undefined && initiatorOrigin !== rendererOrigin) ||
            (origin !== null && (initiatorOrigin !== rendererOrigin || origin !== rendererOrigin))
          )
            return new Response(null, { status: 403 });
          const corsHeaders: Record<string, string> =
            initiatorOrigin !== undefined && rendererOrigin
              ? {
                  'Access-Control-Allow-Origin': rendererOrigin,
                  'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Length, Content-Range',
                  Vary: 'Origin',
                }
              : {};
          try {
            if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method))
              return new Response(null, { status: 405, headers: corsHeaders });
            const url = new URL(request.url);
            if (url.hostname !== 'session' || url.search || url.username || url.password)
              return new Response('Not found', { status: 404, headers: corsHeaders });
            const voiceRequest = url.protocol === 'resonanz-voice:';
            const parts = url.pathname.slice(1).split('/');
            if (parts.length !== (voiceRequest ? 2 : 1))
              return new Response('Not found', { status: 404, headers: corsHeaders });
            const id = dataSchemas.identifier.parse(parts[0]);
            if (request.method === 'OPTIONS')
              return new Response(null, {
                status: 204,
                headers: {
                  ...corsHeaders,
                  'Access-Control-Allow-Methods': 'GET, HEAD',
                  'Access-Control-Allow-Headers': 'Range',
                },
              });
            const selected = (await background.request('sessions.get', {
              sessionId: id,
            })) as ISession;
            if (!voiceRequest && !selected.audioAvailable)
              return new Response('Not found', { status: 404, headers: corsHeaders });
            const path = voiceRequest
              ? speech.voicePath(id, dataSchemas.identifier.parse(parts[1]))
              : privateAudioPath(selected);
            const information = await stat(path);
            const range = parseAudioRange(request.headers.get('range'), information.size);
            if (!range)
              return new Response(null, {
                status: 416,
                headers: { ...corsHeaders, 'Content-Range': `bytes */${information.size}` },
              });
            const body =
              request.method === 'HEAD'
                ? null
                : (Readable.toWeb(
                    createReadStream(path, { start: range.start, end: range.end }),
                  ) as ReadableStream<Uint8Array>);
            return new Response(body, {
              status: range.partial ? 206 : 200,
              headers: {
                ...corsHeaders,
                'Content-Type': voiceRequest ? 'audio/wav' : selected.mimeType,
                'Content-Length': String(range.end - range.start + 1),
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-store',
                ...(range.partial
                  ? { 'Content-Range': `bytes ${range.start}-${range.end}/${information.size}` }
                  : {}),
              },
            });
          } catch {
            return new Response('Not found', { status: 404, headers: corsHeaders });
          }
        });
      ipcMain.handle(channels.request, async (event, raw: unknown) => {
        const envelope = requestEnvelopeSchema.safeParse(raw);
        const correlationId = envelope.success ? envelope.data.correlationId : randomUUID();
        const mainOrigin = trusted(event.sender, event.senderFrame);
        const miniOrigin = miniRecorder.trusts(event.sender, event.senderFrame);
        if (!mainOrigin && !miniOrigin)
          return {
            correlationId,
            ok: false,
            error: {
              code: 'UNTRUSTED_RENDERER',
              message: 'loc.resonanz.error.requestOrigin',
            },
          };
        if (!envelope.success)
          return {
            correlationId,
            ok: false,
            error: {
              code: 'INVALID_REQUEST',
              message: 'loc.resonanz.error.requestFormat',
            },
          };
        if (
          miniOrigin &&
          !['mini.get', 'mini.action', 'mini.resize'].includes(envelope.data.method)
        )
          return responseEnvelopeSchema.parse({
            correlationId,
            ok: false,
            error: { code: 'UNTRUSTED_RENDERER', message: 'loc.resonanz.error.requestOrigin' },
          });
        try {
          const { method, payload } = envelope.data;
          const input = requestSchemas[method].parse(payload);
          const output = responseSchemas[method].parse(await nativeRequest(method, input));
          return responseEnvelopeSchema.parse({ correlationId, ok: true, data: output });
        } catch (cause) {
          return responseEnvelopeSchema.parse({
            correlationId,
            ok: false,
            error: {
              code: 'REQUEST_FAILED',
              message:
                cause instanceof Error
                  ? cause.message.slice(0, 2000)
                  : 'loc.resonanz.error.runFailed',
            },
          });
        }
      });
      startupPhase = 'background';
      await background.start();
      language = uiLanguage(
        ((await background.request('bootstrap.get', {})) as IAppSnapshot).settings.uiLanguage,
      );
      startupPhase = 'window';
      await createWindow();
      startupPhase = 'tray';
      createTray();
      if (process.platform === 'darwin') app.dock?.setIcon(iconPath('png/app/resonanz-512.png'));
      configureApplicationMenu();
      startupPhase = 'ready';
    })
    .catch(reportStartupFailure);
app.on('activate', () => {
  if (startupPhase === 'ready') void showWindow();
});
app.on('second-instance', () => {
  if (startupPhase === 'ready') void showWindow();
});
app.on('window-all-closed', () => {
  /* The cross-platform tray owns the background lifetime. */
});
app.on('before-quit', (event) => {
  if (quitting) return;
  event.preventDefault();
  void quitApplication().catch(() => {
    stopTrayUpdates();
    quitting = true;
    app.exit(1);
  });
});
