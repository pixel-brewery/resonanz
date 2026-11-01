# Frontend reference decisions

| Reference                                            | Choice            | Resonanz composition                                                      |
| ---------------------------------------------------- | ----------------- | ------------------------------------------------------------------------- |
| Angular OnPush, Signals, Signal Forms and presenters | Adopt             | Same framework patterns as Symphony with typed Mosaik fields              |
| Mosaik, Soho and Reicon                              | Adopt             | Public packages and theme APIs; owner-approved serif/token customization  |
| Recording, PCM, player and TTS                       | Adopt             | Original hashes/specs; one documented PCM processor identifier rename     |
| Translation tables and Mosaik registry/facade        | Adapt             | English/German, English default and typed settings persistence            |
| Shell/workspace                                      | Adapt             | Sessions, voice, favorites and collections                                |
| Native persistence/integration                       | Adapt             | Validated preload/Main/Utility boundaries                                 |
| Spoken conversation                                  | Adapt             | System speech and Synapse native sign-in, without cloud audio credentials |
| Live archive                                         | Adapt             | Microphone and actually played native clips on separate channels          |
| AI ownership                                         | Adapt             | Same native assistant for live turns, analysis and questions              |
| Brand and visualizations                             | Resonanz-specific | Supplied handoff and generic ring/waveform/evidence components            |
| Credits, tenants and Git delivery                    | Omit              | Outside this recording product's scope                                    |

See [audio provenance](audio/README.md), [frontend](frontend/README.md),
[internationalization](frontend/internationalization.md) and
[runtime verification](../project/verification.md).
