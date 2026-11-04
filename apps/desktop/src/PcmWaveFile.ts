// #region Imports
import { open, stat } from 'node:fs/promises';
// #endregion

export interface IPcmWaveFile {
  readonly path: string;
  readonly dataOffset: number;
  readonly frames: number;
}

export const transcriptionSampleRate = 16_000;
const maximumFrames = 86_400 * transcriptionSampleRate;

/** Reads only RIFF metadata; decoded recordings never need to fit in a JavaScript buffer. */
export async function inspectPcmWave(path: string): Promise<IPcmWaveFile> {
  const size = (await stat(path)).size;
  const file = await open(path, 'r');
  try {
    const header = Buffer.alloc(40);
    const read = async (position: number, bytes: number): Promise<void> => {
      if (
        position + bytes > size ||
        (await file.read(header, 0, bytes, position)).bytesRead !== bytes
      )
        throw new Error('loc.resonanz.error.transcriptionDecode');
    };
    await read(0, 12);
    if (header.toString('ascii', 0, 4) !== 'RIFF' || header.toString('ascii', 8, 12) !== 'WAVE')
      throw new Error('loc.resonanz.error.transcriptionDecode');
    let validFormat = false;
    for (let offset = 12, chunks = 0; offset + 8 <= size && chunks < 100; chunks++) {
      await read(offset, 8);
      const name = header.toString('ascii', 0, 4);
      const length = header.readUInt32LE(4);
      const start = offset + 8;
      if (start + length > size) throw new Error('loc.resonanz.error.transcriptionDecode');
      if (name === 'fmt ') {
        if (length < 16) throw new Error('loc.resonanz.error.transcriptionDecode');
        await read(start, Math.min(length, 40));
        const format = header.readUInt16LE(0);
        validFormat =
          (format === 1 || (format === 0xfffe && length >= 40 && header.readUInt32LE(24) === 1)) &&
          header.readUInt16LE(2) === 1 &&
          header.readUInt32LE(4) === transcriptionSampleRate &&
          header.readUInt16LE(12) === 2 &&
          header.readUInt16LE(14) === 16;
      }
      if (name === 'data') {
        const frames = length / 2;
        if (!validFormat || !Number.isSafeInteger(frames) || frames < 1 || frames > maximumFrames)
          throw new Error('loc.resonanz.error.transcriptionDecode');
        return { path, dataOffset: start, frames };
      }
      offset = start + length + (length % 2);
    }
    throw new Error('loc.resonanz.error.transcriptionDecode');
  } finally {
    await file.close();
  }
}
