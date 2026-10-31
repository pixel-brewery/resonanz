import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { PCM_AUDIO_WORKLET_DEFINITION } from '../libs/audio/src/audio/realtime/worklets/PcmAudioWorkletDefinition.ts';

const args = process.argv.slice(2);

if (args.length > 1 || args.some((argument) => argument !== '--check')) {
  throw new Error('Usage: node tools/generate-audio-worklet.mjs [--check]');
}

const output = new URL('../apps/renderer/public/audio/pcm-audio.worklet.js', import.meta.url);
const source = PCM_AUDIO_WORKLET_DEFINITION.source;

if (args.includes('--check')) {
  const actual = await readFile(output, 'utf8');

  if (actual !== source) {
    throw new Error('The static PCM worklet is stale. Run node tools/generate-audio-worklet.mjs.');
  }

  process.stdout.write(
    'The static PCM worklet matches the unchanged shared processor definition.\n',
  );
} else {
  await mkdir(new URL('./', output), { recursive: true });
  await writeFile(output, source, 'utf8');
  process.stdout.write(
    'Generated apps/renderer/public/audio/pcm-audio.worklet.js from the shared PCM definition.\n',
  );
}
