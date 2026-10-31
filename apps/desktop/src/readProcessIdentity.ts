// #region Imports
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { z } from 'zod';
import type { IProcessIdentity } from './IProcessIdentity.js';
// #endregion

const execute = promisify(execFile);
const identitySchema = z.object({
  pid: z.number().int().positive(),
  parentPid: z.number().int().min(0),
  groupId: z.number().int().positive(),
  startedAt: z.string().min(1),
});

/**
 * Reads bounded process metadata only, never a command line, environment or provider prompt.
 *
 * @public
 */
export async function readProcessIdentity(pid: number): Promise<IProcessIdentity | null> {
  if (!Number.isSafeInteger(pid) || pid < 1 || pid > 0xffff_ffff)
    throw new Error('Invalid owned process identifier.');
  try {
    if (process.platform === 'win32') {
      const systemRoot = process.env['SystemRoot'] ?? process.env['SYSTEMROOT'];
      if (!systemRoot) throw new Error('Windows process identity tools are unavailable.');
      const script = `$ErrorActionPreference='Stop'; $p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; if($p){[PSCustomObject]@{pid=[int]$p.ProcessId;parentPid=[int]$p.ParentProcessId;groupId=[int]$p.ProcessId;startedAt=$p.CreationDate.ToUniversalTime().ToString('O')}|ConvertTo-Json -Compress}`;
      const result = await execute(
        join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        ['-NoProfile', '-NonInteractive', '-Command', script],
        { encoding: 'utf8', timeout: 2000, maxBuffer: 64 * 1024, windowsHide: true },
      );
      return result.stdout.trim() ? identitySchema.parse(JSON.parse(result.stdout)) : null;
    }
    const result = await execute(
      '/bin/ps',
      ['-p', String(pid), '-o', 'pid=', '-o', 'ppid=', '-o', 'pgid=', '-o', 'lstart='],
      { encoding: 'utf8', timeout: 2000, maxBuffer: 64 * 1024 },
    );
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/u.exec(result.stdout);
    if (!match) return null;
    return identitySchema.parse({
      pid: Number(match[1]),
      parentPid: Number(match[2]),
      groupId: Number(match[3]),
      startedAt: match[4],
    });
  } catch (cause) {
    if (cause && typeof cause === 'object' && 'code' in cause && cause.code === 1) return null;
    throw cause;
  }
}
