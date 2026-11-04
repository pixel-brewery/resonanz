#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseTree, printParseErrorCode } from 'jsonc-parser';

const EXECUTOR =
  /^@pixel-brewery\/(?:wortlaut-nx-tasks:(?:wortlaut|localizator)|nx-tasks:localizator)$/u;
const SKIP = new Set([
  'node_modules',
  '.git',
  '.cache',
  '.codex-work',
  '.generated',
  'dist',
  'out',
  'coverage',
]);

function filesUnder(directory, predicate) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return SKIP.has(entry.name) ? [] : filesUnder(path, predicate);
    return entry.isFile() && predicate(entry.name) ? [path] : [];
  });
}

function workspaceOf(directory) {
  while (!existsSync(join(directory, 'nx.json'))) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error('No nx.json workspace found.');
    directory = parent;
  }
  return directory;
}

function readConfiguration(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    throw new Error(`${path}: cannot read a JSON configuration.`);
  }
}

function targetsOf(root) {
  const defaults = readConfiguration(join(root, 'nx.json')).targetDefaults ?? {};
  const projects = ['apps', 'libs'].flatMap((directory) =>
    filesUnder(join(root, directory), (name) => name === 'project.json'),
  );
  if (existsSync(join(root, 'project.json'))) projects.unshift(join(root, 'project.json'));
  return projects.flatMap((path) => {
    const project = readConfiguration(path);
    return Object.entries(project.targets ?? {}).flatMap(([name, target]) => {
      // Nx chooses executor defaults before target-name defaults. Options and each named
      // configuration merge by top-level option key: an authored `actions` object replaces it.
      const base = defaults[target.executor] ?? defaults[name] ?? {};
      if (!EXECUTOR.test(target.executor ?? base.executor ?? '')) return [];
      if (Array.isArray(base))
        throw new Error(`${path}: filtered targetDefaults need an explicitly resolved target.`);
      const configurations = { ...base.configurations, ...target.configurations };
      const configuration = configurations.analyze
        ? 'analyze'
        : (target.defaultConfiguration ?? base.defaultConfiguration);
      const options = {
        ...base.options,
        ...target.options,
        ...base.configurations?.[configuration],
        ...target.configurations?.[configuration],
      };
      return [
        {
          name: `${project.name ?? relative(root, dirname(path))}:${name}`,
          directory: project.root ? resolve(root, project.root) : dirname(path),
          detect: options.actions?.detect,
        },
      ];
    });
  });
}

function resourceRoots(source, value) {
  const entries = typeof value === 'string' ? [value] : value;
  if (
    !Array.isArray(entries) ||
    entries.length === 0 ||
    entries.some((entry) => typeof entry !== 'string' || !entry.trim())
  ) {
    throw new Error('actions.detect.resourceRoot must name at least one catalog directory.');
  }
  // Match Wortlaut PathResolver: an array is legacy path segments if their joined directory
  // exists; otherwise its entries name independent resource roots relative to detect.root.
  const joined = join(source, ...entries);
  return entries.length === 1 || (existsSync(joined) && statSync(joined).isDirectory())
    ? [joined]
    : entries.map((entry) => join(source, entry));
}

function localeOf(path, directory, languages) {
  const parts = relative(directory, path).split(sep);
  const stem = basename(path, '.json');
  for (const language of languages) {
    const locale = language.toLowerCase();
    const directories = parts.slice(0, -1);
    const fileLocale = stem.toLowerCase() === locale || stem.toLowerCase().endsWith(`.${locale}`);
    if (!fileLocale && !directories.some((part) => part.toLowerCase() === locale)) continue;
    const family = directories.map((part) => (part.toLowerCase() === locale ? '{locale}' : part));
    family.push(
      fileLocale ? `${stem.slice(0, stem.length - language.length)}{locale}.json` : parts.at(-1),
    );
    return { language, family: family.join('/') };
  }
  return null;
}

