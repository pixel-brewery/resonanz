# Internationalization

Resonanz follows the established Mosaik translation pattern, inspected at upstream revision
`a9d5dd25487b9f040cd8107c9968294112e8e972`: flat language tables, a registry,
`provideTranslationRegistry`, `provideTranslations` and a signal facade around the
public TranslateService. The upstream generated TypeScript catalog layer is unnecessary
for two bundled JSON tables; Resonanz imports the JSON directly into its typed registry.
The pinned Mosaik 0.1.183 pure TranslatePipe caches unchanged keys across language
changes. Resonanz supplies a reactive renderer pipe over the same public service;
the supplied translation implementation remains unchanged. No runtime HTTP catalog loader or additional translation framework is introduced.

## Source owners

- `libs/intl/src/assets/i18n/lang.en.json` and `lang.de.json`: application text.
- `lang.registry.ts`: both tables and the shared language/key types.
- `libs/intl/src/translate.ts`: portable native formatting and stable message-key lookup.
- `apps/renderer/src/services/TranslateFacade.ts`: Mosaik service, reactive language,
  locale and number formatting.
- `LanguageService`: applies the saved setting to Mosaik without remounting views.
- `MessagePipe`: resolves application-owned message keys and preserves external prose.

ShellConfig registers both Angular locales and initializes Mosaik in English. The
optional `settings.uiLanguage` is `en` or `de`; missing/unsupported legacy values
resolve to English. Settings saves this preference independently, including during
capture. Main updates native menu/dialog labels from the same tables.

## Adding text

Use stable `loc.resonanz.<feature>.<name>` keys in both catalogs. Use the renderer TranslatePipe
for static keys and TranslateFacade for computed text. Interpolation uses Mosaik's
positional `{0}`, `{1}` placeholders. Translate whole phrases rather than joining
language-dependent fragments. Catalog tests check key parity, non-empty values and
matching placeholders. Date/number formatting uses the current interface locale.

## Catalog tooling and CI

The public `@pixel-brewery/wortlaut-nx-tasks` package supplies the `resonanz:intl`
target. The root `project.json` owns the Angular preset, English base locale,
English/German JSON resource path and `loc.resonanz` key prefix. The default
`analyze` configuration is read only. `yarn intl:analyze` rejects duplicate keys,
empty values and different key sets with explicit error severities. `yarn check:intl`
remains its compatibility alias. `yarn verify:code` runs this gate locally and in
the required desktop CI and release checks.
Before analysis, a tested file preflight derives expected locales from the same
Nx target and rejects missing or empty catalogs, invalid JSON shapes and duplicate
JSON members. This closes cases that the published 0.2.4 reader can skip before
analysis and does not implement another translation analyzer.
The pinned bundled `message-checks` rule pack additionally rejects changed
placeholders and malformed ICU messages. Its declarative contents and hashes are
committed in `.wortlaut/rule-packs/message-checks/` and `wortlaut.lock.json`.
The existing portable catalog tests additionally enforce positional placeholder
parity and native formatting behavior.

`yarn intl:lint` applies Wortlaut's ESLint resource rules to both JSON catalogs.
`yarn intl:references` checks complete literal `loc.resonanz.*` keys in authored
TypeScript and templates against both catalogs. The portable catalog tests and
typed registry also cover runtime formatting and key parity.

`yarn nx run resonanz:intl:detect` previews source findings without applying them.
`yarn intl:sort` explicitly sorts the JSON catalogs through the same Wortlaut
target. Runtime imports remain the bundled JSON catalogs and their typed registry.

Wortlaut and its transitive tooling packages are installed from GitHub Packages.
Source contributors need a token with package-read access in `GITHUB_TOKEN`;
native CI uses its read-only package permission for dependency installation.
This development prerequisite does not introduce a runtime credential or change
assistant-account authentication.

Application-owned errors cross IPC as stable catalog keys. Resolve them for display;
external provider/system messages remain verbatim. Do not translate a transcript,
user title, native challenge, credential field or stored answer by guessing its prose.

## Separate language domains

`uiLanguage` changes interface text. `locale` selects speech recognition, `voice`
selects output and `conversationInstructions` remains editable user content. Switching
UI language never rewrites those preferences or saved session content. New analyses
and session answers request the current UI language. Spoken turns follow participant
language and conversation instructions. German translation assets are intentional;
repository documentation and original technical prose remain English.
