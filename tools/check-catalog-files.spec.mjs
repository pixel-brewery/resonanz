import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkCatalogFiles } from './check-catalog-files.mjs';

let workspace = dirname(fileURLToPath(import.meta.url));
while (!existsSync(join(workspace, 'nx.json'))) workspace = dirname(workspace);
const scratch = join(workspace, '.codex-work');
mkdirSync(scratch, { recursive: true });
const fixtures = [];
const EXECUTOR = '@pixel-brewery/wortlaut-nx-tasks:wortlaut';
const DETECT = {
  root: 'src',
  resourceRoot: ['assets/i18n'],
  languages: ['en', 'de'],
  type: 'json',
};

function write(root, path, value) {
  const file = join(root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof value === 'string' ? value : JSON.stringify(value));
}

function fixture({
  detect = DETECT,
  options = {},
  configurations = {},
  rootProject = false,
  nameDefaults,
} = {}) {
  const root = mkdtempSync(join(scratch, 'catalog-files-'));
  fixtures.push(root);
  const defaults = {
    [EXECUTOR]: {
      options: { actions: { detect } },
      configurations: { analyze: { mode: 'analyze', dryRun: true } },
    },
  };
  if (nameDefaults) defaults.intl = nameDefaults;
  write(root, 'nx.json', { targetDefaults: defaults });
  write(root, rootProject ? 'project.json' : 'apps/web/project.json', {
    name: 'fixture',
    targets: { intl: { executor: EXECUTOR, options, configurations } },
  });
  return root;
}

function catalogs(root, directory = 'apps/web/src/assets/i18n') {
  write(root, `${directory}/lang.en.json`, { 'loc.greeting': 'Hello {0}' });
  write(root, `${directory}/lang.de.json`, { 'loc.greeting': 'Hallo {0}' });
}

after(() => {
  for (const root of fixtures) rmSync(root, { recursive: true, force: true });
});

test('accepts configured catalogs and additional legitimate locales without writing to them', () => {
  const root = fixture();
  catalogs(root);
  write(root, 'apps/web/src/assets/i18n/lang.fr.json', { 'loc.greeting': 'Bonjour {0}' });
  assert.deepEqual(checkCatalogFiles(root), { errors: [], targets: 1, catalogs: 3 });
});

test('rejects a missing expected locale even when another locale has a valid catalog', () => {
  const root = fixture();
  write(root, 'apps/web/src/assets/i18n/lang.en.json', { 'loc.greeting': 'Hello' });
  assert.ok(
    checkCatalogFiles(root).errors.some((error) => error.includes('missing expected locale de')),
  );
});

test('rejects an empty locale object that the public reader otherwise skips', () => {
  const root = fixture();
  catalogs(root);
  write(root, 'apps/web/src/assets/i18n/lang.de.json', {});
  assert.ok(checkCatalogFiles(root).errors.some((error) => error.includes('nonempty object')));
});

test('rejects malformed JSON, comments and trailing commas', () => {
  const root = fixture();
  catalogs(root);
  for (const value of ['{', '{/* comment */"loc.a":"Text"}', '{"loc.a":"Text",}']) {
    write(root, 'apps/web/src/assets/i18n/lang.de.json', value);
    assert.ok(checkCatalogFiles(root).errors.some((error) => error.includes('malformed JSON')));
  }
});

test('rejects nonstring and empty translation values without comparing their semantics', () => {
  const root = fixture();
  catalogs(root);
  for (const value of [null, 3, {}, [], '', '   ']) {
    write(root, 'apps/web/src/assets/i18n/lang.de.json', {
      'loc.valid': 'Gültig',
      'loc.greeting': value,
    });
    assert.ok(checkCatalogFiles(root).errors.some((error) => error.includes('translation string')));
  }
});

test('rejects empty namespaces beside valid strings at every nesting depth', () => {
  const root = fixture();
  catalogs(root);
  const cases = [
    { catalog: { 'loc.good': 'Good', 'loc.required': {} }, path: 'loc.required' },
    { catalog: { loc: { good: 'Good', required: {} } }, path: 'loc.required' },
    { catalog: { loc: { good: 'Good', required: { nested: {} } } }, path: 'loc.required.nested' },
    { catalog: { 'loc.good': 'Good', '': {} }, path: '' },
  ];
  for (const { catalog, path } of cases) {
    for (const locale of ['de', 'en']) {
      write(root, `apps/web/src/assets/i18n/lang.${locale}.json`, catalog);
    }
    const errors = checkCatalogFiles(root).errors;
    for (const locale of ['de', 'en']) {
      assert.ok(
        errors.some(
          (error) =>
            error.includes(`lang.${locale}.json`) &&
            error.includes(
              `namespace ${JSON.stringify(path)} must contain at least one translation string`,
            ),
        ),
      );
    }
  }
});

