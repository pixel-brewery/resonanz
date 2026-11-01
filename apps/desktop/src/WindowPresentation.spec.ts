import type { Rectangle } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { WindowPresentation } from './WindowPresentation.js';

type PresentationWindow = Parameters<WindowPresentation['present']>[0];
interface IFrame {
  readonly width: number;
  readonly height: number;
}

const LARGE_AREA: Rectangle = { x: 0, y: 0, width: 2560, height: 1800 };
const FRAME: IFrame = { width: 16, height: 38 };

/** Structural native geometry only: no Electron, renderer, media or operating-system process runs. */
function scope(platform = 'darwin', frame: IFrame = FRAME) {
  let area = { ...LARGE_AREA };
  let bounds: Rectangle = { x: 300, y: 300, width: 1440 + frame.width, height: 900 + frame.height };
  let normal = { ...bounds };
  let fullscreenNormal = { ...bounds };
  let maximized = false;
  let fullscreen = false;
  const renderer = { reload: vi.fn(), loadFile: vi.fn(), loadURL: vi.fn() };
  const applyBounds = (value: Rectangle): void => {
    bounds = { ...value };
    if (!maximized && !fullscreen) normal = { ...bounds };
  };
  const window = {
    getBounds: vi.fn(() => ({ ...bounds })),
    getContentBounds: vi.fn(() => ({
      x: bounds.x + frame.width / 2,
      y: bounds.y + frame.height,
      width: bounds.width - frame.width,
      height: bounds.height - frame.height,
    })),
    getNormalBounds: vi.fn(() => ({ ...normal })),
    isMaximized: vi.fn(() => maximized),
    isFullScreen: vi.fn(() => fullscreen),
    maximize: vi.fn(() => {
      if (!maximized) normal = { ...bounds };
      maximized = true;
      bounds = { ...area };
    }),
    unmaximize: vi.fn(() => {
      maximized = false;
      bounds = { ...normal };
    }),
    setBounds: vi.fn((value: Partial<Rectangle>) => applyBounds({ ...bounds, ...value })),
    setContentSize: vi.fn((width: number, height: number) =>
      applyBounds({ ...bounds, width: width + frame.width, height: height + frame.height }),
    ),
    setMinimumSize: vi.fn(),
    setPosition: vi.fn((x: number, y: number) => applyBounds({ ...bounds, x, y })),
    setResizable: vi.fn(),
    setWindowButtonVisibility: vi.fn(),
    webContents: renderer,
    close: vi.fn(),
    destroy: vi.fn(),
    show: vi.fn(),
    hide: vi.fn(),
    focus: vi.fn(),
  } satisfies PresentationWindow & {
    readonly webContents: typeof renderer;
    readonly close: () => void;
    readonly destroy: () => void;
    readonly show: () => void;
    readonly hide: () => void;
    readonly focus: () => void;
  };
  const workArea = vi.fn((_current: Rectangle) => ({ ...area }));
  const presentation = new WindowPresentation(workArea, platform);
  const geometry = [
    window.setBounds,
    window.setContentSize,
    window.setMinimumSize,
    window.setPosition,
    window.setResizable,
    window.setWindowButtonVisibility,
    window.maximize,
    window.unmaximize,
  ];
  return {
    window,
    renderer,
    presentation,
    workArea,
    resize: (value: Rectangle) => applyBounds(value),
    setArea: (value: Rectangle) => {
      area = { ...value };
    },
    setFullscreen: (enabled: boolean) => {
      if (enabled && !fullscreen) {
        fullscreenNormal = { ...bounds };
        bounds = { ...area };
      }
      if (!enabled && fullscreen) bounds = { ...fullscreenNormal };
      fullscreen = enabled;
    },
    clearGeometry: () => geometry.forEach((method) => method.mockClear()),
    expectNoGeometry: () => geometry.forEach((method) => expect(method).not.toHaveBeenCalled()),
  };
}

function expectInside(bounds: Rectangle, area: Rectangle, margin: number): void {
  expect(bounds.width).toBeGreaterThan(0);
  expect(bounds.height).toBeGreaterThan(0);
  expect(bounds.x).toBeGreaterThanOrEqual(area.x + margin);
  expect(bounds.y).toBeGreaterThanOrEqual(area.y + margin);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(area.x + area.width - margin);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(area.y + area.height - margin);
}

