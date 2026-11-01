# Security reporting

Report vulnerabilities through [GitHub private vulnerability reporting](https://github.com/pixel-brewery/resonanz/security/advisories/new).
Do not publish exploit details, credentials, sign-in links or private recordings in
public issues or pull requests. Revoke exposed credentials with their provider first.

Include the affected version/commit, OS, CLI version, a minimal reproduction using
synthetic data and the expected behavior and impact.

## Scope

Relevant areas include local recording/session files, import/export, renderer/host
boundaries, account isolation, process ownership and handling of native credentials.
The renderer has no Node or general filesystem access. Validated native operations
and Synapse/CLI account execution remain separate owners. See
[architecture](docs/architecture/README.md) and [verification](docs/project/verification.md).
Passing tests are not a general security guarantee.

Resonanz is a prototype. Report against current main or name the tested commit.
Older-version maintenance commitments and fixed response deadlines are not established.
External service or CLI vulnerabilities should also be reported to their respective
providers.
