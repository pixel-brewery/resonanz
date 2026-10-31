// #region Imports

import { describe, expect, it, vi } from 'vitest';
import type { IAudioTranscriptSegment } from './IAudioTranscriptSegment';
import { TranscriptCommitQueue } from './TranscriptCommitQueue';

// #endregion

function segment(text: string, final = false): IAudioTranscriptSegment {
  return {
    id: 'caption',
    sessionId: 'session',
    speaker: 'assistant',
    text,
    startMs: 0,
    endMs: 100,
    final,
  };
}

describe('TranscriptCommitQueue', () => {
  it('coalesces superseded captions while a previous disk write is still running', async () => {
    // Arrange
    let acknowledge: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    const appendTranscript = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(undefined);
    const queue = new TranscriptCommitQueue({ appendTranscript }, vi.fn());
    queue.enqueue(segment('Die'));
    await Promise.resolve();
    await Promise.resolve();

    // Act
    queue.enqueue(segment('Die Antwort'));
    queue.enqueue(segment('Die Antwort ist vollständig.', true));
    acknowledge?.();
    await queue.flush();

    // Assert
    expect(appendTranscript).toHaveBeenCalledTimes(2);
    expect(appendTranscript.mock.calls[1]?.[0]).toMatchObject({
      text: 'Die Antwort ist vollständig.',
      final: true,
    });
  });

  it('surfaces a failed transcript commit instead of reporting successful finalization', async () => {
    // Arrange
    const onFailure = vi.fn();
    const queue = new TranscriptCommitQueue(
      { appendTranscript: vi.fn().mockRejectedValue(new Error('storage unavailable')) },
      onFailure,
    );

    // Act
    queue.enqueue(segment('Gespeichert?'));

    // Assert
    await expect(queue.flush()).rejects.toThrow('storage unavailable');
    expect(onFailure).toHaveBeenCalledTimes(1);
    expect(() => queue.enqueue(segment('Weiter'))).toThrow('storage unavailable');
  });
});
