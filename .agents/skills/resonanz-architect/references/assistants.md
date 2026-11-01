# Synapse and native assistant accounts

Read [local-assistant architecture](../../../../docs/architecture/local-assistants/README.md)
and [assistant setup](../../../../docs/project/assistant-setup.md).
[AssistantService](../../../../libs/assistant/src/services/AssistantService.ts) is
the framework-neutral Resonanz host adapter; the Utility creates one long-lived
instance with typed options and environment captured at bootstrap.

## Public ownership and keyless execution

Synapse's public packages own CLI drivers/protocols, native accounts/profiles,
authentication, streaming, session encoding and process cancellation/disposal.
The host owns product prompts, selected context, local sessions, visible settings
and event correlation. Import public package names and extend the adapter; do not
reimplement a driver, spawn another provider runner or patch an archive.

Installed Codex/Claude native sign-in plus system speech is the product path.
Native provider availability and advertised methods/models determine capability;
an installed optional driver does not authorize another product/provider workflow.
Executable discovery is bounded filesystem inspection, without login, hooks,
inference or automatic installation. No fixture or alternate account/provider
silently replaces failed execution.

## Profiles, authentication and continuation

Application-owned profiles are isolated by provider/account under private app
data. Do not discover/copy global CLI credentials or forward an unrestricted host
environment. Native login starts explicitly, uses an advertised procedure and
correlated expiring interactions, and succeeds only after actual native account
verification. Credential input is neither logged nor stored by the host adapter.
Inspect current bounds and failure/quarantine behavior before changing status or
cleanup handling.

Each turn has a host run ID, session ID and bounded prompt. The private assistant
workspace is not a Git checkout; execution remains Synapse `mode: read-only`.
Keep configured deadlines/concurrency and cancellation during lazy account
preparation. Forward normalized progress/text safely; the complete final result
is not another delta, and a failed critical callback must not replay inference.

Persist Synapse's complete encoded continuation, including driver, instance,
profile, candidate/model and authentication generation. An ID alone is insufficient.
Login/logout/configuration/transcript changes invalidate the relevant binding;
stale completion must not restore it. Keep account inspection/model metadata
failures distinct and preserve an independently verified account state only under
the current contract.

`cancel`, `cancelLogin` and `dispose` abort and await owned native cleanup. Surface
cleanup failures and preserve profile quarantine. Do not declare readiness because
a process was merely discovered or an abort signal was sent.

## Dependencies and evidence

Keep [Synapse provenance](../../../../vendor/synapse/provenance.json), vendor
archives, public imports, dependencies/resolutions and Yarn lock coherent. A peer
source reference is read-only and not a runtime dependency.

Account-free tests may inject deterministic native boundaries while exercising
the real Synapse runtime/auth adapter. They establish only those contracts. Codex
inference, Claude inference, native speech and each OS need separate observed
evidence, recorded with the scope in [Verification](testing.md). Personal-account
checks retain the user's authorization and explicit login interaction.
