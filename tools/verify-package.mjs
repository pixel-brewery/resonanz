// #region Imports
import { constants, accessSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractFile, listPackage, statFile } from '@electron/asar';
// #endregion

if (process.argv.length > 2) throw new Error('Usage: node tools/verify-package.mjs');

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceManifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const packageRoot = join(
  resolve(root, process.env['RESONANZ_OUTPUT_DIR'] ?? 'out'),
  `${sourceManifest.productName}-${process.platform}-${process.arch}`,
);
const appRoot =
  process.platform === 'darwin'
    ? join(packageRoot, `${sourceManifest.productName}.app`)
    : packageRoot;
const resourceRoot =
  process.platform === 'darwin' ? join(appRoot, 'Contents/Resources') : join(appRoot, 'resources');
const asarPath = join(resourceRoot, 'app.asar');
const nativePackages = new Set([
  'electron-native-speech',
  'electron-native-speech-backend-macos',
  'electron-native-speech-preload',
]);

if (statSync(asarPath).size < 1_000) throw new Error('The packaged ASAR is unexpectedly small.');

const normalize = (path) => path.replaceAll('\\', '/').replace(/^\/+/, '');
const entries = new Set(listPackage(asarPath).map(normalize));
let comparedFiles = 0;

/** Lists regular files without following links outside a resource tree. */
function filesWithin(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return filesWithin(path);
    if (!entry.isFile()) throw new Error(`Unexpected resource link or special file: ${path}`);
    return [path];
  });
}

function assertArchiveFile(path) {
  if (!entries.has(path)) throw new Error(`Packaged ASAR is missing ${path}.`);
  const entry = statFile(asarPath, path, false);
  if (entry.files || entry.link !== undefined)
    throw new Error(`Packaged runtime file is not a regular file: ${path}`);
}

function compareArchiveFile(path, sourcePath = join(root, path)) {
  assertArchiveFile(path);
  if (!extractFile(asarPath, path).equals(readFileSync(sourcePath)))
    throw new Error(`Packaged file differs from the current build/source: ${path}`);
  comparedFiles += 1;
}

function compareResource(path, sourcePath) {
  if (!statSync(path).isFile() || !readFileSync(path).equals(readFileSync(sourcePath)))
    throw new Error(`Packaged external resource differs from its source: ${path}`);
  comparedFiles += 1;
}

// A source-workspace link cannot satisfy an application dependency in an installed app.
for (const path of entries) {
  if (path === 'package.json' || path === 'dist' || path.startsWith('dist/')) continue;
  if (path === 'node_modules') continue;
  if (!path.startsWith('node_modules/'))
    throw new Error(`Unexpected source/scratch content in the ASAR: ${path}`);
  const packageName = path.split('/')[1];
  if (!nativePackages.has(packageName))
    throw new Error(`Unexpected unbundled runtime package: ${packageName}`);
  if (/^node_modules\/electron-native-speech-backend-macos\/(?:bin|scripts)(?:\/|$)/u.test(path))
    throw new Error(`The native helper/postinstall must not be embedded in ASAR: ${path}`);
}

for (const path of [
  'dist/apps/desktop/main.mjs',
  'dist/apps/desktop/preload.cjs',
  'dist/apps/orchestrator/main.mjs',
])
  compareArchiveFile(path);

for (const path of [
  'index.html',
  'audio/pcm-audio.worklet.js',
  'assets/resonanz-mark.svg',
  'favicon.ico',
  'resonanz.ico',
])
  assertArchiveFile(`dist/apps/renderer/browser/${path}`);

