# Resonanz documentation

Resonanz is a keyless Electron tray application for recording, native live conversation
and transcript-based analysis through installed Codex or Claude Code assistants.
The interface supports English and German, with English as its default.

## Product guides

- [Product workflows](project/README.md)
- [Recordings and session organization](project/recordings.md)
- [Assistant setup](project/assistant-setup.md)
- [Live conversation](project/live-conversation.md)
- [Distribution](project/distribution.md)
- [Verification and remaining requirements](project/verification.md)

## Implementation guides

- [Resonanz Architect](../.agents/skills/resonanz-architect/SKILL.md): shared
  Architecture foundations, Resonanz-specific owners and verification guidance.
- [Architecture and source owners](architecture/README.md)
- [Desktop lifecycle and IPC](architecture/desktop/README.md)
- [Angular frontend](architecture/frontend/README.md)
- [Reusable visual components](architecture/frontend/components.md)
- [Translation tables and language selection](architecture/frontend/internationalization.md)
- [Copied audio and host composition](architecture/audio/README.md)
- [Synapse and native assistant accounts](architecture/local-assistants/README.md)
- [Frontend reference decisions](architecture/frontend-reference-flamox.md)

[Project plan](project-plan.md) describes the binding scope. [Decisions](decisions.md)
records implemented choices and follow-up decisions. Executable configuration and
observed runtime behavior take precedence over older prose. A build, a fixture or
an installed CLI is evidence only for its own scope.
