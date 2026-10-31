// #region Imports
import { spawn } from 'node:child_process';
import { ProcessOwnershipObserver } from './ProcessOwnershipObserver.js';
import { ownedProcessMessageSchema } from '@resonanz/contracts';
// #endregion

// This account-free fixture owns only two silent Node processes under one new group.
const ownership = new ProcessOwnershipObserver((message) =>
  process.send?.(ownedProcessMessageSchema.parse(message)),
);
process.on('message', (raw: unknown) => {
  if (
    !raw ||
    typeof raw !== 'object' ||
    !('type' in raw) ||
    raw.type !== 'fixture.spawn' ||
    !('pidFile' in raw) ||
    typeof raw.pidFile !== 'string'
  )
    return;
  const leaf = "process.on('SIGTERM',()=>{});setInterval(()=>{},1000);";
  const script = `const {spawn}=require('node:child_process');const {writeFileSync}=require('node:fs');process.on('SIGTERM',()=>{});const leaf=spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{stdio:'ignore'});writeFileSync(process.argv[1],JSON.stringify({root:process.pid,leaf:leaf.pid}));setInterval(()=>{},1000);`;
  const child = spawn(process.execPath, ['-e', script, raw.pidFile], {
    stdio: 'ignore',
    detached: process.platform !== 'win32',
    windowsHide: true,
  });
  child.once('spawn', () => process.send?.({ type: 'fixture.child', pid: child.pid }));
});
process.on('disconnect', () => {
  ownership.dispose();
  process.exit(0);
});
process.send?.({ type: 'fixture.ready' });
