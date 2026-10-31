// #region Imports
import { describe, expect, it } from 'vitest';
import { spawn, fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { ownedProcessMessageSchema } from '@resonanz/contracts';
import { OwnedProcessSupervisor } from './OwnedProcessSupervisor.js';
// #endregion

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 'ESRCH')
      return false;
    throw cause;
  }
}
async function waitUntil(check: () => Promise<boolean> | boolean): Promise<void> {
  const deadline = performance.now() + 5000;
  while (performance.now() < deadline) {
    if (await check()) return;
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('The task-owned silent fixture did not reach its expected state.');
}
function killOwnedGroup(pid: number | undefined): void {
  if (!pid) return;
  try {
    process.kill(process.platform === 'win32' ? pid : -pid, 'SIGKILL');
  } catch (cause) {
    if (!cause || typeof cause !== 'object' || !('code' in cause) || cause.code !== 'ESRCH')
      throw cause;
  }
}

// Actual process-group semantics are verified only on the available POSIX host.
describe.skipIf(process.platform === 'win32')('OwnedProcessSupervisor', () => {
  it('observes a silent detached tree, proves it survives owner crash, then reaps it without touching an unrelated sentinel', async () => {
    // arrange
    await mkdir('.codex-work', { recursive: true });
    const directory = await mkdtemp(resolve('.codex-work/resonanz-owned-process-'));
    const entry = join(directory, 'fixture.mjs');
    const pidFile = join(directory, 'owned.json');
    let owner: ChildProcess | undefined;
    let sentinel: ChildProcess | undefined;
    let ownedRoot: number | undefined;
    let treeReaped = false;
    try {
      await build({
        entryPoints: [
          fileURLToPath(
            new URL('../../orchestrator/src/ProcessOwnershipObserver.fixture.ts', import.meta.url),
          ),
        ],
        outfile: entry,
        bundle: true,
        platform: 'node',
        format: 'esm',
        target: 'node24',
        logLevel: 'silent',
      });
      sentinel = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
        detached: true,
        stdio: 'ignore',
      });
      await once(sentinel, 'spawn');
      owner = fork(entry, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
      const [ready] = await once(owner, 'message');
      expect(ready).toEqual({ type: 'fixture.ready' });
      const supervisor = new OwnedProcessSupervisor(() => owner?.pid);
      let registered = false;
      let observerFailure: unknown;
      owner.on('message', (raw: unknown) => {
        const message = ownedProcessMessageSchema.safeParse(raw);
        if (!message.success) return;
        if (message.data.type === 'process.spawned') ownedRoot = message.data.pid;
        void supervisor
          .observe(message.data)
          .then(() => {
            if (message.data.type === 'process.spawned') registered = true;
          })
          .catch((cause: unknown) => {
            observerFailure = cause;
          });
      });
      owner.send({ type: 'fixture.spawn', pidFile });
      await waitUntil(() => {
        if (observerFailure) throw observerFailure;
        return registered;
      });
      let descendants: { root: number; leaf: number } | undefined;
      await waitUntil(async () => {
        try {
          descendants = JSON.parse(await readFile(pidFile, 'utf8')) as {
            root: number;
            leaf: number;
          };
          return Boolean(descendants?.leaf);
        } catch {
          return false;
        }
      });
      expect(descendants?.root).toBe(ownedRoot);
      expect(alive(descendants!.leaf)).toBe(true);
      // act
      const exited = once(owner, 'exit');
      owner.kill('SIGKILL');
      await exited;
      expect(alive(ownedRoot!)).toBe(true);
      expect(alive(descendants!.leaf)).toBe(true);
      await supervisor.cleanup();
      // assert
      await waitUntil(() => !alive(ownedRoot!) && !alive(descendants!.leaf));
      treeReaped = true;
      expect(alive(sentinel.pid!)).toBe(true);
    } finally {
      if (!ownedRoot) {
        try {
          ownedRoot = (JSON.parse(await readFile(pidFile, 'utf8')) as { root: number }).root;
        } catch {
          /* A fixture that never spawned has no owned group. */
        }
      }
      // Never signal a historical process group after its absence was proved.
      // The unrelated sentinel has no descendants and keeps its own child handle.
      if (!treeReaped) killOwnedGroup(ownedRoot);
      sentinel?.kill('SIGKILL');
      owner?.kill('SIGKILL');
      if (owner?.connected) owner.disconnect();
      await waitUntil(
        () => (!sentinel?.pid || !alive(sentinel.pid)) && (!owner?.pid || !alive(owner.pid)),
      );
      await rm(directory, { recursive: true, force: true });
    }
  }, 15_000);
});
