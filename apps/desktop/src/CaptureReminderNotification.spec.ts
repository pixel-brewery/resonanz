import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  initialMiniRecorderSnapshot,
  type IMiniRecorderSnapshot,
  type RequestPayload,
} from '@resonanz/contracts';
import {
  CaptureReminderNotification,
  type ICaptureReminderNotice,
  type ICaptureReminderNotificationDependencies,
} from './CaptureReminderNotification.js';

class FakeNotice extends EventEmitter implements ICaptureReminderNotice {
  public closed = false;
  public readonly show = vi.fn();
  public readonly close = vi.fn(() => {
    this.closed = true;
    this.emit('close', { reason: 'applicationHidden' });
  });
}

function createScope() {
  let current: IMiniRecorderSnapshot = {
    ...initialMiniRecorderSnapshot,
    active: true,
    sessionId: crypto.randomUUID(),
  };
  const notices: FakeNotice[] = [];
  const create = vi.fn(
    (
      _options: Parameters<ICaptureReminderNotificationDependencies['create']>[0],
    ): ICaptureReminderNotice | null => {
      const notice = new FakeNotice();
      notices.push(notice);
      return notice;
    },
  );
  const dependencies: ICaptureReminderNotificationDependencies = {
    current: () => current,
    create,
    open: vi.fn(),
    command: vi.fn(),
    text: (key) => key,
    failed: vi.fn(),
  };
  const owner = new CaptureReminderNotification(dependencies);
  const input = (
    visible = true,
    reminderId = crypto.randomUUID(),
  ): RequestPayload<'capture.reminder'> => ({ sessionId: current.sessionId!, reminderId, visible });
  return {
    owner,
    notices,
    create,
    dependencies,
    input,
    change: (changes: Partial<IMiniRecorderSnapshot>) => {
      current = { ...current, ...changes };
    },
    sync: () => owner.sync(current),
  };
}

