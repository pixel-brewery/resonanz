# Resonanz agent guide

Resonanz is an Electron tray application for recorded sessions, actual duplex live
conversation and session-based AI analysis. Angular and Mosaik own the frontend;
Synapse owns installed local-assistant integration. Read `README.md`,
`docs/README.md` and the relevant feature documentation before making changes.
Executable configuration and verified runtime behavior take precedence over
older prose.

## Architecture skill

- Apply [resonanz-architect](.agents/skills/resonanz-architect/SKILL.md) for Resonanz
  engineering work, including delegated tasks. Read its project contract and the
  inherited [Architecture base](.agents/skills/architecture/SKILL.md) with the
  shared workflow, then select the relevant production and testing references.
- `.agents/skills/` is the canonical skill tree. The shared base comes from
  `pixel-brewery/skills`, pinned by full commit and content hash in root
  `skills-lock.json`. Maintain Resonanz rules in the derived skill; change shared
  rules upstream and restore/update the base through the Skills CLI. Do not edit
  or reformat the imported base or duplicate its common modules locally.
- After skill changes, run `yarn verify:skills` or
  `python3 .agents/scripts/sync_architect_core.py --check`. This validates the
  dependency, inheritance and reference links without a peer checkout or network.

## Workspace and authority

- Work only in the owner-designated local checkout and preserve existing work.
  Resolve its root through Git rather than embedding a personal absolute path.
- Use the ignored `.codex-work/` directory for scratch work, helper scripts,
  previews, logs and manual verification artifacts. Never create project copies,
  worktrees or scratch files in Documents, iCloud-synced directories or system
  temporary directories. Do not recreate an earlier chat workspace.
  Electron Packager requires its staging tree outside the source tree; its
  task-owned exception is the sibling `.resonanz-package-staging/` in the same
  local checkout parent. Do not place that parent in a synced directory.
- Do not write credentials, personal paths, recordings, native account profiles
  or runtime caches into tracked source or documentation.
- Reference checkouts of Symphony, Synapse and Mosaik remain read-only
  unless the user authorizes a coordinated source change. A reference path is
  not a runtime dependency.
- Keep all work within the authorized scope. Do not automatically install/update
  assistant CLIs, initiate native login, change credentials, publish packages,
  deploy or create releases.

## Production owners and boundaries

- `apps/renderer`: standalone Angular views, Signals, presenters and browser media.
  Use Mosaik's public components/theme APIs and existing Symphony patterns.
  Keep view markup, TypeScript and SCSS in their matching files and use OnPush.
- `libs/intl`: portable English/German tables and consistent message formatting.
- `libs/contracts`: shared DTOs, method/event catalog and Zod runtime validation.
  Keep request, response, persistence and UI validation consistent.
- `apps/desktop`: Electron lifecycle, tray, sandboxed preload, native dialogs,
  permission mediation, protected media access and native speech lifecycle.
- `apps/orchestrator`: application use cases and supervised utility bootstrap.
- `libs/sessions`: versioned session storage, catalog and ordered audio journal.
- `libs/assistant`: the long-lived Synapse host adapter and normalized lifecycle.
- `libs/audio`: copied upstream audio implementation plus explicitly identified
  Resonanz composition. Read its provenance before touching it.

Preserve Renderer → typed preload → Main → Utility. The renderer has no Node,
filesystem, shell or credential-store access. Native AI execution and persistence
stay outside it. Do not add an internal product HTTP server, another frontend
framework or an extra database merely to simplify a local check.

The product is keyless: live conversation uses system speech recognition,
the authenticated local Codex/Claude CLI through Synapse, and system speech
output. Never introduce a separate paid audio API, API-key setup or cloud speech
fallback. The user's keyless correction is the canonical product requirement.
Recordings, live recognition, CLI inference and speech output each require their
own runtime evidence; fixtures never establish a successful real conversation.
Keep explicit user actions for capture and native authentication. Do not silently
import global CLI credentials or replace failed provider execution with fixtures.

Use strict TypeScript, explicit interface contracts, `I`-prefixed interfaces,
`_`-prefixed private fields and focused constructor injection. Keep public
exports explicit and colocate meaningful specs with their production owners.

## Copied sources and vendored dependencies

- The files in `libs/audio/provenance.json` retain their original upstream hashes.
  All remain byte-identical except the explicitly documented PCM worklet processor
  identifier rename, which has a separate downstream hash. Do not edit or reformat
  copied primitives for product changes. Keep Electron, persistence and UI
  adaptations in host-owned files outside that file set.
- A deliberate upstream audio update changes the revision, copied paths, hashes
  and relevant tests together. Preserve all supplied notices.
- Import Synapse and Mosaik by their public package names. Keep vendor archives,
  root dependencies/resolutions, lockfile and provenance coherent. Never use a
  personal peer-checkout source alias to bypass package resolution.
- Read `THIRD_PARTY_NOTICES.md` before changing copied material or font assets.
  Keep the complete upstream license/attribution text in shipped artifacts.

## Commands and verification

`package.json`, `nx.json` and resolved targets are authoritative. The current
package manager is Yarn; run configured Nx targets through Yarn. Coordinate one
heavy install/build/typecheck/test job at a time across agents.

```sh
yarn install --immutable
yarn verify:skills
yarn verify:vendor
yarn verify:audio
yarn typecheck
yarn test
yarn build
yarn test:e2e
yarn start:built
```

`yarn start` builds then launches Electron. `yarn verify` composes the configured
checks. `yarn package` and `yarn make` build native bundles/installers for the
host platform; they do not prove release readiness or another OS's behavior.
After packaging, `yarn verify:package` checks the artifact and
`yarn test:e2e --packaged` exercises its actual executable. Add `--speech` only
for an intentional audible check with an available system voice.

Run focused checks before broader required gates. Use task-owned controlled
fixtures for ordinary tests; personal-account login/inference and real media
are distinct integration checks. Stop and confirm cleanup of helpers owned by
this task; preserve unrelated processes and user data. Do not run extra app,
service, browser-profile or provider instances merely for convenience.

Report only checks actually run, with their scope and outcome. A passing build,
typed IPC, a unit test or executable discovery does not prove real recording,
native speech, native account inference, Windows or packaging. Keep
`docs/project/verification.md` aligned with actual evidence and remaining requirements.

## Documentation and pull requests

Track confirmed repository work on the
[Resonanz board](https://github.com/orgs/pixel-brewery/projects/9), using its shared
Backlog, Qualified, Ready, Progress, Acceptance and Done statuses. Add newly
recorded work to the board; the repository link does not enable automatic intake.
Run `yarn verify:public-content` after changing content or vendor archives. The
guard also decodes compressed archives and is included in `yarn verify`.
The [repository-quality contract](docs/architecture/repository-quality/README.md)
distinguishes current remote protection from a locally prepared workflow revision.

Keep product documentation under `docs/project` focused on user workflows and
feature behavior. Keep technical documentation under the appropriate feature in
`docs/architecture`; distinguish implemented behavior, binding target and pending
verification. Update the README when product prerequisites or startup change.

Before creating any pull request, run the repository's local Ship-it review when
available and resolve its blocking findings first. The owner's standing
instruction authorizes that review. Do not create the PR first or claim a review
that has not run. Preserve explicit user authorization for Git/external actions;
this guide introduces no additional approval step for already authorized work.
