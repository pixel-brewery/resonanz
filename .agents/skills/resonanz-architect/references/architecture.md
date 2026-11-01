# Architecture and source owners

Read [the architecture overview](../../../../docs/architecture/README.md) and the
affected feature documentation. Preserve Renderer → typed preload → Electron Main
→ supervised Utility. There is one application, one capture owner and one owned
assistant runtime; views and bootstrap code compose those responsibilities.

| Owner                                               | Responsibility and extension seam                                                                        |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [Renderer](../../../../apps/renderer/src)           | Standalone Angular/OnPush views, presenters, Signals, browser media and data-driven visual components    |
| [Contracts](../../../../libs/contracts/src)         | Shared DTOs, method/event catalogs, runtime request/response/persistence validation and safe projections |
| [Internationalization](../../../../libs/intl/src)   | Portable English/German catalogs and message formatting shared with the native host                      |
| [Desktop](../../../../apps/desktop/src)             | Electron lifecycle, tray/window, permission mediation, dialogs, protected media and native speech        |
| [Orchestrator](../../../../apps/orchestrator/src)   | Application use cases, session context, structured AI results and supervised utility bootstrap           |
| [Sessions](../../../../libs/sessions/src)           | Versioned local metadata/catalog, private continuation storage and ordered acknowledged audio writes     |
| [Assistant adapter](../../../../libs/assistant/src) | Long-lived Synapse host adapter, isolated accounts and normalized run/auth lifecycle                     |
| [Audio workspace](../../../../libs/audio/README.md) | Provenance-verified upstream primitives/specs with one documented identifier adaptation                  |

## Dependency and transport decisions

The renderer calls only the typed preload API. It has no Node, shell, filesystem or
credential-store access. Main mediates native effects; the Utility owns persistence
and native assistant execution. Transport validation and correlation are enforced
at actual boundaries, including returned responses and events.

Use public `@pixel-brewery/*` Mosaik/Synapse package imports and public
`@resonanz/*` workspace exports. Keep archives, provenance, root dependencies,
resolutions and Yarn lock coherent. A personal peer-checkout alias is not an
integration seam. Native dependencies and preload bundle formats follow
[desktop architecture](../../../../docs/architecture/desktop/README.md).

Shared NestJS/Prisma/HTTP examples translate to existing application owners and
versioned JSON/audio persistence. No internal product HTTP server, extra database,
frontend framework, tenant/credit model or Symphony Git/delivery domain is needed.
Keep technical diagnostics out of product decoration unless they enable recovery.

## Changes across owners

Trace a changed behavior from its view/presenter through `DesktopApi`, shared
contracts, preload/Main, Utility/application and the real storage/provider owner.
Include cancellation, state restoration, correlated events, cleanup and backward
compatibility. A new DTO field is incomplete until every validating/projection and
persisted consumer agrees.

Use [session contracts](sessions.md) for persisted state and evidence,
[desktop lifecycle](desktop.md) for native effects and [audio](audio.md) for media.
Do not rewrite an upstream owner to avoid a host adaptation. Preserve identities,
acknowledged audio, continuation isolation and readable older sessions when
migrating state. Unknown/newer versions need explicit recoverable behavior.
