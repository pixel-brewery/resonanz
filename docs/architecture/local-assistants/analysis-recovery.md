# Automatic analysis recovery

OrchestratorApplication owns recovery of an explicitly requested analysis that
failed with supported, recoverable native-assistant metadata. Synapse owns native
account inspection and execution. There is no automatic login, CLI installation,
provider substitution, API-key setup or cloud speech fallback.

The first attempt waits four minutes. Later availability attempts use eight,
sixteen, thirty and thirty minutes; after five unsuccessful automatic attempts,
the session remains available for manual retry. A provider's later recovery time
takes precedence, within a one-day automatic-wait limit. Unknown errors,
cancellation, unsafe cleanup and nonrepeatable configuration/validation/host errors
do not create automatic work. Inspection must complete and verify the selected
account before inference; independently verified authentication after a metadata
failure alone is insufficient.

One unreferenced Utility timer and one in-flight recovery chain service the queue.
Active capture, other assistant work, connection tests, library clearing and native
binding transitions defer admission. A thirty-second busy defer does not consume
an availability attempt. Native inspection retains the adapter's existing bound.
Disposal stops scheduling, aborts native operations and drains admitted work/writes.

SessionStore persists a private retry identity, assistant-configuration fingerprint,
due instant and bounded attempt number. Only the due instant is projected as
`pipeline.analysis.retryAt`. Renderer stage-update requests reject this reserved
field. Export/import never transfers retry authorization. Reopening the app can
resume a pending persisted intent; a run interrupted during inference is not
silently replayed.

Each post-inspection mutation compares the exact private retry UUID in the
serialized store lane. Automatic admission also passes a serialized current-intent
check and immediate cancellation/binding-generation guards. A late inspection
cannot erase or resurrect a newer intent, nor start after an already-entered cancel.
Assistant configuration changes, logout, transcript replacement and deletion
invalidate related pending work. Explicit native sign-in remains a user action;
it invalidates continuations and can restore availability for an existing intent.

Recovery displays the actual deadline and offers **Stop automatic retries**.
That command cancels pending recovery only; currently running inference has its
separate cancellation command. Original audio/text remain available for playback,
context-preserving literal search and timestamped copying. No fixture establishes
real native account readiness or successful inference.
