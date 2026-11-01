// #region Imports

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

// #endregion

let checked = 0;
for (const filename of ['vendor/mosaik/provenance.json', 'vendor/synapse/provenance.json']) {
  const manifest = JSON.parse(await readFile(filename, 'utf8'));
  const entries = manifest.packages ?? manifest.archives;
  if (!Array.isArray(entries) || !entries.length)
    throw new Error(`Leeres Archivmanifest: ${filename}`);
  for (const entry of entries) {
    const path = resolve(dirname(filename), entry.file ?? entry.filename ?? entry.archive);
    const digest = createHash('sha256')
      .update(await readFile(path))
      .digest('hex');
    if (digest !== entry.sha256) throw new Error(`Archive digest mismatch: ${path}`);
    checked++;
  }
}
console.log(`${checked} package archives match the documented SHA-256 digests.`);
