import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

assert.equal(process.platform, 'win32', 'This check requires the native Windows speech runtime.');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'resources/speech/windows-speech.ps1');
const executable = join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32/WindowsPowerShell/v1.0/powershell.exe',
);
await mkdir(join(root, '.codex-work'), { recursive: true });
const directory = await mkdtemp(join(root, '.codex-work/windows-speech-'));

function run(mode, configuration) {
  const child = spawnSync(
    executable,
    [
      '-NoLogo',
      '-NoProfile',
      '-NonInteractive',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      script,
      '-Mode',
      mode,
    ],
    {
      input: `${JSON.stringify(configuration)}\n`,
      encoding: 'utf8',
      windowsHide: true,
      timeout: 90_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  if (child.error) throw child.error;
  assert.equal(child.status, 0, `Native ${mode} failed: ${child.stderr.slice(0, 2000)}`);
  return JSON.parse(child.stdout.trim());
}

// This compiles and invokes the exact bridge shipped in the app; no speech API,
// browser speech stub or personal assistant profile participates in this check.
const metadata = run('inspect', {});
assert(Array.isArray(metadata.locales) && Array.isArray(metadata.voices));
assert(metadata.voices.length > 0, 'An installed Windows system voice is required.');
const fixtures = [
  {
    locale: 'en-US',
    text: 'The meeting is on Tuesday. The project is ready for testing.',
    words: /meeting|Tuesday|project|testing/iu,
  },
  {
    locale: 'de-DE',
    text: 'Die Besprechung ist am Dienstag. Das Projekt ist bereit für den Test.',
    words: /Besprechung|Dienstag|Projekt|Test/iu,
  },
];
const fixture = fixtures.find(
  (candidate) =>
    metadata.locales.includes(candidate.locale) &&
    metadata.voices.some((voice) => voice.locale === candidate.locale),
);
const voice =
  metadata.voices.find((candidate) => candidate.locale === fixture?.locale) ?? metadata.voices[0];
const audioPath = join(directory, 'system-voice.wav');
assert.equal(
  run('synthesize', {
    text: fixture?.text ?? fixtures[0].text,
    voice: voice.id,
    outputPath: audioPath,
  }).complete,
  true,
);
const audio = await readFile(audioPath);
assert(audio.length > 44 && audio.length < 32 * 1024 * 1024);
assert.equal(audio.toString('ascii', 0, 4), 'RIFF');
assert.equal(audio.toString('ascii', 8, 12), 'WAVE');

let transcription = { status: 'unavailable-no-matching-installed-language', segments: 0 };
if (fixture) {
  const result = run('transcribe', { locale: fixture.locale, filePath: audioPath });
  assert(Array.isArray(result.segments) && result.segments.length > 0);
  const text = result.segments.map((segment) => segment.text).join(' ');
  assert(
    fixture.words.test(text),
    `The native recognizer did not recover the known fixture: ${text}`,
  );
  for (const segment of result.segments) {
    assert(Number.isFinite(segment.startMs) && segment.startMs >= 0);
    assert(Number.isFinite(segment.endMs) && segment.endMs > segment.startMs);
  }
  transcription = {
    status: 'passed',
    locale: fixture.locale,
    segments: result.segments.length,
    text,
  };
}

const report = {
  event: 'windows.speech.verification.passed',
  installedLocales: metadata.locales,
  installedVoices: metadata.voices.length,
  synthesis: { status: 'passed', locale: voice.locale, wavBytes: audio.length },
  transcription,
  limits: [
    'artificial system-voice fixture',
    'no physical microphone',
    'no assistant login or inference',
  ],
};
await mkdir(join(root, '.codex-work/out'), { recursive: true });
await writeFile(
  join(root, '.codex-work/out/windows-speech-verification.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(report)}\n`);
