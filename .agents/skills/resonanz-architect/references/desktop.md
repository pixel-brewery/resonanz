# Desktop transport and native lifecycle

Read [desktop architecture](../../../../docs/architecture/desktop/README.md).
Production owners are [Main](../../../../apps/desktop/src/main.ts),
[preload](../../../../apps/desktop/src/preload.ts),
[BackgroundService](../../../../apps/desktop/src/BackgroundService.ts),
[OwnedProcessSupervisor](../../../../apps/desktop/src/OwnedProcessSupervisor.ts),
[NativeSpeechService](../../../../apps/desktop/src/NativeSpeechService.ts) and the
[Utility bootstrap](../../../../apps/orchestrator/src/main.ts).

## Typed IPC and protected resources

Keep request methods, payload/response types, Zod schemas and events in
[libs/contracts](../../../../libs/contracts/src). Validate requests, responses and
events at their receiving boundary, match response correlation IDs and validate
the sending renderer/window/frame in Main. The sandboxed preload exposes only
`request` and `onEvent`; subscriptions return cleanup functions.

Keep paths, credentials and complete native continuations outside renderer DTOs.
`resonanz-audio` resolves validated session identities with bounded byte ranges;
`resonanz-voice` resolves an owned speech clip. Neither accepts an arbitrary path.
Native file dialogs and validated import/export remain host-owned. Safe error keys
use the shared language tables; external native/provider prose stays verbatim.

## One capture and explicit lifecycle

The single-instance app reuses its window. Closing/hiding the workspace keeps an
active recording alive; compact tray/capture mode changes the same window and
renderer rather than starting another recorder. Language/theme/layout changes
must not recreate capture ownership. Quitting active capture retains the product's
explicit stop/confirmation flow and final audio acknowledgment.

Cancellation and shutdown are awaited operations. Drain acknowledged audio/session
writes, close owned recognition/output and dispose Synapse/native work before
declaring completion. Late responses/events cannot restart stopped or paused
capture. Renderer loss interrupts capture and closes its speech operations;
recovery does not silently restart recognition/playback.

Read the actual supervisor budgets before changing queue, timeout, restart or
shutdown behavior. Unexpected Utility exit rejects waiting requests. Restart is
conditional on cleanup of its registered native children; preserve bounded retry
and visible exhaustion.

## Process and speech ownership

[ProcessOwnershipObserver](../../../../apps/orchestrator/src/ProcessOwnershipObserver.ts)
observes the existing runner rather than replacing Synapse execution. Main tracks
ownership token, process identity and confirmed process/group metadata. Preserve
unrelated or reused identities; never kill by executable name or a broad process
scan. Account/provider histories are not disposable test artifacts.

POSIX process-group cleanup and Windows root/descendant behavior have different
guarantees. The current spawn-to-registration crash window is not universal
orphan safety; unconfirmed Windows cleanup must not become permission to restart.
Tests must exercise the actual identity/cleanup contract on the corresponding OS.

Native recognition/output uses the existing macOS backend and Windows bridge.
Keep capability discovery, permissions, operation/session/run identities, owned
conversion files and cleanup in those owners. Missing installed speech capability
is an actionable unavailable state, without cloud substitution. Use
[Audio](audio.md) for archive semantics and [Verification](testing.md) for evidence.
