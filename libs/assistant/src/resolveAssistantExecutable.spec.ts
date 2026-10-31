// #region Imports

import { afterEach, describe, expect, it } from 'vitest';
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { resolveAssistantExecutable } from './resolveAssistantExecutable.js';

// #endregion

const directories: string[] = [];

afterEach(async () => {
  for (const directory of directories.splice(0))
    await rm(directory, { recursive: true, force: true });
});

describe('resolveAssistantExecutable', () => {
  it('finds an executable in a path containing shell syntax without running that executable', async () => {
    // Arrange
    await mkdir('.codex-work', { recursive: true });
    const root = await mkdtemp(resolve('.codex-work/resonanz-discovery-'));
    directories.push(root);
    const directory = join(root, 'assistant $(not-a-command) with spaces');
    const windows = process.platform === 'win32';
    const executable = join(directory, windows ? 'codex.CMD' : 'codex');
    const marker = join(root, 'must-not-exist');
    await mkdir(directory);
    await writeFile(
      executable,
      windows ? `@echo off\r\necho executed > "${marker}"\r\n` : `#!/bin/sh\ntouch '${marker}'\n`,
    );
    if (!windows) await chmod(executable, 0o700);

    // Act
    const discovered = resolveAssistantExecutable('codex', {
      PATH: directory,
      ...(windows ? { PATHEXT: '.CMD' } : {}),
    });

    // Assert
    expect(discovered).toBe(executable);
    await expect(access(marker)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('bounds inherited path discovery instead of scanning an unbounded environment', () => {
    // Arrange
    const environment = {
      PATH: Array.from({ length: 300 }, (_, index) => `/toolchain/${index}`).join(':'),
    };

    // Act
    const discovered = resolveAssistantExecutable('codex', environment, 'linux');

    // Assert
    expect(discovered).toBeUndefined();
  });
});
