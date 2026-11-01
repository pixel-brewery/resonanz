import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { access, mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { _electron } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const packaged = process.argv.includes('--packaged');
const speech = process.argv.includes('--speech');
assert(
  process.argv.slice(2).every((argument) => ['--packaged', '--speech'].includes(argument)),
  'Use --packaged and/or --speech, or no arguments.',
);
const executable = packaged
  ? join(
      resolve(root, process.env['RESONANZ_OUTPUT_DIR'] ?? 'out'),
      `Resonanz-${process.platform}-${process.arch}`,
      ...(process.platform === 'darwin'
        ? ['Resonanz.app', 'Contents', 'MacOS', 'Resonanz']
        : [process.platform === 'win32' ? 'Resonanz.exe' : 'Resonanz']),
    )
  : require('electron');
await access(executable);
await access(join(root, 'dist/apps/renderer/browser/index.html'));
await mkdir(join(root, '.codex-work'), { recursive: true });
const artifacts = await mkdtemp(
  join(root, '.codex-work', packaged ? 'packaged-smoke-' : 'desktop-smoke-'),
);
const dataRoot = join(artifacts, 'state');
const checks = [];
const errors = [];
const lifecycle = [];
let application;
let page;
let recordedId;

function passed(name) {
  checks.push(name);
  process.stdout.write(`PASS ${name}\n`);
}

async function waitFor(condition, description) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await delay(100);
  }
  throw new Error(`Timed out: ${description}`);
}

const control = (id) => page.locator(`[test-id="${id}"]`);
const request = (method, payload = {}) =>
  page.evaluate(({ method, payload }) => window.resonanz.request(method, payload), {
    method,
    payload,
  });
const session = () => request('sessions.get', { sessionId: recordedId });
const errorText = () =>
  control('application-error')
    .locator('mosaik-text')
    .evaluateAll((nodes) => nodes.map((node) => node.text).join(' '));

async function launch() {
  const env = {
    ...process.env,
    OPENAI_API_KEY: '',
    ANTHROPIC_API_KEY: '',
    RESONANZ_DATA_ROOT: dataRoot,
    RESONANZ_E2E: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  application = await _electron.launch({
    executablePath: executable,
    args: [
      ...(packaged ? [] : [root]),
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
    cwd: root,
    env,
    timeout: 30_000,
  });
  const child = application.process();
  lifecycle.push({ event: 'launched', pid: child.pid, at: new Date().toISOString() });
  child.once('exit', (code, signal) =>
    lifecycle.push({ event: 'exited', pid: child.pid, code, signal, at: new Date().toISOString() }),
  );
  page = await application.firstWindow({ timeout: 15_000 });
  page.on('crash', () =>
    lifecycle.push({ event: 'renderer.crashed', at: new Date().toISOString() }),
  );
  page.on('close', () => lifecycle.push({ event: 'window.closed', at: new Date().toISOString() }));
  page.setDefaultTimeout(10_000);
  page.on('pageerror', (error) =>
    errors.push({ source: 'renderer', message: error.message, stack: error.stack }),
  );
  const cdp = await page.context().newCDPSession(page);
  cdp.on('Log.entryAdded', ({ entry }) => {
    if (entry.level === 'error') errors.push({ source: entry.source, message: entry.text });
  });
  await cdp.send('Log.enable');
  await control('library-view').waitFor({ state: 'visible' });
  await waitFor(
    async () => (await request('bootstrap.get')).capabilities !== null,
    'native bootstrap',
  );
}

async function openLibrary() {
  await request('window.show');
  await page.locator('resonanz-shell:not(.tray-mode)').waitFor({ state: 'visible' });
  const back = control('settings-back');
  if (await back.isVisible()) await back.click();
  else await control('nav-library').click();
  await control('library-view').waitFor({ state: 'visible' });
}
async function menuAction(id) {
  if (!(await control(id).isVisible())) await page.locator('.session-menu > summary').click();
  await control(id).click();
}
async function openSession(id) {
  await openLibrary();
  await control(`session-row-${id}`).click();
  await control('preview-open').click();
  await control('session-title').waitFor({ state: 'visible' });
}

async function selectFile(path) {
  await application.evaluate(({ dialog }, filePath) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
  }, path);
  await openLibrary();
  const before = new Set((await request('bootstrap.get')).sessions.map((item) => item.id));
  await control('import-session').click();
  await waitFor(
    async () => (await request('bootstrap.get')).sessions.some((item) => !before.has(item.id)),
    'file import',
  );
  const imported = (await request('bootstrap.get')).sessions.find((item) => !before.has(item.id));
  await control('session-title').waitFor({ state: 'visible' });
  return request('sessions.get', { sessionId: imported.id });
}

async function exportFile(format, path, button) {
  if (!(await button.isVisible())) await page.locator('.session-menu > summary').click();
  await application.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, path);
  await button.click();
  await waitFor(async () => (await stat(path).catch(() => null))?.size > 0, `${format} export`);
}

