import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const workspace = fileURLToPath(new URL('../', import.meta.url));
const catalog = join(workspace, 'libs/intl/src/assets/i18n');
const en = JSON.parse(readFileSync(join(catalog, 'lang.en.json'), 'utf8'));
const de = JSON.parse(readFileSync(join(catalog, 'lang.de.json'), 'utf8'));
const failures = [];
let references = 0;

for (const directory of ['apps', 'libs']) {
  inspect(join(workspace, directory));
}
if (references === 0) failures.push('No static Resonanz translation references were found.');
if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Verified ${references} static application references in both runtime catalogs.`);
}

function inspect(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (
      entry.isDirectory() &&
      !['node_modules', 'dist'].includes(entry.name) &&
      path !== join(workspace, 'libs/audio/src/audio')
    ) {
      inspect(path);
    } else if (
      entry.isFile() &&
      /\.(?:html|ts)$/u.test(entry.name) &&
      !entry.name.endsWith('.spec.ts')
    ) {
      const source = readFileSync(path, 'utf8');
      for (const match of source.matchAll(/(['"`])(loc\.resonanz\.[\w-]+(?:\.[\w-]+)*)\1/gu)) {
        references++;
        const key = match[2];
        if (!Object.hasOwn(en, key) || !Object.hasOwn(de, key)) {
          const line = source.slice(0, match.index).split('\n').length;
          failures.push(`${relative(workspace, path)}:${line} missing translation ${key}.`);
        }
      }
    }
  }
}
