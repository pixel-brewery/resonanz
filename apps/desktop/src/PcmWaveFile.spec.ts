import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { inspectPcmWave } from './PcmWaveFile.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function fixture(format = 1, rate = 16000, samples = 16000) {
  await mkdir('.codex-work/pcm-tests', { recursive: true });
  const root = await mkdtemp(resolve('.codex-work/pcm-tests/run-'));
  roots.push(root);
  const path = join(root, 'audio.wav');
  const header = Buffer.alloc(56);
  header.write('RIFF');
  header.writeUInt32LE(48 + samples * 2, 4);
  header.write('WAVEJUNK', 8);
  header.writeUInt32LE(4, 16);
  header.write('fmt ', 24);
  header.writeUInt32LE(16, 28);
  header.writeUInt16LE(format, 32);
  header.writeUInt16LE(1, 34);
  header.writeUInt32LE(rate, 36);
  header.writeUInt32LE(rate * 2, 40);
  header.writeUInt16LE(2, 44);
  header.writeUInt16LE(16, 46);
  header.write('data', 48);
  header.writeUInt32LE(samples * 2, 52);
  await writeFile(path, header);
  const file = await open(path, 'r+');
  await file.truncate(header.length + samples * 2);
  await file.close();
  return path;
}

describe('bounded native PCM metadata', () => {
  it('counts a long recording without reading its samples and accepts non-audio RIFF chunks', async () => {
    const path = await fixture(1, 16000, 38 * 60 * 16000);
    expect(await inspectPcmWave(path)).toEqual({ path, dataOffset: 56, frames: 38 * 60 * 16000 });
  });
  it.each([
    [3, 16000],
    [1, 48000],
  ])('rejects a decoded format outside the recognition contract (%i, %i)', async (format, rate) => {
    await expect(inspectPcmWave(await fixture(format, rate))).rejects.toThrow(
      'transcriptionDecode',
    );
  });
  it('rejects a truncated data chunk before declaring a shorter recording complete', async () => {
    const path = await fixture();
    const file = await open(path, 'r+');
    await file.truncate(70);
    await file.close();
    await expect(inspectPcmWave(path)).rejects.toThrow('transcriptionDecode');
  });
});
