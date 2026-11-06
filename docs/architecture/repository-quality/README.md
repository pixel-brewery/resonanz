# Repository quality and planning

## Current implementation

The repository's [project board](https://github.com/orgs/pixel-brewery/projects/9)
tracks confirmed work through Backlog, Qualified, Ready, Progress, Acceptance and
Done. It is linked to the repository; existing open issues and pull requests were
added during the 2026-11-01 alignment. New work must be added to that board when
it is recorded. A project link does not imply automatic intake of future issues.

Active GitHub rulesets protect `main` against deletion and force pushes, require
pull requests with resolved review conversations, and require the current macOS
and Windows desktop checks plus `Quality Gate` from GitHub Actions. Branches must
include the current base revision before merging. No human or administrator bypass was added.
Independent approval is not mandatory for this owner-maintained repository.
The dedicated release App alone may bypass the PR/check rule to publish verified
metadata commits and tags. History protection retains no bypass.
Version tags matching `v*` also have active deletion protection without bypasses,
matching the other three product repositories.

The source revision keeps a stable `Quality Gate` job in
[the desktop workflow](../../../.github/workflows/ci.yml). It depends on change
classification and the macOS/Windows check matrix, and executes even when an upstream job fails,
is cancelled or is skipped. Only successful classification with an explicit documentation decision
and a matrix result of `success` pass. The gate
has no repository token permissions and does not check out source. Pull requests,
pushes to `main`, merge queues and manual runs use the same workflow.

For code or mixed changes, each platform installs the locked dependencies,
prepares the pinned Electron binary through `yarn exec install-electron --no` and
runs `yarn verify:code`. That command covers full formatting, ESLint, Mosaik toggle
contracts and theme projection drift, Wortlaut analysis and catalog lint, literal
translation references, public content, skill and source provenance, types,
behavior tests and production builds. The workflow then runs built-app E2E,
packages the app and installers, checks package contents and runs packaged E2E.
Windows also checks its native speech integration.

Local `yarn verify` runs `verify:code`, `e2e`, `package:smoke` and `e2e:packaged`
in sequence on a supported desktop host. `package:smoke` builds and checks an
unpacked bundle. E2E creates a separate task profile for each run and exercises
synthetic media. Physical media, personal account inference and installation
require their own evidence.

The release platform build uses the same explicit runtime preparation. Electron's installed package has no
postinstall binary hook; its documented `install-electron` bin performs that setup before native checks.
Running it directly preserves installer diagnostics and avoids relying on the first desktop launch to prepare
its executable. Package versions, artifact checksums and required checks remain unchanged.

## Documentation changes in this source revision

The dependency-free classifier compares every changed path before installing dependencies. Pull
requests compare their merge base with the proposed head; merge groups compare the event's exact
base and head; pushes compare the complete previous/next range. NUL-separated paths preserve
unusual filenames, and disabled rename detection includes both a removed source and its destination.
Moving runtime code into a documentation path therefore still requires full verification.

Only an all-documentation diff takes the short path. Allowed prose extensions are `.md`, `.mdx`,
`.markdown`, `.rst`, `.adoc` and `.asciidoc`; text files qualify under `docs/` or as `README*.txt`.
Root `LICENSE`, `NOTICE` and `COPYING` notices, optionally with `.txt`, also qualify. Static
`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp` and `.svg` images qualify under `docs/` and `.github/assets/`.
GitHub configuration otherwise requires full verification. Agent/provider instruction adapters,
operational agent/editor/design-sync directories and skill/prompt directories remain executable
inputs even when written in Markdown. Unknown files, mixed changes, empty comparisons and manual
runs require full verification. An unreadable Git comparison fails classification and the gate.

Documentation changes still run the public-content guard. Both required platform names are emitted
by short Ubuntu matrix jobs that only explain the skipped formatting, tests, builds, native speech
and packaging checks; these jobs make no platform-verification claim. Every existing verification
step, including evidence uploads, requires an explicit full-verification result. The aggregate gate
accepts the documentation path only after successful classification/public-content checks and both
successful named jobs; failure, cancellation, missing decisions or skipped matrix jobs fail it.

The stable names preserve compatibility with the current remote ruleset. Successful execution of
this workflow revision on GitHub remains separate acceptance evidence from these local changes.

## Public-content contract

`yarn verify:public-content` rejects the excluded private project identifier,
regardless of ASCII letter case or suffix, in tracked and new nonignored source
paths and content. It also checks decoded gzip payloads, including vendored npm
tar archives, so compressed comments cannot bypass the check. UTF-8 and UTF-16LE
content are covered. Deleted tracked files are tolerated, force-tracked ignored
files remain covered, and ignored local profiles, caches and existing output
artifacts are outside this source check.

The check runs within `yarn verify`; adjacent Node behavior tests cover source
discovery, compressed content, text encodings and command failure. A failure
identifies the affected file without repeating private source content.

Copied source and vendored-package adaptations retain their original commit or
archive digest, an explicit modification description and the current digest.
License text remains intact. Updating an archive also requires refreshing the
Yarn lockfile with the declared package manager and verifying an immutable
installation. The source check does not rewrite Git history or old local output.

## Remote activation and acceptance

The active required check names are:

- `Build and exercise desktop (macos-latest)`
- `Build and exercise desktop (windows-latest)`
- `Quality Gate`

`Quality Gate` was added to the active status-check ruleset after its successful
execution in [desktop CI run 41291030041](https://github.com/pixel-brewery/resonanz/actions/runs/41291030041).
All three checks are bound to the GitHub Actions integration; the platform checks
remain mandatory. Future check-name changes require observing the replacement
check before updating the ruleset so an unpublished check cannot block merging.

Acceptance requires inspecting the effective rules for `main`, the linked board
and its saved board layout, plus a successful remote run of this workflow
revision. Local source verification and a configured remote rule are separate
evidence. Desktop quality CI verifies artifacts; the separate
[distribution workflow](../distribution/README.md) owns release publication.
