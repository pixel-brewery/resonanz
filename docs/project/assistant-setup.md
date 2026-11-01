# Assistant setup

Resonanz uses installed Codex or Claude Code through Synapse. No additional API
key, paid speech endpoint or cloud speech fallback is part of the product.
Native speech recognition and speech output come from the operating system.
The CLI may contact its provider for inference; a local process is not a promise
of offline inference.

## Connect an account

1. Install the assistant CLI yourself and open **Settings → Assistant**.
2. Select Codex or Claude Code. Resonanz checks the selected installation/account.
3. Start an advertised browser or device-code sign-in method explicitly.
4. Complete its correlated native interaction. Credentials remain in the assistant's
   private profile; the renderer receives no credential-store access.
5. Select an advertised model or leave the assistant's default. Use **Test assistant**
   for a bounded request without session content.

Advanced settings include a local account identifier, optional executable path and
optional model. Changing the account cancels owned sign-in operations and invalidates
old status. Delayed events from another account cannot complete the current login.
Resonanz never silently imports global CLI credentials or initiates sign-in on launch.

A detected executable, saved selection, authenticated status and successful inference
are separate states. Missing installations and failed checks remain visible. A failed
provider request is never replaced with a fixture answer.

## Context and language

Analysis and questions use session text; audio files remain local. Transcript-only
questions exclude markers and previous marker-based continuation context. Including
markers is a separate explicit choice. New analyses and session answers request the
current interface language. Previously saved text remains unchanged when switching
languages. Spoken conversation follows its editable conversation instructions and
participant language; its recognition locale and native voice are separate settings.

Native CLI conversation histories can outlive a Resonanz session. Deleting the app
session is not a promise to delete provider-side or native assistant histories.

See [Synapse architecture](../architecture/local-assistants/README.md) and
[verified account/runtime evidence](verification.md).
