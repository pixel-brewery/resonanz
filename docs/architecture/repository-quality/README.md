# Repository quality and planning

## Current implementation

The repository's [project board](https://github.com/orgs/pixel-brewery/projects/9)
tracks confirmed work through Backlog, Qualified, Ready, Progress, Acceptance and
Done. It is linked to the repository; existing open issues and pull requests were
added during the 2026-11-01 alignment. New work must be added to that board when
it is recorded. A project link does not imply automatic intake of future issues.

Active GitHub rulesets protect `main` against deletion and force pushes, require
pull requests with resolved review conversations, and require the current macOS
and Windows desktop checks from GitHub Actions. Branches must include the current
base revision before merging. No human or administrator bypass was added.
Independent approval is not mandatory for this owner-maintained repository.
The dedicated release App alone may bypass the PR/check rule to publish verified
metadata commits and tags. History protection retains no bypass.
Version tags matching `v*` also have active deletion protection without bypasses,
matching the other three product repositories.

The source revision adds a stable `Quality Gate` job to
[the desktop workflow](../../../.github/workflows/ci.yml). It depends on the full
macOS/Windows verification matrix and executes even when an upstream job fails,
is cancelled or is skipped. Only an upstream result of `success` passes. The gate
has no repository token permissions and does not check out source. Pull requests,
pushes to `main`, merge queues and manual runs use the same workflow.

Each platform installs the locked dependencies, checks formatting, verifies skill
and vendor/source provenance, checks public content, checks types, runs behavior
tests, builds the application, exercises the built desktop app, packages it,
verifies the package and exercises the actual packaged executable. Windows also
checks its native speech integration. Controlled fixtures do not establish real
microphone, personal assistant-account or release readiness.

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

The existing required check names are:

- `Build and exercise desktop (macos-latest)`
- `Build and exercise desktop (windows-latest)`

The new `Quality Gate` becomes eligible as a required GitHub Actions check only
after the workflow revision is published and has executed. Until then, the two
existing substantive checks remain mandatory. Add the new check to the active
status-check ruleset after observing its exact name and expected GitHub Actions
source; retain the platform checks during this rollout. Do not require an
unpublished check that cannot report a result.

Acceptance requires inspecting the effective rules for `main`, the linked board
and its saved board layout, plus a successful remote run of this workflow
revision. Local source verification and a configured remote rule are separate
evidence. Desktop quality CI verifies artifacts; the separate
[distribution workflow](../distribution/README.md) owns release publication.