test('rejects raw duplicate properties including escaped spellings of the same key', () => {
  const root = fixture();
  catalogs(root);
  for (const value of [
    '{"loc.greeting":"Hallo","loc.greeting":"Nochmals"}',
    '{"loc.greeting":"Hallo","loc.\\u0067reeting":"Nochmals"}',
  ]) {
    write(root, 'apps/web/src/assets/i18n/lang.de.json', value);
    assert.ok(
      checkCatalogFiles(root).errors.some((error) =>
        error.includes('duplicate JSON property "loc.greeting"'),
      ),
    );
  }
});

test('rejects a missing source root and a catalog directory with no JSON resources', () => {
  const root = fixture();
  assert.ok(checkCatalogFiles(root).errors.some((error) => error.includes('source root')));
  mkdirSync(join(root, 'apps/web/src/assets/i18n'), { recursive: true });
  assert.ok(checkCatalogFiles(root).errors.some((error) => error.includes('no JSON catalogs')));
});

test('checks each catalog family and supports locale directories', () => {
  const root = fixture();
  write(root, 'apps/web/src/assets/i18n/en/messages.json', { 'loc.a': 'Hello' });
  write(root, 'apps/web/src/assets/i18n/de/messages.json', { 'loc.a': 'Hallo' });
  assert.deepEqual(checkCatalogFiles(root).errors, []);
  write(root, 'apps/web/src/assets/i18n/en/errors.json', { 'loc.b': 'Failure' });
  assert.ok(
    checkCatalogFiles(root).errors.some((error) =>
      error.includes('{locale}/errors.json is missing expected locale de'),
    ),
  );
});

test('uses executor defaults before target-name defaults', () => {
  const root = fixture({
    nameDefaults: { options: { actions: { detect: { ...DETECT, root: 'missing' } } } },
  });
  catalogs(root);
  assert.deepEqual(checkCatalogFiles(root).errors, []);
});

test('replaces actions at the top level when target options override Nx defaults', () => {
  const root = fixture({
    options: {
      actions: {
        detect: { root: 'other', resourceRoot: 'catalogs', languages: ['en'], type: 'json' },
      },
    },
  });
  write(root, 'apps/web/other/catalogs/lang.en.json', { 'loc.a': 'Hello' });
  assert.deepEqual(checkCatalogFiles(root).errors, []);
});

test('uses the analyze configuration and includes a root project.json target', () => {
  const root = fixture({
    rootProject: true,
    configurations: {
      analyze: {
        actions: {
          detect: { root: 'source', resourceRoot: 'catalogs', languages: ['en'], type: 'json' },
        },
      },
    },
  });
  write(root, 'source/catalogs/lang.en.json', { 'loc.a': 'Hello' });
  assert.deepEqual(checkCatalogFiles(root), { errors: [], targets: 1, catalogs: 1 });
});

test('matches legacy path-segment arrays and independent resource-root arrays', () => {
  const root = fixture({ detect: { ...DETECT, resourceRoot: ['assets', 'i18n'] } });
  catalogs(root);
  assert.deepEqual(checkCatalogFiles(root).errors, []);
  const separate = fixture({ detect: { ...DETECT, resourceRoot: ['one', 'two'] } });
  catalogs(separate, 'apps/web/src/one');
  catalogs(separate, 'apps/web/src/two');
  assert.deepEqual(checkCatalogFiles(separate), { errors: [], targets: 1, catalogs: 4 });
});

test('accepts nested translation namespaces and still finds duplicates inside them', () => {
  const root = fixture();
  catalogs(root);
  write(root, 'apps/web/src/assets/i18n/lang.de.json', {
    loc: { greeting: 'Hallo', nested: { ready: 'Bereit' } },
  });
  assert.deepEqual(checkCatalogFiles(root).errors, []);
  write(
    root,
    'apps/web/src/assets/i18n/lang.de.json',
    '{"loc":{"greeting":"Hallo","greeting":"Nochmals"}}',
  );
  assert.ok(
    checkCatalogFiles(root).errors.some((error) =>
      error.includes('duplicate JSON property "loc.greeting"'),
    ),
  );
});

test('leaves the pinned reader’s comments metadata outside the catalog scan', () => {
  const root = fixture();
  catalogs(root);
  write(root, 'apps/web/src/assets/i18n/wortlaut.comments.json', {
    schemaVersion: 1,
    catalogs: {},
  });
  assert.deepEqual(checkCatalogFiles(root), { errors: [], targets: 1, catalogs: 2 });
});
