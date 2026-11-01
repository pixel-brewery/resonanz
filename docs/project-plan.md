# Resonanz project plan

Updated 2026-10-31. The [verification record](project/verification.md) distinguishes
implemented behavior, observed runtime evidence and pending requirements.

## Binding product scope

Resonanz is an Electron tray application for macOS and Windows. After an explicit
start, it records a session, creates a transcript, analyzes its content and supports
later questions. Actual spoken conversation with recognition, native assistant
inference and speech output belongs to the prototype scope.

Angular and Mosaik own presentation. Synapse owns installed Codex/Claude integration.
The product is keyless: system speech plus native assistant account sign-in. Copied
upstream recording, playback and TTS files remain byte-identical to their documented
revision; PCM processor identifiers have one explicit provenance-recorded adaptation. Symphony supplies the process/lifecycle reference.

The revised design centers the session ring, original audio, chapters, evidence,
weekly landscape and voice interaction. Each visualization is an independent,
data-driven Angular component. Interface text lives in English/German translation
tables following the established Mosaik pattern. English is the default; speech locale is
independent. Repository documentation is English.

## Delivery sequence

1. Maintain validated Renderer → Preload → Main → Utility boundaries and durable
   session/audio storage.
2. Preserve copied audio sources and integrate host-owned media composition.
3. Connect system speech, Synapse turns and archived actual assistant output.
4. Implement the supplied visual design with reusable components and real session data.
5. Support language/theme changes, organization, onboarding, native login and visible errors.
6. Verify source and native packaged workflows, then record platform/account limitations.
7. Keep the public repository, README, provenance and contributor guidance current.

A web preview, CLI demo, fixture or build alone does not complete the native product.

## Follow-up decisions

Native system audio, whole-library topic inference and larger-catalog projections,
additional platforms, diarization, automatic splitting of long recordings,
trusted public signing, installers and updates remain separate work. See
[decisions](decisions.md) and [architecture](architecture/README.md).
