// #region Imports
import {
  app,
  BrowserWindow,
  Menu,
  Tray,
  nativeImage,
  ipcMain,
  session,
  protocol,
  shell,
  systemPreferences,
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
  type RequestMethod,
} from '@resonanz/contracts';
import { recordingFileName } from '@resonanz/sessions';
import { BackgroundService } from './BackgroundService.js';
import { NativeSpeechService } from './NativeSpeechService.js';
import { parseAudioRange } from './parseAudioRange.js';
// #endregion

const currentDirectory = dirname(fileURLToPath(import.meta.url));
app.setName('Resonanz');
const dataRoot = process.env['RESONANZ_DATA_ROOT'] ?? app.getPath('userData');
await mkdir(join(dataRoot, 'chromium'), { recursive: true, mode: 0o700 });
app.setPath('userData', join(dataRoot, 'chromium'));
const hidden = process.env['RESONANZ_E2E'] === '1';
let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
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
    throw new Error('Der Entwicklungsrenderer muss auf localhost laufen.');
  return url.toString();
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: 'Resonanz',
    icon: iconPath('png/app/resonanz-512.png'),
    backgroundColor: '#fafaf9',
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
      mainWindow?.hide();
    }
  });
  mainWindow.webContents.on('render-process-gone', () => {
    void activeRecordings().then(async (sessions) => {
      for (const session of sessions) await speech.closeSession(session.id);
      await interruptRecordings();
    });
  });
  mainWindow.on('closed', () => {
    mainWindow = undefined;
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
  if (hidden) return;
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.show();
  mainWindow?.focus();
  app.focus({ steal: true });
}

function createTray(): void {
  if (hidden) return;
  const image = nativeImage.createFromPath(
    process.platform === 'darwin'
      ? iconPath('png/tray/resonanz-tray.png')
      : iconPath('png/app/resonanz-32.png'),
  );
  if (process.platform === 'darwin') image.setTemplateImage(true);
  tray = new Tray(image);
  tray.setToolTip('Resonanz');
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Resonanz öffnen', click: () => void showWindow() },
      {
        label: 'Neue Aufnahme',
        click: () =>
          void showWindow().then(() => publish({ type: 'ui.command', command: 'recording.start' })),
      },
      {
        label: 'Live-Unterhaltung',
        click: () =>
          void showWindow().then(() =>
            publish({ type: 'ui.command', command: 'conversation.start' }),
          ),
      },
      { type: 'separator' },
      { label: 'Beenden', click: () => app.quit() },
    ]),
  );
  tray.on('click', () => void showWindow());
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
      error:
        'Die Audioaufnahme wurde durch einen unterbrochenen Renderer beendet. Bereits gespeicherte Blöcke wurden erhalten.',
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
        title: 'Aufnahme beenden?',
        message: 'Eine Aufnahme läuft noch.',
        detail: 'Beim Beenden wird die Aufnahme gespeichert und die Live-Verbindung geschlossen.',
        buttons: ['Weiter aufnehmen', 'Speichern und beenden'],
        defaultId: 0,
        cancelId: 0,
      });
      if (result.response !== 1) return;
    }
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
          error: 'Resonanz wurde beendet. Alle bis dahin gespeicherten Audioblöcke sind erhalten.',
        });
    }
    await speech.dispose();
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
        `[${Math.floor(segment.startMs / 1000)}s] **${segment.speaker === 'assistant' ? 'Assistent' : 'Teilnehmer'}:** ${segment.text}`,
    )
    .join('\n\n');
  const messages = session.messages
    .map((message) => `**${message.role === 'user' ? 'Frage' : 'Antwort'}:** ${message.text}`)
    .join('\n\n');
  return `# ${session.title}\n\n${session.createdAt}\n\n## Zusammenfassung\n\n${session.summary || 'Noch keine Zusammenfassung.'}\n\n## Transkript\n\n${transcript}\n\n## Fragen und Antworten\n\n${messages}\n`;
}

