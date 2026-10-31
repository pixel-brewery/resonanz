import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const repositoryRoot = new URL('../../', import.meta.url);
const provenance = JSON.parse(
  await readFile(new URL('./provenance.json', import.meta.url), 'utf8'),
);
const failures = [];

for (const file of provenance.files) {
  try {
    const bytes = await readFile(new URL(file.destination, repositoryRoot));
    const actual = createHash('sha256').update(bytes).digest('hex');

    if (actual !== file.sha256) {
      failures.push(`${file.destination}: content differs from ${provenance.commit}`);
    }
  } catch (error) {
    failures.push(`${file.destination}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failures.length > 0) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(
    `Verified ${provenance.files.length} unchanged audio files from ${provenance.commit}.\n`,
  );
}
