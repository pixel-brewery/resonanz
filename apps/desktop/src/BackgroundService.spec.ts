import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hostTranscriptionEnvelopeSchema } from '@resonanz/contracts';
import { BackgroundService } from './BackgroundService.js';

const electron = vi.hoisted(() => ({ fork: vi.fn() }));
vi.mock('electron', () => ({ utilityProcess: { fork: electron.fork } }));

const sessionId = '00000000-0000-4000-8000-000000000001';
const generation = '00000000-0000-4000-8000-000000000002';
const command = {
  action: 'begin' as const,
  sessionId,
  sourceHash: 'a'.repeat(64),
  locale: 'de-DE',
  plan: 'pcm16-v1' as const,
  totalChunks: 3,
};
let responseData: unknown;
let service: BackgroundService;
let postMessage: ReturnType<typeof vi.fn>;

beforeEach(() => {
  electron.fork.mockReset();
  responseData = { generation, nextChunk: 1 };
  electron.fork.mockImplementation(() => {
    const worker = new EventEmitter();
    postMessage = vi.fn((message: unknown) => {
      if (
        message &&
        typeof message === 'object' &&
        'type' in message &&
        message.type === 'host.shutdown'
      ) {
        worker.emit('message', { type: 'background.stopped' });
        worker.emit('exit', 0);
        return;
      }
      const envelope = hostTranscriptionEnvelopeSchema.parse(message);
      queueMicrotask(() => {
        worker.emit('message', {
          correlationId: '00000000-0000-4000-8000-000000000099',
          ok: true,
          data: { generation, nextChunk: 99 },
        });
        worker.emit('message', {
          correlationId: envelope.correlationId,
          ok: true,
          data: responseData,
        });
      });
    });
    queueMicrotask(() => worker.emit('message', { type: 'background.ready' }));
    return Object.assign(worker, { postMessage, kill: vi.fn(), stdout: null, stderr: null });
  });
  service = new BackgroundService(
    '/controlled/background.mjs',
    '/controlled/data',
    () => undefined,
  );
});
afterEach(async () => {
  await service.dispose();
});

describe('BackgroundService private transcription port', () => {
  it('uses a private validated envelope and accepts only its correlated resume result', async () => {
    expect(await service.transcription(command)).toEqual({ generation, nextChunk: 1 });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'host.transcription',
      correlationId: expect.any(String),
      command,
    });
    expect(postMessage.mock.calls[0]?.[0]).not.toHaveProperty('method');
  });

  it('rejects a bad native plan before starting or contacting the Utility process', async () => {
    await expect(service.transcription({ ...command, totalChunks: 3001 })).rejects.toThrow();
    expect(electron.fork).not.toHaveBeenCalled();
  });

  it('rejects malformed successful Utility responses instead of advancing native work', async () => {
    responseData = { generation: 'not-a-generation', nextChunk: -1 };
    await expect(service.transcription(command)).rejects.toThrow();
  });
});
