# Sessions, contracts and evidence

Read [desktop/storage architecture](../../../../docs/architecture/desktop/README.md)
and [recording workflows](../../../../docs/project/recordings.md). Extend
[SessionStore](../../../../libs/sessions/src/SessionStore.ts) for durable state and
[OrchestratorApplication](../../../../apps/orchestrator/src/OrchestratorApplication.ts)
for use cases and selected assistant context. Keep transport/persistence validators
in [libs/contracts](../../../../libs/contracts/src).

## Persistence and compatibility

Session/catalog metadata is versioned JSON with serialized writes and atomic
replacement. Audio is a separate journal starting at sequence 1. An identical
retry is idempotent; a gap or changed retry fails. Only acknowledged host writes
are durable. Recovery retains those blocks and marks previously active capture
interrupted; a pending renderer queue is not recovered audio.

Extend DTOs, Zod data/request/response/event schemas, stored documents, projections
and UI validation together. Define how old/missing/unknown-version fields behave
before changing persisted meaning. Do not silently discard existing sessions,
repair business data on a read or treat missing audio as present. JSON reimport
creates a fresh identity; audio export is separate. Collection deletion preserves
its sessions.

Native continuation/account references stay private to host storage. A safe UI or
export projection must not leak a path, profile or raw continuation. Preserve
complete session/account/model/auth-generation bindings through persistence and
explicit invalidation; see [Assistants](assistants.md).

## Runs and structured claims

Use caller-generated run IDs for admission and correlated progress/completion.
Admission is not successful inference. Maintain one semantic run per session;
only a run that acquired processing may restore it. Finishing capture cancels and
awaits related live work. Transcript replacement cancels dependent work, clears
structured evidence/continuations and retains readable historical message text.

[parseSessionInsights](../../../../apps/orchestrator/src/parseSessionInsights.ts)
validates structured model output against actual final transcript segments.
Evidence uses real segment IDs, original text and time bounds; invalid/unknown
model references are unverified. Legacy prose can remain readable without being
advertised as structured verified evidence. Keep evidence validation at persistence
and UI projection boundaries as well as model parsing.

The host selects prompt context. Transcript-only questions omit markers/history
and use a separate continuation scope. Saved-session dictation is a separate
operation that edits question input, never the source transcript. Projections for
ring/landscape/threads consume session data; they do not invent waveform energy,
citations or automatic cross-session topic discovery.

## Time semantics

`createdAt`/`updatedAt` and other persisted timestamps are instants serialized
through the current shared schemas. Audio `atMs`/`startMs`/`endMs`, duration and
playhead values are nonnegative offsets/durations in milliseconds, not dates or
wall-clock instants. Validate ordering and bounds against the actual session.

Weekly/day grouping and localized display belong to renderer projections in the
viewer's local calendar context. Preserve a stored instant when the UI language
changes; do not group by a UTC string slice when local day/week behavior is needed.
Recognition locale, UI locale and output voice have separate meanings. Native
deadlines/cancellation use their operation owner, independent of calendar grouping.