describe('CaptureReminderNotification', () => {
  it('delivers once per identity and never resurrects dismissed or cleared reminders', () => {
    const scope = createScope();
    const first = scope.input();
    scope.owner.update(first);
    expect(scope.notices[0]?.show).toHaveBeenCalledOnce();
    scope.notices[0]?.emit('close', { reason: 'userCanceled' });
    scope.owner.update(first);
    scope.notices[0]?.emit('click');
    expect(scope.create).toHaveBeenCalledOnce();
    expect(scope.dependencies.open).not.toHaveBeenCalled();
    const second = scope.input();
    scope.owner.update(second);
    expect(scope.notices[0]?.close).toHaveBeenCalledOnce();
    scope.owner.update({ ...first, visible: false });
    expect(scope.notices[1]?.close).not.toHaveBeenCalled();
    scope.owner.update({ ...second, visible: false });
    scope.owner.update(second);
    expect(scope.create).toHaveBeenCalledTimes(2);
    expect(scope.notices[1]?.close).toHaveBeenCalledOnce();
    scope.notices[0]?.emit('action', { actionIndex: 1 });
    scope.notices[1]?.emit('action', { actionIndex: 1 });
    expect(scope.dependencies.command).not.toHaveBeenCalled();
  });

  it('tombstones a hide received before a delayed show without closing another identity', () => {
    const scope = createScope();
    const shown = scope.input();
    scope.owner.update(shown);
    const delayed = scope.input();
    scope.owner.update({ ...delayed, visible: false });
    scope.owner.update(delayed);
    expect(scope.create).toHaveBeenCalledOnce();
    expect(scope.notices[0]?.close).not.toHaveBeenCalled();
    const whilePaused = scope.input();
    scope.change({ paused: true });
    scope.owner.update({ ...whilePaused, visible: false });
    scope.change({ paused: false });
    scope.owner.update(whilePaused);
    expect(scope.create).toHaveBeenCalledOnce();
  });

  it('only opens the existing tray on click and dispatches guarded explicit native actions', async () => {
    const scope = createScope();
    const first = scope.input();
    scope.owner.update(first);
    scope.notices[0]?.emit('click');
    expect(scope.dependencies.open).toHaveBeenCalledOnce();
    expect(scope.dependencies.command).not.toHaveBeenCalled();
    scope.notices[0]?.emit('action', { actionIndex: 1 });
    expect(scope.dependencies.command).not.toHaveBeenCalled();
    const second = scope.input();
    scope.owner.update(second);
    scope.notices[1]?.emit('action', { actionIndex: 0 }, 1);
    expect(scope.dependencies.command).toHaveBeenLastCalledWith(second.sessionId, 'continue');
    const third = scope.input();
    scope.owner.update(third);
    scope.notices[2]?.emit('action', {}, 1);
    expect(scope.dependencies.command).toHaveBeenLastCalledWith(third.sessionId, 'stop');
    expect(scope.dependencies.command).toHaveBeenCalledTimes(2);
    await Promise.resolve();
  });

  it('keeps a timed-out Action Center notice guarded and reusable without redelivery', () => {
    const scope = createScope();
    const input = scope.input();
    scope.owner.update(input);
    scope.notices[0]?.emit('close', { reason: 'timedOut' });
    scope.owner.update(input);
    expect(scope.create).toHaveBeenCalledOnce();
    scope.notices[0]?.emit('click');
    expect(scope.dependencies.open).toHaveBeenCalledOnce();
    expect(scope.notices[0]?.close).toHaveBeenCalledOnce();
  });

  it('rejects late callbacks after pause, busy state, capture change or reset', () => {
    const scope = createScope();
    const first = scope.input();
    scope.owner.update(first);
    scope.change({ busy: true });
    scope.notices[0]?.emit('action', { actionIndex: 1 });
    scope.notices[0]?.emit('click');
    expect(scope.dependencies.command).not.toHaveBeenCalled();
    expect(scope.dependencies.open).not.toHaveBeenCalled();
    scope.change({ busy: false, paused: true });
    scope.sync();
    expect(scope.notices[0]?.close).toHaveBeenCalledOnce();
    scope.change({ paused: false });
    scope.owner.update(first);
    expect(scope.create).toHaveBeenCalledOnce();
    scope.change({ sessionId: crypto.randomUUID() });
    scope.sync();
    const next = scope.input();
    scope.owner.update(next);
    scope.notices[0]?.emit('click');
    scope.notices[0]?.emit('failed');
    expect(scope.dependencies.open).not.toHaveBeenCalled();
    expect(scope.dependencies.failed).not.toHaveBeenCalled();
    scope.owner.reset();
    scope.notices[1]?.emit('action', { actionIndex: 1 });
    scope.owner.update(next);
    expect(scope.dependencies.command).not.toHaveBeenCalled();
    expect(scope.create).toHaveBeenCalledTimes(2);
  });

  it('reports actual delivery failure once while unsupported/headless delivery remains a valid absence', () => {
    const scope = createScope();
    scope.create.mockReturnValueOnce(null);
    const hidden = scope.input();
    scope.owner.update(hidden);
    scope.owner.update(hidden);
    expect(scope.create).toHaveBeenCalledOnce();
    expect(scope.dependencies.failed).not.toHaveBeenCalled();
    const failed = scope.input();
    scope.owner.update(failed);
    scope.notices[0]?.emit('failed', {}, 'provider-private detail');
    scope.notices[0]?.emit('failed');
    scope.owner.update(failed);
    expect(scope.dependencies.failed).toHaveBeenCalledOnce();
    expect(scope.dependencies.failed).toHaveBeenCalledWith(failed.sessionId);
    const throwing = scope.input();
    scope.create.mockImplementationOnce(() => {
      throw new Error('native-private detail');
    });
    scope.owner.update(throwing);
    scope.owner.update(throwing);
    expect(scope.dependencies.failed).toHaveBeenCalledTimes(2);
    expect(scope.dependencies.command).not.toHaveBeenCalled();
  });

  it('ignores a delayed tray-open failure after a newer reminder has acquired ownership', async () => {
    const scope = createScope();
    let rejectOpening: ((error: Error) => void) | undefined;
    const opening = new Promise<void>((_resolve, reject) => {
      rejectOpening = reject;
    });
    vi.mocked(scope.dependencies.open).mockReturnValueOnce(opening);
    scope.owner.update(scope.input());
    scope.notices[0]?.emit('click');
    scope.owner.update(scope.input());
    rejectOpening?.(new Error('old open failure'));
    await Promise.resolve();
    expect(scope.dependencies.failed).not.toHaveBeenCalled();
  });

  it('quarantines an unclosed owned notice before admitting another native delivery', () => {
    const scope = createScope();
    scope.owner.update(scope.input());
    scope.notices[0]?.close.mockImplementationOnce(() => {
      throw new Error('native close failed');
    });
    const blocked = scope.input();
    scope.owner.update(blocked);
    scope.owner.update(blocked);
    expect(scope.create).toHaveBeenCalledOnce();
    expect(scope.dependencies.failed).toHaveBeenCalledOnce();
    scope.notices[0]?.emit('action', { actionIndex: 1 });
    expect(scope.dependencies.command).not.toHaveBeenCalled();
    scope.owner.update(scope.input());
    expect(scope.create).toHaveBeenCalledTimes(2);
    expect(scope.notices.filter((notice) => !notice.closed)).toHaveLength(1);
  });

  it('bounds identity history and native delivery under repeated new-identity requests', () => {
    const scope = createScope();
    for (let index = 0; index < 1024; index++) scope.owner.update(scope.input());
    expect(scope.create.mock.calls.length).toBeLessThanOrEqual(512);
    expect(scope.notices.filter((notice) => !notice.closed)).toHaveLength(1);
    expect(scope.dependencies.failed).toHaveBeenCalledOnce();
    scope.change({ active: false, sessionId: null });
    scope.sync();
    expect(scope.notices.filter((notice) => !notice.closed)).toHaveLength(0);
    scope.change({ active: true, sessionId: crypto.randomUUID() });
    scope.owner.update(scope.input());
    expect(scope.notices.filter((notice) => !notice.closed)).toHaveLength(1);
  });
});
