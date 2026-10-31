// #region Imports

import { accessSync, closeSync, constants, fstatSync, openSync, readSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, posix, relative, resolve, sep, win32 } from 'node:path';
import type { AssistantProvider } from './models/AssistantProvider.js';

// #endregion

/**
 * Finds an installed assistant without starting shells, login, hooks or inference.
 *
 * @param provider - Product-supported native command identifier.
 * @param environment - Captured host toolchain environment, including GUI PATH fallbacks.
 * @param platform - Native platform; explicit substitution supports platform contract checks.
 * @returns An absolute existing executable, or undefined when unavailable.
 * @remarks Adapted from Symphony's resolveAllowedCommand/codexApplicationCandidates owners.
 *
 * @public
 */
export function resolveAssistantExecutable(
  provider: AssistantProvider,
  environment: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  const windows = platform === 'win32';
  const paths = windows ? win32 : posix;
  const value = (name: string): string | undefined =>
    Object.entries(environment).find(([key]) => key.toUpperCase() === name)?.[1];
  const home = value('HOME') ?? value('USERPROFILE') ?? homedir();
  const pathDirectories = (value('PATH') ?? '').split(windows ? ';' : ':').filter(Boolean);
  const extensions = windows
    ? (value('PATHEXT') ?? '.COM;.EXE;.BAT;.CMD')
        .split(';')
        .filter((extension) => /^\.[A-Za-z0-9]+$/u.test(extension))
    : [''];

  if (pathDirectories.length > 256 || extensions.length > 32) return undefined;

  const directories = [
    ...pathDirectories,
    ...(!windows ? ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin'] : []),
    ...['.local/bin', '.volta/bin', '.bun/bin', '.npm-global/bin', 'Library/pnpm'].map(
      (directory) => paths.join(home, directory),
    ),
    ...(windows && value('LOCALAPPDATA')
      ? [paths.join(value('LOCALAPPDATA')!, 'Programs', 'OpenAI', 'Codex', 'bin')]
      : []),
    ...(value('CODEX_INSTALL_DIR') && provider === 'codex' ? [value('CODEX_INSTALL_DIR')!] : []),
  ].filter((directory) => paths.isAbsolute(directory));
  const candidates = [...new Set(directories)].flatMap((directory) =>
    extensions.map((extension) => paths.join(directory, provider + extension)),
  );

  if (provider === 'codex' && platform === 'darwin') {
    for (const applications of ['/Applications', join(home, 'Applications')]) {
      for (const name of ['Codex.app', 'ChatGPT.app']) {
        const resources = join(applications, name, 'Contents', 'Resources');
        const cliRoot = join(resources, 'codex-cli');
        const entrypoint = manifestEntrypoint(cliRoot);

        candidates.push(
          ...(entrypoint ? [entrypoint] : []),
          join(cliRoot, 'bin', 'codex'),
          join(cliRoot, 'CodexCLI.app', 'Contents', 'MacOS', 'codex'),
          join(resources, 'codex'),
        );
      }
    }
  }

  return candidates.find((candidate) => executableFile(candidate, windows));
}

function executableFile(candidate: string, windows: boolean): boolean {
  try {
    if (!statSync(candidate).isFile()) return false;

    accessSync(candidate, windows ? constants.F_OK : constants.X_OK);

    return true;
  } catch {
    return false;
  }
}

function manifestEntrypoint(cliRoot: string): string | undefined {
  let descriptor: number | undefined;

  try {
    descriptor = openSync(
      join(cliRoot, 'codex-package.json'),
      constants.O_RDONLY | constants.O_NONBLOCK,
    );
    const stats = fstatSync(descriptor);

    if (!stats.isFile() || stats.size > 16 * 1024) return undefined;

    const bytes = Buffer.alloc(16 * 1024 + 1);
    const length = readSync(descriptor, bytes, 0, bytes.length, 0);

    if (length > 16 * 1024) return undefined;

    const manifest: unknown = JSON.parse(bytes.subarray(0, length).toString('utf8'));

    if (typeof manifest !== 'object' || manifest === null) return undefined;

    const entrypoint = 'entrypoint' in manifest ? manifest.entrypoint : undefined;

    if (
      !('layoutVersion' in manifest) ||
      manifest.layoutVersion !== 1 ||
      typeof entrypoint !== 'string' ||
      !entrypoint ||
      isAbsolute(entrypoint) ||
      entrypoint.includes('\\') ||
      /\p{Cc}/u.test(entrypoint)
    )
      return undefined;

    const candidate = resolve(cliRoot, entrypoint);
    const suffix = relative(cliRoot, candidate);

    return !suffix || suffix === '..' || suffix.startsWith(`..${sep}`) ? undefined : candidate;
  } catch {
    return undefined;
  } finally {
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        // Optional metadata must not prevent known-layout discovery.
      }
    }
  }
}
