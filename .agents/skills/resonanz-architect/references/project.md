# Project contract and working environment

Read root [AGENTS.md](../../../../AGENTS.md), [README](../../../../README.md) and
[documentation index](../../../../docs/README.md) before changing behavior. Current
contracts, executable configuration, installed public APIs and observed runtime
behavior resolve stale documentation. Follow the relevant feature guides linked
from this skill rather than importing another project's product assumptions.

## Scope and composition

Resonanz is an Electron tray application for recorded sessions, transcript-based
analysis/questions and actual spoken conversation on macOS and Windows. Its keyless
path is system recognition/output plus an authenticated installed Codex/Claude CLI
through Synapse. CLI execution can use the provider's network; it is not a promise
of offline inference. No additional paid audio API, API-key setup or cloud speech
fallback belongs in this product.

Apply the inherited workflow to the requested outcome. Delegate independent work
with disjoint ownership using the active client's subagent tools when available;
keep dependent decisions and shared writes coordinated. Run only one heavy
install/build/typecheck/test job at a time across the team. Delegation does not
authorize new chats, extra checkouts, external writes or a broader product change.

Reference checkouts of Symphony, Synapse and Mosaik remain read-only unless
a coordinated change is explicitly authorized. Use them to inspect an established
pattern; normal installation/runtime and ordinary skill use must work without
them. Read the relevant provenance before touching copied material or vendor
archives and preserve [complete notices](../../../../THIRD_PARTY_NOTICES.md).

## Source conventions

- Use strict TypeScript and explicit public interface contracts; interfaces use
  `I` names and private fields use `_` names. Keep public exports explicit.
- Follow the owning files' member/region structure. Keep imports contiguous and
  use focused constructor injection and explicit composition at native/library
  boundaries; Angular uses its supported injection/lifecycle APIs.
- Keep abstractions at real substitution or ownership seams. Pure projections and
  calculations can remain functions. Do not add framework decorators or pattern
  scaffolding to a framework-neutral owner.
- Add concise English TSDoc to changed public contracts and non-obvious behavior.
  Match adjacent source/spec basenames and preserve supplied upstream files.
- Repository documentation and original technical prose are English. German
  translation assets, intentional speech fixtures and user content retain their
  language.

## Local execution

Resolve the designated checkout root through Git and preserve existing edits. Use
its ignored `.codex-work/` for scratch, helper scripts, test profiles, logs and
verification artifacts. Do not create copies/worktrees or scratch files in system
temporary, Documents or synced directories. Electron Packager's task-owned staging
exception is the sibling `.resonanz-package-staging/` described in `AGENTS.md`.

Use the toolchain in [package.json](../../../../package.json) and
[.nvmrc](../../../../.nvmrc), Yarn and configured Nx targets. Do not add another app,
service, browser profile or provider process for convenience. Inspect task-owned
processes before starting helpers, and stop/confirm their cleanup afterwards while
preserving unrelated processes and user data.

Do not automatically install/update assistant CLIs, initiate native login, import
global credentials, change account configuration, publish, deploy or release.
Capture and native authentication remain explicit user actions. Neither a generic
shared backlog instruction nor this skill grants issue/message/PR authority.
Existing session authorization still applies; do not request it again unnecessarily.

## Completion

Run the checks justified by the affected owners using [Verification](testing.md).
Keep product workflows under `docs/project` and technical behavior under the
relevant `docs/architecture` feature. Update README prerequisites/startup when they
change. Maintain [verification evidence](../../../../docs/project/verification.md)
when actual evidence or a remaining requirement changes; do not inflate it with
an unperformed runtime claim.

Before an authorized PR, run the repository's local Ship-it review when available
and resolve blocking findings. The standing owner instruction authorizes that
review. Report only checks actually run and their limits. A build, fixture, typed
boundary or executable discovery does not establish real recording, system speech,
account inference, another OS or release readiness.