describe('WindowPresentation route geometry', () => {
  it.each([
    ['onboarding', 1000, 720],
    ['settings', 1000, 1180],
  ] as const)(
    'presents %s with its content dimensions and preserves the window centre when it fits',
    (surface, width, height) => {
      const test = scope();
      const previous = test.window.getBounds();

      test.presentation.present(test.window, surface);

      const bounds = test.window.getBounds();
      expect(test.window.getContentBounds()).toMatchObject({ width, height });
      expect(bounds.x + bounds.width / 2).toBe(previous.x + previous.width / 2);
      expect(bounds.y + bounds.height / 2).toBe(previous.y + previous.height / 2);
      expect(test.window.setMinimumSize).toHaveBeenCalledWith(976, 678);
      expect(test.window.setResizable).toHaveBeenCalledWith(true);
      expect(test.window.setWindowButtonVisibility).toHaveBeenCalledWith(true);
    },
  );

  it('restores the 1440-by-900 workspace content initially supplied by Main', () => {
    const test = scope();
    const initial = test.window.getBounds();
    test.presentation.present(test.window, 'onboarding');
    test.presentation.present(test.window, 'settings');

    test.presentation.present(test.window, 'workspace');

    expect(test.window.getContentBounds()).toMatchObject({ width: 1440, height: 900 });
    expect(test.window.getBounds()).toEqual(initial);
  });

  it.each([
    {
      frame: FRAME,
      area: { x: 1920, y: 40, width: 1024, height: 768 },
      content: { width: 976, height: 698 },
      minimum: [976, 678],
    },
    {
      frame: FRAME,
      area: { x: -900, y: 30, width: 900, height: 620 },
      content: { width: 852, height: 550 },
      minimum: [868, 588],
    },
    {
      frame: { width: 0, height: 0 },
      area: { x: 0, y: 24, width: 1440, height: 900 },
      content: { width: 1000, height: 868 },
      minimum: [960, 640],
    },
  ])(
    'keeps the tall settings surface and its minimum size within work area $area.width by $area.height',
    ({ frame, area, content, minimum }) => {
      const test = scope('darwin', frame);
      test.setArea(area);

      test.presentation.present(test.window, 'settings');

      expect(test.window.getContentBounds()).toMatchObject(content);
      expect(test.window.setMinimumSize).toHaveBeenCalledWith(...minimum);
      expectInside(test.window.getBounds(), area, 16);
    },
  );

  it('remembers each independently resized surface without reloading or replacing its renderer', () => {
    const test = scope();
    const workspace: Rectangle = { x: 120, y: 80, width: 1330, height: 820 };
    const onboarding: Rectangle = { x: 300, y: 170, width: 1100, height: 800 };
    const settings: Rectangle = { x: 800, y: 260, width: 1050, height: 1240 };
    test.resize(workspace);
    test.presentation.present(test.window, 'onboarding');
    test.resize(onboarding);
    test.presentation.present(test.window, 'settings');
    test.resize(settings);

    for (const [surface, expected] of [
      ['workspace', workspace],
      ['onboarding', onboarding],
      ['settings', settings],
    ] as const) {
      test.presentation.present(test.window, surface);
      expect(test.window.getBounds()).toEqual(expected);
    }

    expect(test.window.webContents).toBe(test.renderer);
    expect(test.renderer.reload).not.toHaveBeenCalled();
    expect(test.renderer.loadFile).not.toHaveBeenCalled();
    expect(test.renderer.loadURL).not.toHaveBeenCalled();
    expect(test.window.close).not.toHaveBeenCalled();
    expect(test.window.destroy).not.toHaveBeenCalled();
    expect(test.window.show).not.toHaveBeenCalled();
    expect(test.window.hide).not.toHaveBeenCalled();
    expect(test.window.focus).not.toHaveBeenCalled();
  });

  it('remembers maximization and normal bounds separately for each surface', () => {
    const test = scope();
    const workspace = test.window.getBounds();
    test.window.maximize();
    test.presentation.present(test.window, 'onboarding');
    expect(test.window.isMaximized()).toBe(false);
    const onboarding: Rectangle = { x: 400, y: 180, width: 1150, height: 850 };
    test.resize(onboarding);
    test.window.maximize();
    test.presentation.present(test.window, 'settings');
    const settings = test.window.getBounds();

    test.presentation.present(test.window, 'workspace');
    expect(test.window.isMaximized()).toBe(true);
    expect(test.window.getNormalBounds()).toEqual(workspace);
    test.presentation.present(test.window, 'onboarding');
    expect(test.window.isMaximized()).toBe(true);
    expect(test.window.getNormalBounds()).toEqual(onboarding);
    test.presentation.present(test.window, 'settings');
    expect(test.window.isMaximized()).toBe(false);
    expect(test.window.getBounds()).toEqual(settings);
  });

  it('preserves a resized or maximized surface when the same route presents again', () => {
    const test = scope();
    test.presentation.present(test.window, 'settings');
    test.resize({ x: 280, y: 120, width: 1200, height: 1300 });
    test.window.maximize();
    const bounds = test.window.getBounds();
    test.clearGeometry();

    test.presentation.present(test.window, 'settings');

    test.expectNoGeometry();
    expect(test.window.getBounds()).toEqual(bounds);
    expect(test.window.isMaximized()).toBe(true);
  });

  it('defers fullscreen route requests and applies only the latest surface after leaving fullscreen', () => {
    const test = scope();
    test.setFullscreen(true);
    const fullscreen = test.window.getBounds();
    test.clearGeometry();

    test.presentation.present(test.window, 'settings');
    test.presentation.present(test.window, 'onboarding');

    test.expectNoGeometry();
    expect(test.window.getBounds()).toEqual(fullscreen);
    expect(test.presentation.requested).toBe('onboarding');
    test.setFullscreen(false);
    test.presentation.present(test.window, test.presentation.requested);
    expect(test.window.getContentBounds()).toMatchObject({ width: 1000, height: 720 });
  });

  it('refits saved bounds when the available display area shrinks', () => {
    const test = scope();
    test.presentation.present(test.window, 'settings');
    test.resize({ x: 1700, y: 400, width: 1016, height: 1218 });
    test.presentation.present(test.window, 'workspace');
    const area: Rectangle = { x: 0, y: 24, width: 1280, height: 696 };
    test.setArea(area);

    test.presentation.present(test.window, 'settings');

    expectInside(test.window.getBounds(), area, 16);
    expect(test.window.getBounds().height).toBe(664);
  });
});

