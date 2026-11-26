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

## Dependency updates and continuation

All npm and GitHub Actions update types, including majors and TypeScript, use the
complete existing verification and protected merge rules. Published Mosaik and
Synapse families are grouped. Their versions are declared directly as `0.1.183`
and `0.0.3`, respectively, with registry integrity in `yarn.lock`; no file override
can make an updated manifest keep installing an older archive.

The canonical owner is the private `repository-tasks:dependabot` Nx executor in
`tools/nx-plugins/repository-tasks`. It requires all four actual `Desktop quality`
jobs: classification, both native platforms and Quality Gate.

The privileged controller executes only the trusted default-branch Nx owner,
without installing workspace dependencies or executing PR code or PR artifacts.
Its `merge`, `reconcile`, `authorize` and `continue` operations are non-cacheable.
Branch refresh and merge have Contents/PR write with Actions read. A separate
`authorize` job has only Contents read, PR read and Actions write. It approves
workflow execution through GitHub's native run-approval endpoint; it creates no
PR review, status, check or branch-rule exemption.

Reconciliation after verification/release completion and hourly checks bounded
same-repository bot inventories. A stale branch uses `expected_head_sha` and waits
for the replacement. Only real `pull_request` CI is merge proof. If it is waiting
for execution approval, the isolated authorizer verifies the exact Dependabot or
GitHub Actions service identity of both run actors before one approval request.
A missing native run remains pending. Manual diagnostic `workflow_dispatch` runs
remain available but cannot satisfy protected PR checks or shadow a native run.
Conflicts, real failures and rejected approvals retain the affected PR and attempt.

For every approval and merge, M is current protected main, B the unchanged bot
head, and C GitHub's actual `refs/pull/<number>/merge` commit. The owner checks
unique own-repository PR association, M as ancestor of B, C's ordered parents
[M, B] and C's tree equal to B. Source blobs are verified by Git object digest.
Only the fixed reviewed read-only CI baseline in trusted-main
`verificationPolicy.reviewedCiSha256` authorizes execution: its normalized main
SHA-256 must match that constant, and normalized PR CI must equal normalized main.
Normalization changes only full 40-character action pins with the same action
owner/path and optional SemVer comments. CI logic, scopes, secrets or syntax edits
require a conscious read-only review and explicit policy-digest update; no runtime
or PR input learns a new baseline. This positive review proof does not rely on a
partial YAML parser.

The latest eligible native run is selected independently of diagnostics and its
actual current `run_attempt` is reloaded. All actual jobs must succeed. Ordinary
maintainer-triggered native CI on the bot PR is valid after the same complete
source proof. A later reconciliation re-enters the full merger after a transient
skip, never a reduced path. Workflow/run/PR/M/B/C/protection are re-read immediately
before the ordinary SHA-guarded squash request. GitHub's strict required checks
remain the final merge authority; the actual closed, merged PR is then confirmed.

Confirmed merge outputs from either reconciliation or the CI event reach a
separate continuation job. Recovery resolves the current main commit association
and reads the full PR with `merged: true`; missing confirmation starts nothing.
Main verification receives `expected_head_sha`, and the existing patch release
retains `source_sha`. Existing exact-source main `push` or `workflow_dispatch` runs
are retained in every state, including queued, failed and cancelled. Diagnostic
branch runs do not suppress them. Every new request rechecks current main; a
superseding revision stops it. Interrupted requests can therefore be retried
without merging twice or preparing a duplicate release. Failed releases retain
their original source and artifact instead of receiving a blind new dispatch.

The documentation continuation keeps Pages' original workflow/site/artwork/icon
push paths, includes renamed previous paths, and supplies `expected_head_sha`.
Unrelated dependency changes do not deploy Pages. Both selected and current-main
revisions are checked before deployment. The release App/environment and existing
publication owner remain unchanged.

Runtime, declarations, licenses and parsed manifests of all twelve migrated
packages match the former distributions. Synapse manifests differ only in JSON
formatting; one themes development-generator comment differs. The documentation
generator is not copied to public source or application packages: Forge's closed
runtime allowlist retains only the three native speech packages, while Mosaik and
Synapse runtime code is bundled. Package verification checks that allowlist and
compares emitted bundles/resources with the actual current build. Registry
metadata changes peer-optionality warnings; it does not introduce a runtime
version upgrade or local dependency patch.

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

Copied audio source retains its original commit, explicit processor-identifier
adaptation and current digests in its dedicated provenance manifest. Published
dependencies use the declared registry versions and immutable Yarn integrity;
complete supplied license text remains intact. Local dependency patches and file
overrides are not part of the installation contract. The source guard still
checks any tracked archive and does not scan ignored installed dependencies,
rewrite Git history or clean unrelated old local output. Distribution privacy is
also enforced by the closed packaged-runtime allowlist.

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
