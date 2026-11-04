import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
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
// Application errors appear at the bottom of the window: a toast and today's notices in the
// status-bar notification centre.
const errorText = async () => {
  await control('notification-bell').click();
  await control('notification-centre').waitFor({ state: 'visible' });
  const text = await control('notification-centre').innerText();
  await control('notification-bell').click();
  await control('notification-centre').waitFor({ state: 'hidden' });
  return text;
};

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

// The native capturer can render the hidden Electron test window without showing or focusing it.
async function captureDiagnosticImage(name) {
  let window;
  let timeout;
  try {
    const capture = (async () => {
      window = await application.browserWindow(page);
      return window.evaluate(async (nativeWindow) => {
        const wasVisible = nativeWindow.isVisible();
        const wasFocused = nativeWindow.isFocused();
        const image = await nativeWindow.webContents.capturePage(undefined, {
          stayHidden: true,
          stayAwake: true,
        });
        return {
          ...image.getSize(),
          empty: image.isEmpty(),
          png: image.toPNG().toString('base64'),
          wasVisible,
          wasFocused,
          visible: nativeWindow.isVisible(),
          focused: nativeWindow.isFocused(),
        };
      });
    })();
    const result = await Promise.race([
      capture,
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(`Native diagnostic capture timed out after 10000ms: ${name}`)),
          10_000,
        );
      }),
    ]);
    assert.equal(result.wasVisible, false, 'The test window starts hidden');
    assert.equal(result.visible, false, 'Diagnostic capture keeps the test window hidden');
    assert.equal(result.focused, result.wasFocused, 'Diagnostic capture preserves window focus');
    assert.equal(result.empty, false, 'Diagnostic capture returns a nonempty native image');
    assert(result.width > 0 && result.height > 0, 'Diagnostic capture has positive dimensions');
    const png = Buffer.from(result.png, 'base64');
    assert(png.length > 24, 'Diagnostic capture returns PNG data');
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.subarray(12, 16).toString('ascii'), 'IHDR');
    assert(png.readUInt32BE(16) > 0 && png.readUInt32BE(20) > 0, 'PNG dimensions are positive');
    await writeFile(join(artifacts, name), png);
  } finally {
    clearTimeout(timeout);
    await window?.dispose();
  }
}