try {
  await launch();
  assert.equal((await request('bootstrap.get')).sessions.length, 0);
  assert(page.url().includes('/index.html#/'));
  assert.equal(
    await page
      .locator('aside.sidebar')
      .evaluate((node) => Math.round(node.getBoundingClientRect().width)),
    236,
  );
  passed('Angular/Mosaik, sandboxed preload and native utility start');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal((await request('bootstrap.get')).settings.uiLanguage, 'en');
  assert.match(await control('new-recording').innerText(), /New session/u);

  await control('new-conversation').click();
  await control('settings-view').waitFor({ state: 'visible' });
  assert.match(await errorText(), /assistant|sign in|speech|Codex|Claude/iu);
  assert.equal(await control('api-key').count(), 0);
  assert.equal((await request('bootstrap.get')).sessions.length, 0);
  passed('native assistant/speech prerequisites lead to setup without API-key fields or capture');
  await waitFor(
    async () => !(await control('assistant-status').ariaSnapshot()).includes('Checking connection'),
    'native CLI discovery',
  );
  const status = await request('assistant.status');
  assert.equal(status.authenticated, false);
  passed('native assistant discovery uses isolated, unauthenticated profile');

  // The synthetic recording must not request OS speech consent in automation.
  await request('settings.save', { autoTranscribe: false });
  await openLibrary();
  await page.reload();
  await control('library-view').waitFor({ state: 'visible' });
  await control('new-recording').click();
  await control('capture-panel').waitFor({ state: 'visible' });
  const trayGeometry = await application.evaluate(({ BrowserWindow, screen }) => {
    const window = BrowserWindow.getAllWindows()[0];
    return {
      content: window.getContentBounds(),
      bounds: window.getBounds(),
      area: screen.getDisplayMatching(window.getBounds()).workArea,
      resizable: window.isResizable(),
    };
  });
  assert.equal(trayGeometry.content.width, 368);
  assert.equal(trayGeometry.resizable, false);
  assert(
    trayGeometry.bounds.x >= trayGeometry.area.x && trayGeometry.bounds.y >= trayGeometry.area.y,
  );
  await page.keyboard.press('Escape');
  await control('capture-panel').waitFor({ state: 'hidden' });
  await request('window.show');
  await control('new-recording').click();
  await control('start-session').click();
  await control('capture-pause').waitFor({ state: 'visible' });
  recordedId = (await request('bootstrap.get')).sessions.find(
    (item) => item.status === 'recording',
  )?.id;
  assert(recordedId);
  await waitFor(async () => (await session()).audioBytes > 0, 'first durable media chunk');
  await control('mark-decision').click();
  await waitFor(async () => (await session()).moments?.length === 1, 'typed moment journal');
  // Switch interface language through the actual settings UI while capture keeps its owner.
  const speechLocale = (await request('bootstrap.get')).settings.locale;
  await page.keyboard.press('Escape');
  await control('capture-panel').waitFor({ state: 'hidden' });
  await request('window.show');
  await control('nav-settings').click();
  await control('settings-view').waitFor({ state: 'visible' });
  await control('ui-language').getByRole('button', { name: 'Toggle options' }).click();
  await page.getByRole('option', { name: 'Deutsch', exact: true }).click();
  await waitFor(
    async () => (await request('bootstrap.get')).settings.uiLanguage === 'de',
    'German UI preference',
  );
  await waitFor(
    async () => (await page.locator('html').getAttribute('lang')) === 'de',
    'German interface',
  );
  assert.equal((await request('bootstrap.get')).settings.locale, speechLocale);
  assert.equal((await session()).status, 'recording');
  assert.equal((await session()).id, recordedId);
  await openLibrary();
  assert.match(await control('new-recording').innerText(), /Neue Session/u);
  await control('new-recording').click();
  await control('capture-panel').waitFor({ state: 'visible' });
  await control('capture-pause').click();
  await waitFor(async () => (await session()).status === 'paused', 'pause');
  const pausedBytes = (await session()).audioBytes;
  await control('capture-resume').click();
  await waitFor(async () => (await session()).audioBytes > pausedBytes, 'resumed media');
  await control('capture-stop').click();
  await page.keyboard.press('Escape');
  await control('capture-panel').waitFor({ state: 'hidden' });
  await openSession(recordedId);
  await control('tab-analysis').click();
  const recording = await session();
  assert.equal(recording.status, 'ready');
  assert(recording.audioAvailable && recording.audioBytes > 0 && recording.nextAudioSequence > 2);
  await control('play-recording').click();
  await waitFor(
    () =>
      control('playback-position').evaluate(
        (node) => Number(node.querySelector('strong')?.textContent?.replaceAll(':', '') ?? 0) > 0,
      ),
    'decoded audio playback advances',
  );
  await control('play-recording').click();
  const range = await application.evaluate(async ({ net }, id) => {
    const response = await net.fetch(`resonanz-audio://session/${id}`, {
      headers: { Range: 'bytes=0-127' },
    });
    return {
      status: response.status,
      bytes: (await response.arrayBuffer()).byteLength,
      range: response.headers.get('content-range'),
    };
  }, recordedId);
  assert.equal(range.status, 206);
  assert.equal(range.bytes, 128);
  passed(
    'unchanged Flamox recorder/worklet/player: synthetic capture, pause, resume, final flush and ranged playback',
  );

  if ((await page.locator('.organization').getAttribute('open')) === null)
    await page.locator('.organization > summary').click();
  await control('add-collection').click();
  await control('collection-name').locator('input').fill('Projektstart');
  await control('save-collection').click();
  await waitFor(
    async () => (await request('bootstrap.get')).collections.length === 1,
    'collection creation',
  );
  const collection = (await request('bootstrap.get')).collections[0];
  await menuAction('edit-session');
  await control('session-title-input').locator('input').fill('Resonanz – Prototypprüfung');
  await control('session-tags').locator('input').fill('Audio, Planung');
  await control('session-collection-select')
    .getByRole('button', { name: 'Toggle options' })
    .click();
  await page.getByRole('option', { name: 'Projektstart', exact: true }).click();
  await control('save-session-metadata').click();
  await waitFor(async () => (await session()).collectionId === collection.id, 'metadata save');
  await menuAction('toggle-favorite');
  await waitFor(async () => (await session()).starred, 'favourite');
  await control('nav-favorites').click();
  await page.waitForURL((url) => url.hash === '#/?scope=favorites');
  await control(`session-row-${recordedId}`).waitFor({ state: 'visible' });
  await control('session-search').locator('input').fill('nichtvorhanden');
  await control('session-search').locator('input').press('Enter');
  await control('no-search-results').waitFor({ state: 'visible' });
  await control('session-search').locator('input').fill('Planung');
  await control('session-search').locator('input').press('Enter');
  await control(`session-row-${recordedId}`).waitFor({ state: 'visible' });
  await control(`collection-${collection.id}`).click();
  await control('rename-collection').click();
  await openLibrary();
  await control('collection-rename-editor').waitFor({ state: 'hidden' });
  await control(`collection-${collection.id}`).click();
  await control('rename-collection').click();
  await control('rename-collection-input').locator('input').fill('Produktideen');
  await control('save-collection-name').click();
  await waitFor(
    async () => (await request('bootstrap.get')).collections[0]?.name === 'Produktideen',
    'collection rename',
  );
  passed('title, tags, favourite, search and collection editing across routes');

  await openSession(recordedId);
  await control('tab-analysis').click();
  const transcriptMenu = page.locator('[test-id="transcript-panel"] .transcript-menu');
  await transcriptMenu.waitFor({ state: 'visible' });
  if ((await transcriptMenu.getAttribute('open')) === null)
    await transcriptMenu.locator('summary').click();
  await control('edit-transcript').click();
  const manualText =
    'Manueller Prüftext: Resonanz speichert Aufzeichnungen lokal. Zum Projektstart werden Aufgaben und offene Fragen gesammelt.';
  await control('transcript-editor').locator('textarea').fill(manualText);
  await control('save-transcript').click();
  await waitFor(
    async () => (await session()).transcript[0]?.text === manualText,
    'transcript edit',
  );
  assert.equal((await session()).transcript[0].endMs, recording.durationMs);
  await page.screenshot({ path: join(artifacts, 'session.png') });
  const jsonPath = join(artifacts, 'session.json');
  const markdownPath = join(artifacts, 'session.md');
  const audioPath = join(artifacts, 'audio.webm');
  await exportFile(
    'JSON',
    jsonPath,
    page.getByRole('button', { name: 'Sessiondaten exportieren', exact: true }),
  );
  await exportFile('Markdown', markdownPath, control('export-markdown'));
  await exportFile(
    'audio',
    audioPath,
    page.getByRole('button', { name: 'Audio exportieren', exact: true }),
  );
  assert.equal((await stat(audioPath)).size, recording.audioBytes);
  assert.equal((await readFile(audioPath)).subarray(0, 4).toString('hex'), '1a45dfa3');
  assert((await readFile(markdownPath, 'utf8')).includes(manualText));
  const imported = await selectFile(jsonPath);
  assert.equal(imported.transcript[0]?.text, manualText);
  assert.equal(imported.audioAvailable, false);
  const importedAudio = await selectFile(audioPath);
  assert.equal(importedAudio.audioBytes, recording.audioBytes);
  assert(importedAudio.audioAvailable);
  passed(
    'manual transcript retains timeline; JSON/Markdown/audio exports and JSON/audio imports use actual native file I/O',
  );

  if (speech) {
    const fixture = JSON.parse(await readFile(jsonPath, 'utf8'));
    fixture.session.title = 'Vorlesen – manuelle Prüfdaten';
    fixture.session.summary =
      'Dies ist ein manuell vorgegebener Prüftext für die Sprachsynthese. Resonanz liest diesen Text mit der vorhandenen Systemstimme vor. Die Wiedergabe lässt sich pausieren, fortsetzen und beenden. '.repeat(
        3,
      );
    const fixturePath = join(artifacts, 'speech-fixture.json');
    await writeFile(fixturePath, JSON.stringify(fixture));
    await selectFile(fixturePath);
    await waitFor(
      () => page.evaluate(() => speechSynthesis.getVoices().length > 0),
      'available system voice',
    );
    await control('tab-analysis').click();
    await control('summary-panel').getByRole('button', { name: 'Vorlesen', exact: true }).click();
    await control('speech-controls').waitFor({ state: 'visible' });
    await waitFor(
      () => page.evaluate(() => speechSynthesis.speaking),
      'actual speech engine starts',
    );
    await page.getByRole('button', { name: 'Vorlesen pausieren', exact: true }).click();
    await page.getByRole('button', { name: 'Vorlesen fortsetzen', exact: true }).click();
    await page.getByRole('button', { name: 'Vorlesen beenden', exact: true }).click();
    await control('speech-controls').waitFor({ state: 'hidden' });
    passed(
      'unchanged Flamox TTS: actual system voice, pause, resume and stop with explicit manual fixture',
    );
  }

  await control('nav-settings').click();
  await control('settings-view').waitFor({ state: 'visible' });
  await control('ui-language').getByRole('button', { name: 'Toggle options' }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await waitFor(
    async () => (await request('bootstrap.get')).settings.uiLanguage === 'en',
    'English UI preference',
  );
  await waitFor(
    async () => (await page.locator('html').getAttribute('lang')) === 'en',
    'English interface',
  );
  const nativeLabels = await application.evaluate(({ Menu }) =>
    Menu.getApplicationMenu()?.items[0]?.submenu?.items.map((item) => item.label),
  );
  assert(nativeLabels.includes('Open Resonanz'));
  assert.equal((await request('bootstrap.get')).settings.locale, speechLocale);
  passed(
    'English default, German/English UI switching during capture, independent speech locale and native menus',
  );
  const conversationInstructions =
    'Sprich auf Deutsch, kurz und klar. Dies ist ein Einrichtungstest.';
  const speechAdvanced = page.locator('.speech-advanced');
  if ((await speechAdvanced.getAttribute('open')) === null)
    await speechAdvanced.locator('summary').click();
  await control('conversation-instructions').locator('textarea').fill(conversationInstructions);
  const connectionAdvanced = page.locator('.advanced:not(.speech-advanced)');
  if ((await connectionAdvanced.getAttribute('open')) === null)
    await connectionAdvanced.locator(':scope > summary').click();
  await control('save-settings').click();
  await waitFor(
    async () =>
      (await request('bootstrap.get')).settings.conversationInstructions ===
      conversationInstructions,
    'settings persistence',
  );
  assert.equal(await control('api-key').count(), 0);
  assert.equal((await request('bootstrap.get')).settings.autoTranscribe, false);
  await control('silence-reminder').click();
  await waitFor(
    async () => (await request('bootstrap.get')).settings.silenceReminder === true,
    'measured silence reminder preference',
  );
  await control('mark-pauses').click();
  await waitFor(
    async () => (await request('bootstrap.get')).settings.markPausesInTranscript === true,
    'recording pause annotation preference',
  );
  const rate = control('speech-rate').getByRole('slider');
  await rate.press('End');
  await waitFor(
    async () => (await request('bootstrap.get')).settings.speechRate === 2,
    'native rate slider maximum',
  );
  await rate.press('ArrowLeft');
  await waitFor(
    async () => (await request('bootstrap.get')).settings.speechRate === 1.5,
    'native rate slider keyboard pacing',
  );
  await control('audio-retention').getByRole('button', { name: 'Toggle options' }).click();
  await page.getByRole('option', { name: 'After 90 days', exact: true }).click();
  await waitFor(
    async () => (await request('bootstrap.get')).settings.audioRetentionDays === 90,
    'native recording retention policy',
  );
  await control('audio-retention').getByRole('button', { name: 'Toggle options' }).click();
  await page.getByRole('option', { name: 'Never', exact: true }).click();
  await waitFor(
    async () => (await request('bootstrap.get')).settings.audioRetentionDays === 'never',
    'retention opt-out',
  );
  const beforeCancelledClear = (await request('bootstrap.get')).sessions.length;
  await control('clear-library').click();
  await page.getByRole('alertdialog').waitFor({ state: 'visible' });
  await control('cancel-confirmation').click();
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  assert.equal((await request('bootstrap.get')).sessions.length, beforeCancelledClear);
  passed('keyless native speech preferences persist through the actual settings UI');
  await openSession(recordedId);
  await page.reload();
  await control('session-title').waitFor({ state: 'visible' });
  assert(page.url().includes('/index.html#/session/'));
  assert.equal((await session()).title, 'Resonanz – Prototypprüfung');
  await application.close();
  application = undefined;
  await launch();
  const persisted = await session();
  assert.equal((await request('bootstrap.get')).settings.uiLanguage, 'en');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal((await request('bootstrap.get')).settings.silenceReminder, true);
  assert.equal((await request('bootstrap.get')).settings.markPausesInTranscript, true);
  assert.equal((await request('bootstrap.get')).settings.speechRate, 1.5);
  assert.equal((await request('bootstrap.get')).settings.audioRetentionDays, 'never');
  assert.equal(persisted.audioBytes, recording.audioBytes);
  assert.equal(persisted.transcript[0]?.text, manualText);
  assert.equal(persisted.collectionId, collection.id);
  assert(persisted.starred);
  assert.equal(
    (await request('bootstrap.get')).settings.conversationInstructions,
    conversationInstructions,
  );
  await control(`collection-${collection.id}`).click();
  await control('delete-collection').click();
  await control('confirm-delete-collection').click();
  await waitFor(
    async () => (await request('bootstrap.get')).collections.length === 0,
    'collection removal',
  );
  assert.equal((await session()).collectionId, null);
  await openSession(importedAudio.id);
  await menuAction('delete-session');
  await control('confirm-delete-session').click();
  await waitFor(
    async () =>
      !(await request('bootstrap.get')).sessions.some((item) => item.id === importedAudio.id),
    'session removal',
  );
  passed('hash route reload, full application restart, persistence and confirmed deletion');
  await control('nav-settings').click();
  await control('settings-view').waitFor({ state: 'visible' });
  const usage = await request('storage.usage');
  assert(usage.totalBytes > 0 && usage.audioBytes > 0 && usage.transcriptBytes > 0);
  await waitFor(
    async () =>
      (await page
        .locator('resonanz-storage-breakdown mosaik-segment-bar')
        .evaluate((element) => element.max)) === usage.totalBytes,
    'measured library storage presentation',
  );
  assert.equal(await page.locator('resonanz-storage-breakdown mosaik-segment-bar-item').count(), 3);
  const keptSettings = (await request('bootstrap.get')).settings;
  await control('clear-library').click();
  await control('confirm-clear-library').click();
  await waitFor(
    async () => (await request('bootstrap.get')).sessions.length === 0,
    'explicitly confirmed complete library deletion',
  );
  await page.getByRole('alertdialog').waitFor({ state: 'hidden' });
  assert.equal((await request('bootstrap.get')).collections.length, 0);
  assert.deepEqual((await request('bootstrap.get')).settings, keptSettings);
  assert.equal((await request('assistant.status')).authenticated, false);
  passed(
    'measured storage, retention controls and confirmed library deletion preserve native preferences/accounts',
  );
  assert.deepEqual(errors, [], 'Unexpected renderer, worker or Chromium errors');
  const evidence = {
    platform: process.platform,
    arch: process.arch,
    packaged,
    speech,
    checks,
    recording: {
      durationMs: recording.durationMs,
      bytes: recording.audioBytes,
      nextSequence: recording.nextAudioSequence,
    },
    limits: [
      'synthetic microphone only',
      'native dialogs select controlled paths',
      'no provider login/inference/live call',
      'no physical microphone or native speech recognition',
    ],
  };
  await writeFile(join(artifacts, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`Desktop verification passed. Artifacts: ${artifacts}\n`);
} catch (error) {
  const ui =
    page && !page.isClosed()
      ? await page
          .evaluate(() => {
            const search = document.querySelector('[test-id="session-search"]');
            return {
              route: location.hash,
              searchValue: search?.value,
              searchInputValue: search?.shadowRoot?.querySelector('input')?.value,
              visibleSessionIds: [...document.querySelectorAll('[test-id^="session-row-"]')].map(
                (element) => element.getAttribute('test-id'),
              ),
            };
          })
          .catch(() => null)
      : null;
  if (page && !page.isClosed())
    await page.screenshot({ path: join(artifacts, 'failure.png') }).catch(() => undefined);
  await writeFile(
    join(artifacts, 'failure.json'),
    JSON.stringify(
      { checks, errors, lifecycle, ui, message: String(error), stack: error?.stack },
      null,
      2,
    ),
  );
  throw error;
} finally {
  if (application) await application.close();
}
