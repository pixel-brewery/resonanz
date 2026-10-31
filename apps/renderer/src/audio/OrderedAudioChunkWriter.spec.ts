// #region Imports

import { describe, expect, it, vi } from 'vitest';
import { OrderedAudioChunkWriter } from './OrderedAudioChunkWriter';

// #endregion

function audioBlob(size: number): Blob {
  return { size, arrayBuffer: async () => new ArrayBuffer(size) } as Blob;
}

describe('OrderedAudioChunkWriter', () => {
  it('waits for each durable acknowledgement before committing the next numbered fragment', async () => {
    // Arrange
    let acknowledge: (() => void) | undefined;
    const first = new Promise<void>((resolve) => {
      acknowledge = resolve;
    });
    const persistChunk = vi
      .fn()
      .mockImplementationOnce(() => first)
      .mockResolvedValue(undefined);
    const writer = new OrderedAudioChunkWriter(
      { persistChunk },
      'session',
      'microphone',
      vi.fn(),
      vi.fn(),
    );

    // Act
    writer.enqueue(audioBlob(5), 'audio/webm', 1_000);
    writer.enqueue(audioBlob(7), 'audio/webm', 2_000);
    await Promise.resolve();
    await Promise.resolve();

    // Assert
    expect(persistChunk).toHaveBeenCalledTimes(1);
    expect(writer.pendingBytes).toBe(12);
    acknowledge?.();
    await writer.close();
    expect(persistChunk.mock.calls.map(([chunk]) => chunk.sequence)).toEqual([1, 2]);
    expect(persistChunk.mock.calls.map(([chunk]) => chunk.bytes.byteLength)).toEqual([5, 7]);
    expect(writer.pendingBytes).toBe(0);
  });

  it('retains already accepted fragments when backpressure stops further recording', async () => {
    // Arrange
    const persistChunk = vi.fn().mockResolvedValue(undefined);
    const failure = vi.fn();
    const writer = new OrderedAudioChunkWriter(
      { persistChunk },
      'session',
      'conversation',
      failure,
      vi.fn(),
      8,
    );

    // Act
    writer.enqueue(audioBlob(5), 'audio/webm', 1_000);
    expect(() => writer.enqueue(audioBlob(4), 'audio/webm', 2_000)).toThrow(
      'Audioablage ist zu langsam',
    );

    // Assert
    await expect(writer.close()).rejects.toThrow('Audioablage ist zu langsam');
    expect(persistChunk).toHaveBeenCalledTimes(1);
    expect(persistChunk.mock.calls[0]?.[0]).toMatchObject({ sequence: 1, channel: 'conversation' });
    expect(failure).toHaveBeenCalledTimes(1);
    expect(writer.pendingBytes).toBe(0);
  });

  it('does not create an acknowledgement gap after a failed disk write', async () => {
    // Arrange
    const persistChunk = vi.fn().mockRejectedValue(new Error('disk full'));
    const failure = vi.fn();
    const writer = new OrderedAudioChunkWriter(
      { persistChunk },
      'session',
      'microphone',
      failure,
      vi.fn(),
    );

    // Act
    writer.enqueue(audioBlob(1), 'audio/webm', 1_000);
    writer.enqueue(audioBlob(1), 'audio/webm', 2_000);

    // Assert
    await expect(writer.close()).rejects.toThrow('disk full');
    expect(persistChunk).toHaveBeenCalledTimes(1);
    expect(failure).toHaveBeenCalledTimes(1);
    expect(writer.pendingBytes).toBe(0);
  });
});