const rendererIndex = readFileSync(join(root, 'dist/apps/renderer/browser/index.html'), 'utf8');
const scripts = [...rendererIndex.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/giu)].map(
  (match) => match[1],
);
const stylesheets = [
  ...rendererIndex.matchAll(
    /<link\b(?=[^>]*\brel=["']stylesheet["'])[^>]*\bhref=["']([^"']+)["'][^>]*>/giu,
  ),
].map((match) => match[1]);
if (!scripts.length || !stylesheets.length)
  throw new Error('The built renderer index has no script or stylesheet entrypoint.');
for (const reference of [...scripts, ...stylesheets]) {
  const url = new URL(reference, 'https://resonanz.invalid/');
  if (url.origin !== 'https://resonanz.invalid')
    throw new Error(`The built renderer references an external entrypoint: ${reference}`);
  assertArchiveFile(`dist/apps/renderer/browser/${decodeURIComponent(url.pathname.slice(1))}`);
}
for (const weight of [300, 400, 500, 600, 700]) {
  const pattern = new RegExp(
    `^dist/apps/renderer/browser/media/inter-latin-${weight}-normal(?:-[A-Za-z0-9_-]+)?\\.woff2$`,
    'u',
  );
  if (![...entries].some((path) => pattern.test(path)))
    throw new Error(`The packaged renderer is missing the Inter ${weight} font.`);
}

// Compare every emitted renderer file, including split chunks and static worklets.
for (const sourcePath of filesWithin(join(root, 'dist/apps/renderer/browser')))
  compareArchiveFile(normalize(relative(root, sourcePath)), sourcePath);

assertArchiveFile('package.json');
const runtimeManifest = JSON.parse(extractFile(asarPath, 'package.json').toString('utf8'));
const allowedManifestFields = new Set([
  'name',
  'productName',
  'version',
  'private',
  'description',
  'author',
  'type',
  'main',
  'license',
  'dependencies',
]);
for (const name of Object.keys(runtimeManifest))
  if (!allowedManifestFields.has(name))
    throw new Error(`The staged runtime manifest contains a source-only field: ${name}`);
for (const name of ['name', 'productName', 'version', 'description', 'author', 'license'])
  if (JSON.stringify(runtimeManifest[name]) !== JSON.stringify(sourceManifest[name]))
    throw new Error(`Packaged application metadata differs from its source: ${name}`);
if (
  runtimeManifest.private !== true ||
  runtimeManifest.type !== 'module' ||
  runtimeManifest.main !== 'dist/apps/desktop/main.mjs'
)
  throw new Error('The staged runtime manifest has an invalid Electron entrypoint.');

const nativeVersions = {};
for (const packageName of nativePackages) {
  const directory = join(root, 'node_modules', packageName);
  const source = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8'));
  const archiveDirectory = `node_modules/${packageName}`;
  compareArchiveFile(`${archiveDirectory}/package.json`, join(directory, 'package.json'));
  for (const path of filesWithin(join(directory, 'dist')))
    compareArchiveFile(`${archiveDirectory}/${normalize(relative(directory, path))}`, path);
  if (!source.main) throw new Error(`The native package has no main entrypoint: ${packageName}`);
  assertArchiveFile(`${archiveDirectory}/${normalize(source.main)}`);
  for (const dependency of Object.keys(source.dependencies ?? {}))
    if (!nativePackages.has(dependency))
      throw new Error(`The native dependency closure changed; declare and package ${dependency}.`);
  nativeVersions[packageName] = source.version;
}

if (
  JSON.stringify(runtimeManifest.dependencies) !==
  JSON.stringify({
    'electron-native-speech': nativeVersions['electron-native-speech'],
    'electron-native-speech-backend-macos': nativeVersions['electron-native-speech-backend-macos'],
  })
)
  throw new Error(
    'The runtime manifest must contain only the pinned native speech and backend dependencies.',
  );

for (const sourcePath of filesWithin(join(root, 'resources/icons')))
  compareResource(
    join(resourceRoot, 'icons', relative(join(root, 'resources/icons'), sourcePath)),
    sourcePath,
  );
compareResource(join(resourceRoot, 'THIRD_PARTY_NOTICES.md'), join(root, 'THIRD_PARTY_NOTICES.md'));
compareResource(
  join(resourceRoot, 'speech/windows-speech.ps1'),
  join(root, 'resources/speech/windows-speech.ps1'),
);

let nativeSignature = 'not-applicable';
if (process.platform === 'darwin') {
  const helper = join(resourceRoot, 'SpeechHelper.app/Contents/MacOS/SpeechHelper');
  accessSync(helper, constants.X_OK);
  accessSync(join(appRoot, 'Contents/MacOS/Resonanz'), constants.X_OK);
  const plist = join(appRoot, 'Contents/Info.plist');
  const plistValue = (key) =>
    execFileSync('/usr/bin/plutil', ['-extract', key, 'raw', '-o', '-', plist], {
      encoding: 'utf8',
      timeout: 5_000,
    }).trim();
  if (plistValue('CFBundleIdentifier') !== 'de.pixelbrewery.resonanz')
    throw new Error('The packaged macOS bundle identifier differs from Resonanz.');
  if (plistValue('CFBundleExecutable') !== 'Resonanz')
    throw new Error('The packaged macOS executable differs from Resonanz.');
  for (const key of ['NSMicrophoneUsageDescription', 'NSSpeechRecognitionUsageDescription'])
    if (!plistValue(key)) throw new Error(`The packaged macOS application is missing ${key}.`);
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', appRoot], {
    encoding: 'utf8',
    timeout: 20_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  nativeSignature = 'verified-local-signature';
} else {
  const executable = join(appRoot, process.platform === 'win32' ? 'Resonanz.exe' : 'Resonanz');
  accessSync(executable, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
}

const report = {
  event: 'package.verification.passed',
  platform: process.platform,
  architecture: process.arch,
  package: relative(root, packageRoot).split(sep).join('/'),
  asarBytes: statSync(asarPath).size,
  comparedFiles,
  nativeVersions,
  nativeSignature,
};
await mkdir(join(root, '.codex-work/out'), { recursive: true });
await writeFile(
  join(root, '.codex-work/out/package-verification.json'),
  `${JSON.stringify(report, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify(report)}\n`);
