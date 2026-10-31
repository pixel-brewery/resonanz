// #region Imports
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { builtinModules } from 'node:module';
// #endregion

const builtins = new Set(
  builtinModules.flatMap((name) => [
    name,
    name.replace(/^node:/u, ''),
    `node:${name.replace(/^node:/u, '')}`,
  ]),
);
const lateBound = new Set([
  'electron',
  'electron-native-speech',
  'electron-native-speech-backend-macos',
]);
const reports = [];
const builds = [
  {
    entryPoints: ['apps/desktop/src/main.ts'],
    outfile: 'dist/apps/desktop/main.mjs',
    format: 'esm',
  },
  {
    entryPoints: ['apps/desktop/src/preload.ts'],
    outfile: 'dist/apps/desktop/preload.cjs',
    format: 'cjs',
  },
  {
    entryPoints: ['apps/orchestrator/src/main.ts'],
    outfile: 'dist/apps/orchestrator/main.mjs',
    format: 'esm',
  },
];
for (const configuration of builds) {
  await mkdir(configuration.outfile.slice(0, configuration.outfile.lastIndexOf('/')), {
    recursive: true,
  });
  const result = await build({
    ...configuration,
    bundle: true,
    metafile: true,
    platform: 'node',
    target: 'node24',
    sourcemap: true,
    minify: false,
    legalComments: 'none',
    external: ['electron', 'electron-native-speech', 'electron-native-speech-backend-macos'],
    tsconfig: 'tsconfig.base.json',
    ...(configuration.format === 'esm'
      ? {
          banner: {
            js: "import { createRequire as __createRequire } from 'node:module'; const require = __createRequire(import.meta.url);",
          },
        }
      : {}),
  });
  const externalImports = [
    ...new Set(
      Object.values(result.metafile.outputs).flatMap((output) =>
        output.imports.filter((entry) => entry.external).map((entry) => entry.path),
      ),
    ),
  ].sort();
  const unexpected = externalImports.filter((path) => !builtins.has(path) && !lateBound.has(path));
  if (unexpected.length)
    throw new Error(
      `The packaged ${configuration.outfile} has undeclared runtime packages: ${unexpected.join(', ')}`,
    );
  reports.push({
    artifact: configuration.outfile,
    externalImports,
    inputs: Object.keys(result.metafile.inputs).length,
  });
}
await mkdir('.codex-work/out', { recursive: true });
await writeFile(
  '.codex-work/out/native-build-dependencies.json',
  `${JSON.stringify({ bundles: reports, lateBoundPackages: ['electron-native-speech', 'electron-native-speech-backend-macos'] }, null, 2)}\n`,
  'utf8',
);
