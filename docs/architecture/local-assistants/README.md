# Local assistant integration

## Implemented host boundary

`@resonanz/assistant` is a private, framework-neutral host adapter around Synapse's
native CLI packages. The desktop utility process creates one `AssistantService`
with its private application data directory and an environment captured at
bootstrap. Angular and the Electron main process do not execute native AI jobs.

The host owns product prompts, recording/transcript storage, session organization,
visible settings and IPC correlation. The assistant adapter owns executable
discovery, isolated native accounts, bounded account inspection, native login,
read-only text execution, continuations and cancellation/disposal.

The API supports transcript analysis, questions and live-conversation text turns
through `execute`. The application composes the appropriate prompt. There is no
hidden mock response or automatic fallback to a different account/provider.

## Reused implementations and adaptations

| Source                                                                    | Resonanz use                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Synapse `AiRuntime`, `NodeProcessRunner`, `ProfileManager`, `AuthManager` | Direct public package imports; Synapse remains the runtime/process/auth owner.                                                                                                                                                     |
| Synapse Codex, Claude and OpenCode drivers                                | Direct public package imports; native protocols are not reimplemented.                                                                                                                                                             |
| Symphony `SynapseAiService`                                               | Shared coordinator, captured bootstrap environment, lazy account preparation, bounded inspection and awaited shutdown are adapted to recording sessions. Git, delivery, worktrees and model-routing business entities are omitted. |
| Symphony `resolveAllowedCommand` and `codexApplicationCandidates`         | Filesystem discovery follows explicit command names, GUI PATH fallbacks and known Codex application bundle layouts. No shell command interpolation is used.                                                                        |
| Synapse independent meeting-notes consumer                                | Establishes that transcript analysis is a normal read-only text request with no Git repository requirement.                                                                                                                        |

Source packages are pinned through the portable [distribution manifest](../../../vendor/synapse/provenance.json).
The package-consumer archives are unmodified; [artifact verification](../../../vendor/synapse/README.md)
describes their integrity and installation route.

## Native executable and account lifecycle

`detect()` checks executable files without launching login, inference, hooks or
installation. PATH/PATHEXT and known platform installation locations are searched
with finite bounds. An explicit absolute executable selection is also supported.

On an explicit status, login or execution request, profiles are created under
`<application-data>/ai-profiles`, separated by application, provider and account.
No global CLI credentials are discovered or copied. Only allowlisted toolchain,
network and locale environment keys are forwarded; HOME and temporary directories
remain under the native profile owner.

`status(configuration)` is bounded to fifteen seconds. It returns native account
state, actual supported authentication methods and any advertised model metadata.
Unavailable metadata does not fabricate a model catalog. An inspection failure
remains visible in `message`; native login methods remain available for recovery.
A separately verified account state is preserved when only model metadata fails.
An unconfirmed process-cleanup failure is propagated and retains Synapse's profile
quarantine rather than claiming that the account is ready.

`startLogin` accepts only a procedure advertised by the selected driver. The
settings UI receives an expiring, correlated interaction and may explicitly open
its native URL or submit requested input. `respondLogin` checks the operation and
current interaction, while Synapse also checks ownership and expiry. Submitted
credential values are neither logged nor persisted by this host adapter. Success
requires the native account-status verification. Logout uses the same coordinator
to drain work and invalidate prior session generations.

OpenCode needs its exact native provider and authentication method label to expose
its native login procedure. Resonanz does not invent provider-specific OAuth
flows. Codex/Claude subscription login works through their installed native CLIs;
an API key is not a Synapse requirement.

## Execution, progress and continuation

Each `execute` call has a unique host run ID, recording session ID and complete
prompt. It receives a private non-Git workspace under
`<application-data>/assistant-workspaces/<session-id>` and always requests Synapse
`mode: read-only`. A selected model is passed as its native identifier; omission
uses native defaults. The candidate identity also includes the selected model, so
a foreign account/model continuation is rejected rather than silently reused.

The service allows at most eight active turns, bounds each prompt to 1 MiB and
uses a two-minute native turn deadline. Safe text,
progress and opaque continuation events are forwarded with the host run ID.
Critical callback failure cancels the native attempt and never replays it.
`result.text` is the complete final result rather than another delta.

Complete native references are encoded with Synapse's session codec, preserving
driver, instance, profile, candidate and authentication generation. Persisting only
a native session ID is unsupported. Login, logout and explicit configuration
changes retain Synapse's generation checks across application restarts.

`cancel(runId)` aborts and awaits owned execution cleanup, including cancellation
requested while account preparation is still in progress. `cancelLogin` does the
same for authentication. `dispose()` stops new work, aborts observations and turns,
and awaits native/auth/runtime/process teardown. It reports cleanup failures.

## Audio boundary and remaining verification

Synapse supplies text/CLI integration. It does not implement microphone recording,
speech recognition or text-to-speech. The unchanged upstream primitives own browser
media; Electron Main owns system recognition and archiveable native voice clips.
The application sends persisted recognized utterances through the same Synapse
text-turn API and records actually played replies in its stereo archive.

Account-free adjacent tests exercise the actual Synapse runtime and auth manager
through injected deterministic native driver boundaries. They cover isolated
account/session binding, event normalization, explicit correlated login, cancellation
and rejection of traversal-shaped IDs. These checks do not prove successful live
subscription inference or native Windows behavior; those need the corresponding
account/platform verification.

The inspected local versions were Codex `0.165.0-alpha.1.2`, Claude Code `2.1.308`
and OpenCode `1.18.31`. Installed Codex/Claude are newer than the versions documented
as characterized by Synapse. Executable presence is not evidence of authentication
or successful inference.