function inspectCatalog(path, label, errors) {
  const syntax = [];
  const tree = parseTree(readFileSync(path, 'utf8'), syntax, {
    disallowComments: true,
    allowTrailingComma: false,
    allowEmptyContent: false,
  });
  if (syntax.length > 0 || !tree) {
    errors.push(
      `${label}: malformed JSON (${syntax.map((error) => printParseErrorCode(error.error)).join(', ')}).`,
    );
    return;
  }
  if (tree.type !== 'object' || !tree.children?.length) {
    errors.push(`${label}: catalog must be a nonempty object of translation strings.`);
    return;
  }
  function inspectObject(object, prefix = '') {
    const keys = new Set();
    let strings = 0;
    for (const property of object.children ?? []) {
      const [key, value] = property.children ?? [];
      if (!key || !value) continue;
      const name = prefix ? `${prefix}.${key.value}` : key.value;
      if (keys.has(key.value))
        errors.push(`${label}: duplicate JSON property ${JSON.stringify(name)}.`);
      keys.add(key.value);
      if (value.type === 'object') strings += inspectObject(value, name);
      else if (value.type !== 'string' || !value.value.trim())
        errors.push(
          `${label}: ${JSON.stringify(name)} must contain a nonempty translation string.`,
        );
      else strings += 1;
    }
    if (strings === 0 && object !== tree) {
      errors.push(
        `${label}: namespace ${JSON.stringify(prefix)} must contain at least one translation string.`,
      );
    }
    return strings;
  }
  if (inspectObject(tree) === 0)
    errors.push(`${label}: catalog must contain at least one translation string.`);
}

/**
 * Requires the catalog files that Wortlaut 0.2.4 can otherwise skip. Public Wortlaut still owns
 * semantic locale parity, placeholders and message analysis. This preflight never writes files.
 *
 * @param {string} workspaceRoot The Nx workspace to inspect.
 * @returns {{errors: string[], targets: number, catalogs: number}} Presence and JSON-shape evidence.
 */
export function checkCatalogFiles(workspaceRoot) {
  const root = resolve(workspaceRoot);
  const errors = [];
  let catalogs = 0;
  let targets = [];
  try {
    targets = targetsOf(root);
    if (targets.length === 0) errors.push('No configured Wortlaut project targets found.');
    for (const target of targets) {
      const detect = target.detect;
      if (!detect || detect.type !== 'json' || typeof detect.root !== 'string') {
        errors.push(
          `${target.name}: expected an explicit JSON actions.detect configuration with a source root.`,
        );
        continue;
      }
      const languages = detect.languages;
      if (
        !Array.isArray(languages) ||
        languages.length === 0 ||
        languages.some((language) => typeof language !== 'string' || !language.trim())
      ) {
        errors.push(`${target.name}: actions.detect.languages must declare the expected locales.`);
        continue;
      }
      const source = join(target.directory, detect.root);
      if (!existsSync(source) || !statSync(source).isDirectory()) {
        errors.push(`${target.name}: source root ${relative(root, source)} is missing.`);
        continue;
      }
      for (const directory of resourceRoots(source, detect.resourceRoot)) {
        const label = `${target.name} (${relative(root, directory)})`;
        if (!existsSync(directory) || !statSync(directory).isDirectory()) {
          errors.push(`${label}: catalog directory is missing.`);
          continue;
        }
        // Wortlaut reserves this file for comments, not translation values.
        const files = filesUnder(
          directory,
          (name) => name.endsWith('.json') && name !== 'wortlaut.comments.json',
        );
        if (files.length === 0) errors.push(`${label}: no JSON catalogs found.`);
        const families = new Map();
        for (const path of files) {
          catalogs += 1;
          inspectCatalog(path, relative(root, path), errors);
          const catalog = localeOf(path, directory, languages);
          if (catalog) {
            if (!families.has(catalog.family)) families.set(catalog.family, new Set());
            families.get(catalog.family).add(catalog.language);
          }
        }
        if (files.length > 0 && families.size === 0)
          errors.push(`${label}: no catalogs for the configured locales ${languages.join(', ')}.`);
        for (const [family, found] of families) {
          for (const language of languages) {
            if (!found.has(language))
              errors.push(`${label}: ${family} is missing expected locale ${language}.`);
          }
        }
      }
    }
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }
  return { errors, targets: targets.length, catalogs };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = checkCatalogFiles(
    process.argv[2] ?? workspaceOf(dirname(fileURLToPath(import.meta.url))),
  );
  for (const error of result.errors) console.error(error);
  console.log(
    `Catalog preflight: ${result.targets} target(s), ${result.catalogs} catalog(s), ${result.errors.length} error(s).`,
  );
  process.exitCode = result.errors.length > 0 ? 1 : 0;
}
