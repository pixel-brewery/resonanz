# Contributing to Resonanz

Use the [issue templates](https://github.com/pixel-brewery/resonanz/issues/new/choose)
for reproducible reports and ideas. Follow the [code of conduct](CODE_OF_CONDUCT.md).
Report security vulnerabilities through the [private channel](SECURITY.md).

## Workspace and startup

Use the owner-designated local Git checkout outside synced Documents/iCloud folders.
Preserve existing work. Personal absolute paths, recordings, account profiles and
credentials do not belong in tracked source, documentation or test artifacts.
Scratch work belongs in the ignored `.codex-work/` directory. Reference repositories
remain read-only unless a coordinated change is explicitly authorized.

Use Node **24 LTS**, at least `24.15.0`, and Yarn **4.10.3** from package.json.
Pinned vendor archives avoid an additional private registry login; they do not
replace native assistant installation or account sign-in.

```sh
yarn install --immutable
yarn start
```

`yarn start` builds the renderer/native host before launching Electron.
`yarn start:built` opens an existing build. No product HTTP server or database service
is required. See [architecture](docs/architecture/README.md) for source owners.

## Implementation

Agents apply the repository's [Resonanz Architect](.agents/skills/resonanz-architect/SKILL.md)
and the shared Architecture base pinned in `skills-lock.json`. Keep project guidance
in the derived skill; update the imported base through the Skills CLI rather than
editing it. `yarn verify:skills` checks the lock, inherited content and references
offline. It requires Python 3 and Node, with no third-party Python packages.

Use standalone OnPush Angular views, Signals, focused presenters and public Mosaik
APIs. Keep markup, TypeScript and SCSS separate. Keep typed IPC/Zod validation
consistent and native persistence/AI outside the renderer. Synapse is the sole
installed-assistant adapter. The product uses system speech and native account
sign-in without additional API keys.

Visual components accept presentation data and emit actions; they do not own media,
AI or storage. Add interface text to both [translation tables](docs/architecture/frontend/internationalization.md).
English is the UI default. Documentation and original repository prose are English;
German catalog entries, intentional test speech and user content keep their language.

Do not edit copied Flamox files for product changes. An intentional upstream update
must update revision, paths, hashes and relevant tests together. Update vendor
archives, manifests, dependencies/resolutions and lockfile coherently. Never bypass
package resolution using a personal peer-checkout alias. Preserve complete notices.

## Verification

Run focused checks before integrated gates and coordinate one heavy job at a time.

| Command                    | Scope                                                      |
| -------------------------- | ---------------------------------------------------------- |
| `yarn verify:skills`       | Pinned Architecture base, derivation and reference links   |
| `yarn verify:vendor`       | Pinned distribution hashes                                 |
| `yarn verify:audio`        | Unchanged copied audio and generated worklet               |
| `yarn typecheck`           | Native TypeScript and Angular templates                    |
| `yarn test`                | Behavior specifications and packaging-tool tests           |
| `yarn build`               | Renderer and native bundles                                |
| `yarn test:e2e`            | Built Electron, isolated profile and synthetic media       |
| `yarn verify`              | Configured provenance/type/test/build gates                |
| `yarn package`             | Host-specific native application bundle                    |
| `yarn verify:package`      | Actual artifact against current bundles/resources/licenses |
| `yarn test:e2e --packaged` | The native artifact's actual executable                    |
| `yarn make`                | Host-supported installer/archive makers                    |

`--speech` adds an intentional audible reading check with an installed system voice.
`node tools/verify-windows-speech.mjs` directly compiles the supplied Windows bridge,
synthesizes a WAV and, when a matching language is installed, transcribes it. Missing
recognition capability is recorded explicitly.

Use controlled, task-owned data and profiles. Stop and clean up only task-owned
helpers. Account-free checks do not initiate personal login/inference. Physical
microphone, native speech, account inference and each OS need separate evidence in
[verification](docs/project/verification.md). Add meaningful specs beside their
production owners; avoid tests that merely repeat source/style text.

## Pull requests and distribution

Before creating a PR, run the repository's local Ship-it review when available and
resolve blocking findings first. Never claim a review that did not run. The PR
should lead with the final user-visible behavior, relevant validation and material
remaining limits. Keep implemented behavior, target scope and pending verification
distinct in documentation.

Original contributions use [MIT](LICENSE). Upstream sources retain full attribution.
The root workspace stays `private: true`; public GitHub visibility does not authorize
npm publication, deployment or a release. See [distribution](docs/project/distribution.md).