async function verifyProcessingStatus() {
  const before = await session();
  const globalStatus = control('status-processing');
  const localStatus = control('processing-status');
  const progress = (status) => status.locator('[test-id="processing-progress"]');
  const setStage = (stage, step) =>
    request('sessions.pipeline', { sessionId: recordedId, stage, step });
  const assertDisabled = (id, disabled) =>
    waitFor(
      async () => (await control(id).getByRole('button').isDisabled()) === disabled,
      `${id} ${disabled ? 'blocked during processing' : 'available after processing'}`,
    );
  const assertNoAccountHelp = async () => {
    for (const id of [
      'processing-account-diagnostics',
      'processing-account-action',
      'processing-change-assistant',
    ])
      await control(id).waitFor({ state: 'hidden' });
  };
  const openTranscriptMenu = async () => {
    const menu = control('transcript-panel').locator('.transcript-menu');
    if ((await menu.getAttribute('open')) === null) await menu.locator('summary').click();
    return menu;
  };

  await globalStatus.waitFor({ state: 'hidden' });
  await localStatus.waitFor({ state: 'hidden' });
  // These are typed, persisted stage fixtures; no native recognition or inference starts.
  await setStage('transcription', { state: 'running', progress: 37 });
  await globalStatus.waitFor({ state: 'visible' });
  await waitFor(
    async () => (await progress(globalStatus).getAttribute('aria-valuenow')) === '37',
    'confirmed transcription progress in global status',
  );
  assert((await globalStatus.innerText()).includes(before.title));
  for (const tab of ['ring', 'analysis', 'questions']) {
    await control(`tab-${tab}`).click();
    await page.waitForURL((url) => url.hash.includes(`tab=${tab}`));
    await localStatus.waitFor({ state: 'visible' });
    assert.equal(await progress(localStatus).getAttribute('aria-valuenow'), '37');
    if (tab === 'ring') {
      await assertDisabled('analyze-session', true);
      await assertDisabled('transcribe-session', true);
    }
    if (tab === 'analysis') {
      await control('transcript-processing').waitFor({ state: 'visible' });
      assert((await control('transcript-panel').innerText()).includes(before.transcript[0].text));
      const menu = await openTranscriptMenu();
      await assertDisabled('edit-transcript', true);
      await assertDisabled('transcribe-session', true);
      await assertDisabled('analyze-session', true);
      assert.equal(await control('transcript-editor').count(), 0);
      await menu.locator('summary').click();
      await captureDiagnosticImage('transcription-running.png');
    }
  }
  await control('nav-settings').click();
  await control('settings-view').waitFor({ state: 'visible' });
  await globalStatus.waitFor({ state: 'visible' });
  await page.reload();
  await control('settings-view').waitFor({ state: 'visible' });
  await globalStatus.waitFor({ state: 'visible' });
  await waitFor(
    async () => (await progress(globalStatus).getAttribute('aria-valuenow')) === '37',
    'durable processing state after renderer reload on another screen',
  );
  await globalStatus.locator('[test-id="processing-open"]').click();
  await page.waitForURL((url) => url.hash.includes(`session/${recordedId}?tab=processing`));
  await control('session-recovery').waitFor({ state: 'visible' });
  assert.match(await control('processing-title').innerText(), /Transkript/u);
  await assertNoAccountHelp();
  await assertDisabled('retry-processing', true);

  await setStage('transcription', { state: 'running' });
  await waitFor(
    async () => (await progress(globalStatus).getAttribute('aria-valuenow')) === null,
    'unknown transcription progress stays indeterminate',
  );
  await control('tab-analysis').click();
  await localStatus.waitFor({ state: 'visible' });
  assert.equal(await progress(localStatus).getAttribute('aria-valuenow'), null);
  assert.doesNotMatch(await globalStatus.innerText(), /%/u);

  const failure = 'loc.resonanz.error.transcriptionUnavailable';
  await setStage('transcription', { state: 'failed', error: failure });
  await waitFor(
    async () => (await localStatus.innerText()).includes('gewählte Sprache'),
    'actionable system speech failure in the normal session',
  );
  assert.equal((await session()).pipeline.transcription.error, failure);
  assert.doesNotMatch(await localStatus.innerText(), /loc\.resonanz|kAFAssistantErrorDomain/u);
  await waitFor(
    async () => (await globalStatus.innerText()).includes('fehlgeschlagen'),
    'durable failure in global status',
  );
  assert.match(await globalStatus.innerText(), /Transkription.*fehlgeschlagen/u);
  assert.equal(await progress(globalStatus).count(), 0);
  await control('transcript-processing').waitFor({ state: 'visible' });
  await captureDiagnosticImage('transcription-failed.png');
  await localStatus.locator('[test-id="processing-open"]').click();
  await control('session-recovery').waitFor({ state: 'visible' });
  await assertNoAccountHelp();
  await assertDisabled('retry-processing', false);
  await page.reload();
  await control('session-recovery').waitFor({ state: 'visible' });
  await globalStatus.waitFor({ state: 'visible' });
  await assertNoAccountHelp();

  await setStage('transcription', { state: 'done' });
  await globalStatus.waitFor({ state: 'hidden' });
  await control('open-processing-result').waitFor({ state: 'visible' });
  await control('open-processing-result').click();
  await page.waitForURL((url) => url.hash.includes('tab=analysis'));
  await localStatus.waitFor({ state: 'hidden' });
  await control('transcript-processing').waitFor({ state: 'hidden' });
  const menu = await openTranscriptMenu();
  await assertDisabled('edit-transcript', false);
  await assertDisabled('transcribe-session', false);
  await menu.locator('summary').click();
  await assertDisabled('analyze-session', false);

  await setStage('analysis', { state: 'running' });
  await globalStatus.waitFor({ state: 'visible' });
  await waitFor(
    async () => (await globalStatus.innerText()).includes('analysiert'),
    'analysis remains a separate visible stage',
  );
  await control('tab-questions').click();
  await localStatus.waitFor({ state: 'visible' });
  await setStage('analysis', { state: 'done' });
  await globalStatus.waitFor({ state: 'hidden' });
  await localStatus.waitFor({ state: 'hidden' });
  await control('tab-analysis').click();
  const after = await session();
  assert.deepEqual(after.transcript, before.transcript);
  assert.equal(after.audioBytes, before.audioBytes);
  assert.equal(after.audioAvailable, true);
  passed(
    'durable processing UI from typed stage fixtures: global and session progress, navigation/reload, preserved transcript, blocked edits and actionable speech errors without account advice',
  );
}