async function nativeRequest(method: RequestMethod, payload: unknown): Promise<unknown> {
  switch (method) {
    case 'bootstrap.get':
      return {
        ...((await background.request(method, payload)) as IAppSnapshot),
        capabilities: await capabilities(),
      };
    case 'speech.start': {
      const input = requestSchemas[method].parse(payload);
      if (
        process.platform === 'darwin' &&
        systemPreferences.getMediaAccessStatus('microphone') !== 'granted' &&
        !(await systemPreferences.askForMediaAccess('microphone'))
      )
        throw new Error(
          'Der Mikrofonzugriff wurde verweigert. Erlaube Resonanz in den Systemeinstellungen unter Datenschutz & Sicherheit → Mikrofon.',
        );
      await speech.start(input.sessionId);
      return { started: true };
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
      if (!session.audioAvailable)
        throw new Error('Beende zuerst die Aufnahme, bevor du sie transkribierst.');
      const snapshot = (await background.request('bootstrap.get', {})) as IAppSnapshot;
      const settings = snapshot.settings;
      let preparedPath: string | undefined;
      try {
        if (input.wavBytes) {
          const bytes = Buffer.from(
            input.wavBytes instanceof Uint8Array ? input.wavBytes : new Uint8Array(input.wavBytes),
          );
          if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE')
            throw new Error('Die vorbereitete Audiodatei ist keine WAV-Datei.');
          await mkdir(join(dataRoot, 'transcription'), { recursive: true, mode: 0o700 });
          preparedPath = join(dataRoot, 'transcription', `${randomUUID()}.wav`);
          await writeFile(preparedPath, bytes, { mode: 0o600, flag: 'wx' });
        }
        const segments = await speech.transcribeFile(
          preparedPath ?? privateAudioPath(session),
          settings.locale,
        );
        return await background.request('transcript.replace', { sessionId: session.id, segments });
      } finally {
        if (preparedPath) await rm(preparedPath, { force: true });
      }
    }
    case 'sessions.import': {
      const { dialog } = await import('electron');
      const result = await dialog.showOpenDialog({
        title: 'Aufzeichnung importieren',
        properties: ['openFile'],
        filters: [
          {
            name: 'Aufzeichnungen und Resonanz-Transkripte',
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
        throw new Error('Für diese Session ist keine Audiodatei gespeichert.');
      const extension =
        input.format === 'json'
          ? 'json'
          : input.format === 'markdown'
            ? 'md'
            : recordingFileName(selected.mimeType).split('.').at(-1)!;
      const result = await dialog.showSaveDialog({
        title: 'Aufzeichnung exportieren',
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
        throw new Error('Es können nur sichere Anmeldeseiten geöffnet werden.');
      await shell.openExternal(url.toString());
      return { ok: true };
    }
    case 'window.show':
      await showWindow();
      return { ok: true };
    case 'window.hide':
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
  process.stderr.write(`[resonanz] Start fehlgeschlagen: phase=${startupPhase}, code=${code}.\n`);
  tray?.destroy();
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
    process.stderr.write(
      '[resonanz] Die native Startbereinigung konnte nicht vollständig bestätigt werden.\n',
    );
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
        if (!trusted(event.sender, event.senderFrame))
          return {
            correlationId,
            ok: false,
            error: {
              code: 'UNTRUSTED_RENDERER',
              message: 'Die Anfrage stammt nicht aus dem Resonanz-Fenster.',
            },
          };
        if (!envelope.success)
          return {
            correlationId,
            ok: false,
            error: {
              code: 'INVALID_REQUEST',
              message: 'Die Anfrage entspricht nicht dem vereinbarten Datenformat.',
            },
          };
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
                  : 'Der Auftrag ist fehlgeschlagen.',
            },
          });
        }
      });
      startupPhase = 'background';
      await background.start();
      startupPhase = 'window';
      await createWindow();
      startupPhase = 'tray';
      createTray();
      if (process.platform === 'darwin') app.dock?.setIcon(iconPath('png/app/resonanz-512.png'));
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: 'Resonanz',
            submenu: [
              { label: 'Resonanz öffnen', click: () => void showWindow() },
              { type: 'separator' },
              { label: 'Beenden', accelerator: 'CmdOrCtrl+Q', click: () => app.quit() },
            ],
          },
          { role: 'editMenu' },
          { role: 'viewMenu' },
        ]),
      );
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
    quitting = true;
    app.exit(1);
  });
});