describe('WindowPresentation tray ownership', () => {
  it.each(['darwin', 'win32'])(
    'uses an actual 368-pixel content width on %s and anchors within its work area',
    (platform) => {
      const test = scope(platform);
      const anchor =
        platform === 'darwin'
          ? { x: 4, y: 0, width: 24, height: 24 }
          : { x: 2520, y: 1776, width: 24, height: 24 };

      test.presentation.tray(test.window, anchor, LARGE_AREA);

      expect(test.window.getContentBounds()).toMatchObject({ width: 368, height: 660 });
      expect(test.window.getBounds()).toMatchObject({ width: 384, height: 698 });
      expectInside(test.window.getBounds(), LARGE_AREA, 8);
      expect(test.window.setMinimumSize).toHaveBeenCalledWith(1, 1);
      expect(test.window.setResizable).toHaveBeenCalledWith(false);
      if (platform === 'darwin')
        expect(test.window.setWindowButtonVisibility).toHaveBeenCalledWith(false);
      else expect(test.window.setWindowButtonVisibility).not.toHaveBeenCalled();
    },
  );

  it('reduces tray content for a constrained secondary display including the native frame', () => {
    const test = scope();
    const area: Rectangle = { x: -1280, y: 40, width: 360, height: 540 };

    test.presentation.tray(test.window, { x: -1278, y: 40, width: 24, height: 24 }, area);

    expect(test.window.getContentBounds()).toMatchObject({ width: 328, height: 478 });
    expectInside(test.window.getBounds(), area, 8);
  });

  it.each(['darwin', 'win32'])(
    'resizes measured tray content on %s around the same native anchor',
    (platform) => {
      const test = scope(platform);
      const anchor =
        platform === 'darwin'
          ? { x: 1200, y: 0, width: 24, height: 24 }
          : { x: 1200, y: 1776, width: 24, height: 24 };
      test.presentation.tray(test.window, anchor, LARGE_AREA);

      test.presentation.resizeTray(test.window, 312);

      const bounds = test.window.getBounds();
      expect(test.window.getContentBounds()).toMatchObject({ width: 368, height: 312 });
      expect(bounds.x + bounds.width / 2).toBe(anchor.x + anchor.width / 2);
      if (platform === 'darwin') expect(bounds.y).toBe(anchor.y + anchor.height + 6);
      else expect(bounds.y + bounds.height).toBe(anchor.y - 8);
      expect(test.presentation.traySizingActive).toBe(true);
      expectInside(bounds, LARGE_AREA, 8);
      expect(test.renderer.reload).not.toHaveBeenCalled();
      expect(test.window.show).not.toHaveBeenCalled();
    },
  );

  it('clamps tall content to the anchor display, then grows again when that display has room', () => {
    const test = scope('win32');
    const small: Rectangle = { x: -1280, y: 40, width: 360, height: 540 };
    test.setArea(small);
    test.presentation.tray(test.window, { x: -1100, y: 580, width: 24, height: 24 }, small);

    test.presentation.resizeTray(test.window, 1200);

    expect(test.window.getContentBounds()).toMatchObject({ width: 328, height: 478 });
    expectInside(test.window.getBounds(), small, 8);
    test.setArea({ x: -1280, y: 40, width: 1280, height: 1600 });
    test.presentation.resizeTray(test.window, 1200);
    expect(test.window.getContentBounds()).toMatchObject({ width: 368, height: 1200 });
    expectInside(test.window.getBounds(), { x: -1280, y: 40, width: 1280, height: 1600 }, 8);
  });

  it('coalesces identical geometry and refuses invalid measurements without replacing the last height', () => {
    const test = scope();
    test.presentation.tray(test.window, { x: 1200, y: 0, width: 24, height: 24 }, LARGE_AREA);
    test.presentation.resizeTray(test.window, 416);
    const bounds = test.window.getBounds();
    test.clearGeometry();

    for (const height of [416, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 4097])
      test.presentation.resizeTray(test.window, height);

    test.expectNoGeometry();
    expect(test.window.getBounds()).toEqual(bounds);
  });

  it('rejects late hidden/restored measurements and never stores compact bounds over the workspace', () => {
    const test = scope();
    const workspace: Rectangle = { x: 260, y: 120, width: 1300, height: 820 };
    test.resize(workspace);
    test.clearGeometry();
    test.presentation.resizeTray(test.window, 440);
    test.expectNoGeometry();
    test.presentation.tray(test.window, { x: 1200, y: 0, width: 24, height: 24 }, LARGE_AREA);
    test.presentation.resizeTray(test.window, 440);
    const tray = test.window.getBounds();
    test.presentation.hideTray();
    test.clearGeometry();

    test.presentation.resizeTray(test.window, 780);

    test.expectNoGeometry();
    expect(test.window.getBounds()).toEqual(tray);
    expect(test.presentation.traySizingActive).toBe(false);
    test.presentation.tray(test.window, { x: 1500, y: 0, width: 24, height: 24 }, LARGE_AREA);
    expect(test.presentation.traySizingActive).toBe(true);
    test.presentation.resizeTray(test.window, 780);
    test.presentation.restore(test.window);
    expect(test.window.getBounds()).toEqual(workspace);
    test.clearGeometry();
    test.presentation.resizeTray(test.window, 1000);
    test.expectNoGeometry();
  });

  it('rejects measurements during fullscreen and after presentation reset', () => {
    const test = scope();
    test.presentation.tray(test.window, { x: 1200, y: 0, width: 24, height: 24 }, LARGE_AREA);
    test.setFullscreen(true);
    test.clearGeometry();
    test.presentation.resizeTray(test.window, 250);
    test.expectNoGeometry();
    test.setFullscreen(false);
    test.presentation.reset();
    test.clearGeometry();
    test.presentation.resizeTray(test.window, 250);
    test.expectNoGeometry();
    expect(test.presentation.traySizingActive).toBe(false);
  });

  it('restores the pre-tray maximized surface after repeated tray positioning without saving compact bounds over it', () => {
    const test = scope();
    test.presentation.present(test.window, 'settings');
    const normal: Rectangle = { x: 460, y: 100, width: 1150, height: 1350 };
    test.resize(normal);
    test.window.maximize();
    test.presentation.tray(test.window, { x: 20, y: 0, width: 24, height: 24 }, LARGE_AREA);
    test.presentation.tray(test.window, { x: 1800, y: 0, width: 24, height: 24 }, LARGE_AREA);

    test.presentation.restore(test.window);

    expect(test.window.isMaximized()).toBe(true);
    expect(test.window.getNormalBounds()).toEqual(normal);
    expect(test.window.setResizable).toHaveBeenLastCalledWith(true);
    expect(test.window.setWindowButtonVisibility).toHaveBeenLastCalledWith(true);
    test.clearGeometry();
    test.presentation.restore(test.window);
    test.expectNoGeometry();
  });

  it('keeps tray geometry while routes change and applies the latest requested route when restoring', () => {
    const test = scope();
    test.presentation.tray(test.window, { x: 20, y: 0, width: 24, height: 24 }, LARGE_AREA);
    const tray = test.window.getBounds();
    test.clearGeometry();

    test.presentation.present(test.window, 'onboarding');
    test.presentation.present(test.window, 'settings');

    test.expectNoGeometry();
    expect(test.window.getBounds()).toEqual(tray);
    expect(test.presentation.requested).toBe('settings');
    test.presentation.restore(test.window);
    expect(test.window.getContentBounds()).toMatchObject({ width: 1000, height: 1180 });
    expectInside(test.window.getBounds(), LARGE_AREA, 16);
  });

  it('does not compact or restore over a fullscreen window', () => {
    const test = scope();
    test.setFullscreen(true);
    const fullscreen = test.window.getBounds();
    test.clearGeometry();

    test.presentation.tray(test.window, { x: 20, y: 0, width: 24, height: 24 }, LARGE_AREA);
    test.presentation.restore(test.window);

    test.expectNoGeometry();
    expect(test.window.getBounds()).toEqual(fullscreen);
    expect(test.window.isFullScreen()).toBe(true);
  });

  it('defers restoration when fullscreen starts from tray and restores the pending surface after fullscreen leaves', () => {
    const test = scope();
    test.presentation.tray(test.window, { x: 20, y: 0, width: 24, height: 24 }, LARGE_AREA);
    test.setFullscreen(true);
    const fullscreen = test.window.getBounds();
    test.clearGeometry();

    test.presentation.present(test.window, 'settings');
    test.presentation.restore(test.window);

    test.expectNoGeometry();
    expect(test.window.getBounds()).toEqual(fullscreen);
    expect(test.presentation.requested).toBe('settings');
    test.setFullscreen(false);
    test.presentation.restore(test.window);
    expect(test.window.getContentBounds()).toMatchObject({ width: 1000, height: 1180 });
    expectInside(test.window.getBounds(), LARGE_AREA, 16);
    expect(test.window.setResizable).toHaveBeenLastCalledWith(true);
    expect(test.window.setWindowButtonVisibility).toHaveBeenLastCalledWith(true);
    test.clearGeometry();
    test.presentation.present(test.window, test.presentation.requested);
    test.expectNoGeometry();
  });

  it('resets presentation history for a replacement window without applying stale tray or route bounds', () => {
    const first = scope();
    first.presentation.present(first.window, 'settings');
    first.resize({ x: 70, y: 80, width: 1300, height: 1350 });
    first.presentation.tray(first.window, { x: 20, y: 0, width: 24, height: 24 }, LARGE_AREA);
    const next = scope();

    first.presentation.reset();
    first.presentation.restore(next.window);
    next.expectNoGeometry();
    expect(first.presentation.requested).toBe('workspace');
    first.presentation.present(next.window, 'onboarding');
    expect(next.window.getContentBounds()).toMatchObject({ width: 1000, height: 720 });
    first.presentation.present(next.window, 'settings');
    expect(next.window.getContentBounds()).toMatchObject({ width: 1000, height: 1180 });
  });
});