async function verifyDesktopLayout() {
  const before = await request('bootstrap.get');
  const nativeWindow = await application.browserWindow(page);
  const originalSize = await nativeWindow.evaluate((window) => window.getContentBounds());
  const originalLayout = await page.evaluate(() =>
    Object.fromEntries(
      Object.entries(localStorage).filter(([key]) => key.startsWith('resonanz.layout.')),
    ),
  );
  const collectionIds = [];
  const evidence = [];
  let fixtureId;
  const settle = () =>
    page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
  const resize = async (size) => {
    await nativeWindow.evaluate(
      (window, target) => window.setContentSize(target.width, target.height),
      size,
    );
    await page.waitForFunction(
      ({ width, height }) => innerWidth === width && innerHeight === height,
      size,
    );
    await settle();
  };
  const navigate = async (route, marker, size) => {
    await page.evaluate((hash) => {
      location.hash = hash;
    }, route);
    await control(marker).waitFor({ state: 'visible' });
    // Route presentation adjusts the existing native window. Size it after that IPC work.
    await request('bootstrap.get');
    await resize(size);
  };
  const visibleGeometry = (selector) =>
    page.locator(selector).evaluateAll((elements) =>
      elements
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            tag: element.tagName,
            id: element.getAttribute('test-id') ?? element.className,
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
            clientWidth: element.clientWidth,
            clientHeight: element.clientHeight,
            scrollWidth: element.scrollWidth,
            scrollHeight: element.scrollHeight,
          };
        })
        .filter((item) => item.width > 0 && item.height > 0),
    );
  const assertInside = async (selector, description) => {
    const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    const items = await visibleGeometry(selector);
    assert(items.length > 0, `${description}: visible controls`);
    for (const item of items) {
      assert(
        item.x >= -1 &&
          item.y >= -1 &&
          item.x + item.width <= viewport.width + 1 &&
          item.y + item.height <= viewport.height + 1,
        `${description}: control stays inside native content ${JSON.stringify(item)}`,
      );
    }
  };
  const assertFrame = async (description, extra = '') => {
    const selectors = [
      'html',
      'body',
      'resonanz-shell',
      '.app-shell',
      '.app-body',
      '.workspace',
      '.workspace-outlet',
      '.window-toolbar',
      '.status-bar',
      'mosaik-split[resonanzSplitLayout]',
      extra,
    ]
      .filter(Boolean)
      .join(',');
    const frames = await visibleGeometry(selectors);
    for (const frame of frames) {
      assert(
        frame.scrollWidth <= frame.clientWidth + 1,
        `${description}: frame has no horizontal overflow ${JSON.stringify(frame)}`,
      );
      assert(
        frame.scrollHeight <= frame.clientHeight + 1,
        `${description}: frame does not scroll ${JSON.stringify(frame)}`,
      );
    }
    await assertInside(
      '.status-bar, .window-toolbar-actions > *, .voice-header > mosaik-button, .setup-titlebar',
      description,
    );
    evidence.push({
      description,
      viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
      frames,
    });
  };
  const scrollBody = async (selector, fixed, requireOverflow = true) => {
    const body = page.locator(selector).first();
    const beforeFixed = await visibleGeometry(fixed);
    const range = await body.evaluate((element) => {
      element.scrollTop = 0;
      return {
        height: element.clientHeight,
        vertical: element.scrollHeight - element.clientHeight,
        horizontal: element.scrollWidth - element.clientWidth,
      };
    });
    assert(range.height > 32, `${selector}: content retains usable height`);
    assert(range.horizontal <= 1, `${selector}: content has no horizontal scrollbar`);
    if (requireOverflow)
      assert(range.vertical > 1, `${selector}: long fixture has reachable overflow`);
    await body.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
    });
    await settle();
    if (range.vertical > 1)
      assert(
        await body.evaluate((element) => element.scrollTop > 0),
        `${selector}: content scrolls`,
      );
    const afterFixed = await visibleGeometry(fixed);
    assert.equal(afterFixed.length, beforeFixed.length, `${selector}: chrome stays mounted`);
    for (let index = 0; index < beforeFixed.length; index++) {
      assert(
        Math.abs(beforeFixed[index].y - afterFixed[index].y) <= 1 &&
          Math.abs(beforeFixed[index].height - afterFixed[index].height) <= 1,
        `${selector}: scrolling content preserves fixed controls`,
      );
    }
  };
  const split = (key) => page.locator(`mosaik-split[resonanzSplitLayout="${key}"]`);
  const paneWidths = (key) =>
    split(key).evaluate((element) =>
      ['start', 'end'].map(
        (slot) => element.querySelector(`[slot="${slot}"]`).getBoundingClientRect().width,
      ),
    );
  const splitSeparator = async (key) =>
    split(key).getByRole('separator', {
      name: await split(key).evaluate((element) => element.intl.resizeLabel),
      exact: true,
    });
  const adjustSplit = async (key) => {
    const separator = await splitSeparator(key);
    const initial = await paneWidths(key);
    await separator.press('ArrowRight');
    await waitFor(
      async () => Math.abs((await paneWidths(key))[0] - initial[0]) > 1,
      `${key}: keyboard resizes panels`,
    );
    const keyboard = await paneWidths(key);
    const divider = await separator.boundingBox();
    assert(divider, `${key}: divider has a pointer target`);
    await page.mouse.move(divider.x + divider.width / 2, divider.y + divider.height / 2);
    await page.mouse.down();
    await page.mouse.move(divider.x + divider.width / 2 + 24, divider.y + divider.height / 2, {
      steps: 6,
    });
    await page.mouse.up();
    await waitFor(
      async () => Math.abs((await paneWidths(key))[0] - keyboard[0]) > 1,
      `${key}: pointer resizes panels`,
    );
    const preferred = await paneWidths(key);
    assert(
      preferred.every((width) => width > 100),
      `${key}: both panes remain available`,
    );
    return preferred;
  };
  const assertRestoredSplit = async (key, expected) => {
    await waitFor(async () => {
      const widths = await paneWidths(key);
      return widths.every((width, index) => Math.abs(width - expected[index]) <= 2);
    }, `${key}: user panel size survives remount/reload`);
  };

  try {
    const now = new Date().toISOString();
    const source = await session();
    const paragraph =
      'Controlled layout fixture: a long conversation with decisions, follow-up questions and original transcript passages. '.repeat(
        8,
      );
    const fixture = {
      ...source,
      id: randomUUID(),
      title: `Layout fixture — ${'a long desktop session title '.repeat(7)}`.slice(0, 200),
      createdAt: now,
      updatedAt: now,
      durationMs: 180_000,
      status: 'ready',
      audioBytes: 0,
      audioAvailable: false,
      audioUrl: null,
      nextAudioSequence: 1,
      collectionId: null,
      starred: false,
      tags: [],
      moments: [],
      pauses: [],
      waveform: [],
      summary: Array.from({ length: 18 }, () => paragraph).join('\n\n'),
      transcript: Array.from({ length: 48 }, (_, index) => ({
        id: `layout-segment-${index}`,
        speaker: 'participant',
        text: `${index + 1}. ${paragraph}`,
        startMs: index * 3000,
        endMs: (index + 1) * 3000,
        final: true,
      })),
      messages: [
        { id: randomUUID(), role: 'user', text: paragraph, createdAt: now, state: 'complete' },
        {
          id: randomUUID(),
          role: 'assistant',
          text: paragraph.repeat(8),
          createdAt: now,
          state: 'complete',
        },
      ],
      pipeline: { transcription: { state: 'done' }, analysis: { state: 'done' } },
    };
    delete fixture.analysis;
    delete fixture.insightCounts;
    delete fixture.error;
    const evidenceFor = (index) => {
      const segment = fixture.transcript[index];
      return {
        segmentId: segment.id,
        atMs: segment.startMs,
        endMs: segment.endMs,
        quote: segment.text,
      };
    };
    fixture.analysis = {
      provider: 'Controlled layout fixture',
      createdAt: now,
      summary: Array.from({ length: 18 }, (_, index) => ({
        id: `layout-summary-${index}`,
        text: paragraph,
        evidence: [evidenceFor(index)],
      })),
      decisions: [],
      tasks: [],
      openQuestions: [],
      chapters: Array.from({ length: 6 }, (_, index) => ({
        id: `layout-chapter-${index}`,
        title: `Chapter ${index + 1}: ${'A long chapter title for compact panes '.repeat(6)}`.slice(
          0,
          200,
        ),
        summary: paragraph,
        startMs: index * 30_000,
        endMs: (index + 1) * 30_000,
      })),
    };
    const fixturePath = join(artifacts, 'layout-fixture.json');
    await writeFile(
      fixturePath,
      JSON.stringify({ format: 'resonanz-session', version: 1, session: fixture }),
    );
    fixtureId = (await selectFile(fixturePath)).id;
    for (let index = 0; index < 20; index++) {
      const collection = await request('collections.create', {
        name: `Layout collection ${index + 1} — controlled scroll fixture`,
      });
      collectionIds.push(collection.id);
    }
    const large = { width: 1440, height: 900 };
    const compact = { width: 960, height: 640 };
    const routes = [
      {
        name: 'library',
        route: '#/',
        marker: 'library-view',
        frames: '[test-id="library-view"], .session-list-pane, .session-preview',
        actions: '.filters, .preview-actions, .preview-footer',
      },
      {
        name: 'landscape',
        route: '#/',
        marker: 'library-view',
        frames: '[test-id="library-view"]',
        actions: '.week-navigation',
      },
      {
        name: 'ring',
        route: `#/session/${fixtureId}?tab=ring`,
        marker: 'session-ring-split',
        frames: '[test-id="session-view"], .ring-stage, .ring-sidebar',
      },
      {
        name: 'analysis',
        route: `#/session/${fixtureId}?tab=analysis`,
        marker: 'session-analysis-split',
        frames:
          '[test-id="session-view"], .analysis-pane, .transcript-pane, resonanz-transcript-panel',
        actions: '[test-id="recording-player"]',
      },
      {
        name: 'questions',
        route: `#/session/${fixtureId}?tab=questions`,
        marker: 'session-questions',
        frames: '[test-id="session-view"], .question-pane, .evidence-sidebar',
        actions: '.context-bar, .question-composer',
      },
      {
        name: 'recovery',
        route: `#/session/${fixtureId}?tab=processing`,
        marker: 'session-recovery',
        frames: '[test-id="session-view"], .recovery > main, .recovery > resonanz-transcript-panel',
        actions: '.recovery > main > resonanz-pipeline-steps',
      },
      {
        name: 'settings',
        route: '#/settings',
        marker: 'settings-view',
        frames: '.settings, .settings-sidebar, .settings-main',
        actions:
          '.settings-sidebar > .window-drag-region, [test-id="settings-search"], .settings-sidebar > mosaik-button, .settings-main > header',
      },
      {
        name: 'onboarding',
        route: '#/onboarding',
        marker: 'onboarding-view',
        frames: '.setup, .setup-body, .setup-main, .setup-body > aside',
        actions: '.setup-main > footer, .setup-later',
      },
      {
        name: 'voice',
        route: `#/voice/${fixtureId}`,
        marker: 'voice-view',
        frames: '.voice, .voice-stage',
        actions: '.voice-footer, .voice-controls > *',
      },
    ];

    for (const uiLanguage of ['en', 'de']) {
      for (const appearance of ['light', 'dark']) {
        await request('settings.save', { uiLanguage, appearance });
        await waitFor(
          () =>
            page.evaluate(
              ({ uiLanguage, appearance }) =>
                document.documentElement.lang === uiLanguage &&
                document.documentElement.dataset.appearance === appearance,
              { uiLanguage, appearance },
            ),
          'layout locale and theme applied',
        );
        for (const size of [large, compact]) {
          for (const route of routes) {
            await navigate(route.route, route.marker, size);
            if (route.name === 'library') {
              await control('tab-list').click();
              await control(`session-row-${fixtureId}`).click();
              await control('preview-open').waitFor({ state: 'visible' });
            }
            if (route.name === 'landscape') {
              await control('tab-landscape').click();
              await page.locator('.landscape').waitFor({ state: 'visible' });
            }
            const description = `${route.name}, ${uiLanguage}/${appearance}, ${size.width}x${size.height}`;
            await assertFrame(description, route.frames);
            if (route.actions) await assertInside(route.actions, description);
            if (route.name === 'analysis') {
              await scrollBody(
                '.analysis-content',
                '.section-heading, [test-id="recording-player"]',
              );
              await scrollBody(
                'resonanz-transcript-panel .body',
                'resonanz-transcript-panel > header, resonanz-transcript-panel > .search',
              );
            }
            if (route.name === 'ring') {
              await page.locator('.chapter-list button').first().click();
              await scrollBody('.ring-details', '.digest-card, .section-heading, .ring-tools');
            }
            if (route.name === 'questions')
              await scrollBody('[test-id="question-messages"]', '.context-bar, .question-composer');
            if (route.name === 'library') {
              await scrollBody('[test-id="preview-content"]', '.preview-actions, .preview-footer');
              await scrollBody(
                '[test-id="sidebar-collections"]',
                '.sidebar > .window-drag-region, .sidebar > .brand, .primary-nav, .assistant-card',
              );
            }
            if (route.name === 'settings')
              await scrollBody(
                '[test-id="settings-content"]',
                '.settings-sidebar > .window-drag-region, [test-id="settings-search"], .settings-sidebar > mosaik-button, .settings-main > header',
              );
            if (route.name === 'landscape')
              await scrollBody('.landscape', '.window-toolbar', false);
            if (route.name === 'voice') {
              const boxes = await page.locator('.voice-stage').evaluate((stage) => {
                const ring = stage.querySelector('.voice-ring').getBoundingClientRect();
                const area = stage.getBoundingClientRect();
                return {
                  ring: { x: ring.x, y: ring.y, right: ring.right, bottom: ring.bottom },
                  area: { x: area.x, y: area.y, right: area.right, bottom: area.bottom },
                };
              });
              assert(
                boxes.ring.x >= boxes.area.x - 1 &&
                  boxes.ring.y >= boxes.area.y - 1 &&
                  boxes.ring.right <= boxes.area.right + 1 &&
                  boxes.ring.bottom <= boxes.area.bottom + 1,
                `${description}: ring fits actual stage`,
              );
            }
            if (
              (uiLanguage === 'en' && appearance === 'light' && size === large) ||
              (uiLanguage === 'de' && appearance === 'dark' && size === compact)
            ) {
              await captureDiagnosticImage(
                `layout-${route.name}-${uiLanguage}-${appearance}-${size.width}x${size.height}.png`,
              );
            }
          }
        }
      }
    }

    await navigate('#/', 'library-view', large);
    await control(`session-row-${fixtureId}`).click();
    await adjustSplit('workspace-navigation');
    await adjustSplit('library-preview');
    // Wide windows can still have narrow lists after dragging both adjacent panes.
    await (await splitSeparator('workspace-navigation')).press('End');
    await (await splitSeparator('library-preview')).press('Home');
    await control(`session-row-${fixtureId}`).hover();
    const rowTitle = control(`session-row-${fixtureId}`).locator('.row-text');
    assert((await rowTitle.boundingBox()).width > 80, 'Narrow list retains readable title space');
    await assertInside(`[test-id="star-${fixtureId}"]`, 'Narrow list favourite action');
    await assertFrame('Narrow list at wide window', '.session-list-pane, .session-preview');
    // Continue restoration checks with the newly chosen legal limits.
    const boundedNavigation = await paneWidths('workspace-navigation');
    const boundedPreview = await paneWidths('library-preview');
    await navigate(`#/session/${fixtureId}?tab=ring`, 'session-ring-split', large);
    await navigate('#/', 'library-view', large);
    await control(`session-row-${fixtureId}`).click();
    await assertRestoredSplit('workspace-navigation', boundedNavigation);
    await assertRestoredSplit('library-preview', boundedPreview);
    await page.reload();
    await control('library-view').waitFor({ state: 'visible' });
    await resize(large);
    await control(`session-row-${fixtureId}`).click();
    await assertRestoredSplit('workspace-navigation', boundedNavigation);
    await assertRestoredSplit('library-preview', boundedPreview);
    for (const [tab, key, marker] of [
      ['ring', 'session-ring', 'session-ring-split'],
      ['analysis', 'session-analysis', 'session-analysis-split'],
      ['questions', 'session-questions', 'session-questions'],
      ['processing', 'session-recovery', 'session-recovery'],
    ]) {
      const route = `#/session/${fixtureId}?tab=${tab}`;
      await navigate(route, marker, large);
      const preferred = await adjustSplit(key);
      await navigate('#/', 'library-view', large);
      await navigate(route, marker, large);
      await assertRestoredSplit(key, preferred);
      await page.reload();
      await control(marker).waitFor({ state: 'visible' });
      await resize(large);
      await assertRestoredSplit(key, preferred);
      await resize(compact);
      assert(
        (await paneWidths(key)).every((width) => width >= 200),
        `${key}: compact resize preserves both panes`,
      );
      await assertFrame(`${key}: compact after stored resize`);
      if (key === 'session-analysis') {
        await page.evaluate((pane) => {
          localStorage.setItem(`resonanz.layout.${pane}.pixels`, '5000');
        }, key);
        await page.reload();
        await control(marker).waitFor({ state: 'visible' });
        await resize(compact);
        assert(
          (await paneWidths(key)).every((width) => width >= 200),
          'A preference larger than the compact window cannot collapse either pane',
        );
        await assertFrame('Compact restoration of oversized pane preference');
      }
    }

    await navigate('#/onboarding', 'onboarding-view', compact);
    for (let step = 0; step < 3; step++) {
      await assertInside(
        '.setup-main > footer, [test-id="onboarding-next"]',
        `onboarding step ${step + 1}`,
      );
      await scrollBody(
        '[test-id="onboarding-content"]',
        '.setup-titlebar, .setup-main > footer',
        false,
      );
      if (step < 2) {
        const previous = await control('onboarding-content').innerText();
        await control('onboarding-next').click();
        await waitFor(
          async () => (await control('onboarding-content').innerText()) !== previous,
          `onboarding step ${step + 2}`,
        );
      }
    }
    await navigate(`#/session/${fixtureId}?tab=ring`, 'session-ring-split', compact);
    await menuAction('delete-session');
    await control('delete-session-content').waitFor({ state: 'visible' });
    const modalBounds = await page.locator('resonanz-delete-dialog').boundingBox();
    assert.equal(modalBounds.x, 0, 'Session modal covers navigation as well as the workspace');
    assert.equal(modalBounds.width, compact.width, 'Session modal covers the native window width');
    await assertInside('resonanz-delete-dialog footer > *', 'long-title deletion dialog actions');
    await scrollBody('[test-id="delete-session-content"]', 'resonanz-delete-dialog footer', false);
    await captureDiagnosticImage('layout-delete-dialog.png');
    await page.keyboard.press('Escape');
    await control('delete-session-content').waitFor({ state: 'hidden' });
    await navigate('#/settings', 'settings-view', compact);
    await control('clear-library').click();
    await control('confirmation-content').waitFor({ state: 'visible' });
    await assertInside('resonanz-confirmation-dialog footer > *', 'confirmation dialog actions');
    await scrollBody(
      '[test-id="confirmation-content"]',
      'resonanz-confirmation-dialog footer',
      false,
    );
    await captureDiagnosticImage('layout-confirmation-dialog.png');
    await control('cancel-confirmation').click();
    await control('confirmation-content').waitFor({ state: 'hidden' });
    await writeFile(
      join(artifacts, 'layout-evidence.json'),
      `${JSON.stringify(evidence, null, 2)}\n`,
    );
    passed(
      'native desktop layout: 1440x900/960x640, English/German, light/dark, fixed chrome/actions, isolated content scrolling, six keyboard/pointer splitters with remount/reload persistence, setup steps and dialogs',
    );
  } catch (error) {
    await captureDiagnosticImage('layout-failure.png').catch(() => undefined);
    await writeFile(join(artifacts, 'layout-evidence.json'), JSON.stringify(evidence, null, 2));
    throw error;
  } finally {
    await request('settings.save', {
      uiLanguage: before.settings.uiLanguage ?? 'en',
      appearance: before.settings.appearance ?? 'system',
    });
    if (fixtureId) await request('sessions.delete', { sessionId: fixtureId });
    for (const collectionId of collectionIds) await request('collections.delete', { collectionId });
    await page.evaluate((saved) => {
      for (const key of Object.keys(localStorage))
        if (key.startsWith('resonanz.layout.')) localStorage.removeItem(key);
      for (const [key, value] of Object.entries(saved)) localStorage.setItem(key, value);
    }, originalLayout);
    await navigate(`#/session/${recordedId}?tab=analysis`, 'session-analysis-split', originalSize);
    await page.reload();
    await control('session-analysis-split').waitFor({ state: 'visible' });
    await resize(originalSize);
    await nativeWindow.dispose();
  }
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
    'provenance-verified recorder/worklet/player: synthetic capture, pause, resume, final flush and ranged playback',
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
  await verifyProcessingStatus();
  await verifyDesktopLayout();
  await captureDiagnosticImage('session.png');
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
      'unchanged upstream TTS: actual system voice, pause, resume and stop with explicit manual fixture',
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
      'processing UI uses typed persisted stage fixtures without native transcription',
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
  if (page && !page.isClosed()) await captureDiagnosticImage('failure.png').catch(() => undefined);
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
