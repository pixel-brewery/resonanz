# Decisions and follow-up work

Updated 2026-10-31. Current code and verified behavior take precedence over older plans.

| Area               | Decision                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Product            | Resonanz: explicit recording, transcript-based analysis/questions and native spoken conversation |
| Desktop            | Electron with a tray/menu-bar lifecycle on macOS and Windows                                     |
| Frontend           | Standalone Angular, OnPush, Signals, presenters and public Mosaik/Soho APIs                      |
| Design             | Supplied Resonanz handoff; reusable ring, waveform, landscape, marker and evidence components    |
| Interface language | English default; English/German Mosaik translation tables; saved choice without restart          |
| Documentation      | English throughout the repository; localized catalogs and user content retain their language     |
| Process boundary   | Renderer → typed preload → Main → supervised Utility                                             |
| Assistants         | Synapse and installed Codex/Claude Code with explicit private native account profiles            |
| Speech             | Operating-system recognition/output; no extra API key or cloud speech fallback                   |
| Audio              | Unchanged Flamox primitives, with Resonanz host composition outside the copied set               |
| Persistence        | Versioned JSON session documents and an ordered append-only audio journal                        |
| Evidence           | Actual transcript segment IDs and bounds; invalid/unknown model references remain unverified     |
| Library threads    | Validated per-session topic evidence grouped by stable keys; exact tags for legacy analyses      |
| Mini recorder      | Passive native floating window; bounded projection and actions, one workspace capture owner      |
| Packaging          | Pinned distributable archives, complete attribution and host-specific native verification        |
| Source visibility  | Public GitHub repository, MIT; workspace stays private for package publication                   |

The JSON store deliberately differs from Symphony's broader persistence. A future
migration must preserve session identities, audio journals, questions and complete
native continuation bindings. Reference repositories remain read-only.

## Evidence

The original prototype has separate real macOS Codex, speech, stereo archive and tray
evidence, plus controlled native package checks on macOS and Windows. The redesign
and language changes need their own source/package evidence; they do not inherit a
claim of new physical microphone or Claude-account verification. See
[verification](project/verification.md).

## Pending decisions

- Trusted signing/notarization, installer releases, supported architectures and updates.
- General system audio capture and automatic speaker separation.
- Longer-session/device coverage and additional recognition languages.
- Whole-library topic/question inference, larger-catalog projections and long-recording splitting.
- Cleanup/retention of native assistant histories in addition to local app sessions.
