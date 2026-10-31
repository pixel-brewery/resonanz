// #region Imports

import { afterEach, describe, expect, it } from 'vitest';
import { access, chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    const root = await mkdtemp(join(tmpdir(), 'resonanz-discovery-'));
    directories.push(root);
    const directory = join(root, 'assistant $(not-a-command) with spaces');
    const executable = join(directory, 'codex');
    const marker = join(root, 'must-not-exist');
    await mkdir(directory);
    await writeFile(executable, `#!/bin/sh\ntouch '${marker}'\n`);
    await chmod(executable, 0o700);

    // Act
    const discovered = resolveAssistantExecutable('codex', { PATH: directory }, 'linux');

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
