---
name: resonanz-architect
description: 'Design, implement, refactor, test, document or review Resonanz engineering work. Apply shared Architecture foundations with Electron process boundaries, Angular/Mosaik, Synapse, copied audio provenance, versioned sessions and native verification.'
# Keep the inheritance checker's two-space metadata nesting.
# prettier-ignore
metadata:
  inherits: architecture
---

# Resonanz Architect

Carry out the requested task through Resonanz's production owners. Read the
[Architecture base](../architecture/SKILL.md), its
[shared workflow](../architecture/references/common/workflow.md), root
[AGENTS.md](../../../AGENTS.md) and the [project contract](references/project.md)
first. Apply this skill to Resonanz engineering tasks even when it was not named;
preserve the user's requested implementation, design, explanation or review mode.

## Inherited architecture foundation

The base is installed from `pixel-brewery/skills` at the immutable commit and content
hash in [skills-lock.json](../../../skills-lock.json). `metadata.inherits` records the
dependency; reading the base and combining its modules with the local references
performs the composition. Ordinary use needs no network or peer checkout.

Select every relevant production foundation and its local application below before
editing. Add testing guidance when verifying behavior; revisit routing when the
task crosses another boundary. Load only the references needed for the task.

| Task or boundary                                                                  | Shared foundation                                                                                                                      | Resonanz application                                                                      |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Ownership, solution design, extraction, refactoring or migration                  | [Architecture](../architecture/references/common/architecture.md)                                                                      | [Architecture and source owners](references/architecture.md)                              |
| TypeScript contracts, composition, abstractions, exports or source documentation  | [OOP and design patterns](../architecture/references/common/oop.md)                                                                    | [Project and source conventions](references/project.md)                                   |
| Application use cases, session storage, recovery or structured analysis           | [Backend](../architecture/references/common/backend.md)                                                                                | [Sessions, contracts and evidence](references/sessions.md)                                |
| Requests, responses, events, validation or persisted/renderer projections         | [Contracts](../architecture/references/common/backend-contracts.md)                                                                    | [Desktop transport](references/desktop.md), [Session contracts](references/sessions.md)   |
| Electron, native processes, permissions, startup, cancellation or shutdown        | [Platform](../architecture/references/common/platform.md), [Integration safety](../architecture/references/common/backend-safety.md)   | [Desktop lifecycle](references/desktop.md)                                                |
| Recording, transcription, speech, duplex archive, worklet or copied sources       | [Platform](../architecture/references/common/platform.md)                                                                              | [Audio and speech](references/audio.md)                                                   |
| Assistant accounts, native CLI execution, continuations or provider dependencies  | [Platform](../architecture/references/common/platform.md), [Integration safety](../architecture/references/common/backend-safety.md)   | [Synapse integration](references/assistants.md)                                           |
| Angular views, Mosaik, forms, presenters, routing, visualizations or localization | [Frontend](../architecture/references/common/frontend.md), [Frontend patterns](../architecture/references/common/frontend-patterns.md) | [Frontend and internationalization](references/frontend.md)                               |
| Session instants, media offsets, deadlines, weekly grouping or date presentation  | [Date and time](../architecture/references/common/date-time.md)                                                                        | [Session time contracts](references/sessions.md), [Frontend](references/frontend.md)      |
| Unit, integration, contract or tooling tests                                      | [Testing](../architecture/references/common/testing.md), plus the production foundation                                                | [Verification](references/testing.md)                                                     |
| Electron UI acceptance, native packaging or real media/account evidence           | [E2E](../architecture/references/common/e2e.md), plus the production foundation                                                        | [Native acceptance and packaging](references/testing.md)                                  |
| An actual HTTP integration, if the authorized task introduces one                 | [API URLs](../architecture/references/common/api.md), [Integration safety](../architecture/references/common/backend-safety.md)        | [Project boundaries](references/project.md); existing product transport remains typed IPC |

Resonanz translates shared backend examples into framework-neutral application
owners, Zod-validated IPC and versioned JSON/audio storage. It does not acquire
NestJS, Prisma, HTTP controllers, tenant/billing policy or a database through an
example. Public Mosaik packages own controls/themes; Synapse owns native CLI
protocols and accounts; the copied Flamox audio set remains unchanged. These local
translations preserve ownership, contracts, lifecycle, resource limits,
compatibility and meaningful verification.

Examples of combined selection:

- Question dictation: Platform + Contracts + Frontend + Testing; combine Desktop,
  Audio and Frontend so an operation cannot rewrite the source transcript or stop
  another recognition operation.
- Analysis/evidence: Backend + Contracts + Integration safety + Testing; combine
  Sessions and Assistants so actual transcript references and private continuation
  bindings survive the complete execution/persistence boundary.
- Ring or weekly landscape: Frontend + Frontend patterns + Date/time + Testing;
  project real session data into reusable visual components without another media
  or persistence owner.

## Maintaining the derivation

Maintain project rules here and shared rules upstream in `pixel-brewery/skills`.
Restore or update the base through the Skills CLI at a reviewed full commit and
retain its generated root lock entry. Never edit/reformat the imported base or
copy common modules into this derived skill. Missing or mismatched base content
must be restored before relying on inherited guidance.

Run `yarn verify:skills` (or
`python3 .agents/scripts/sync_architect_core.py --check`) after skill changes. It
checks the pinned source, content hash, explicit inheritance and all relative
Markdown references in both skills. `yarn verify` includes this check. Codex UI
metadata lives in [agents/openai.yaml](agents/openai.yaml); root `AGENTS.md` is the
repository entrypoint. This repository currently has no generated client mirrors.
