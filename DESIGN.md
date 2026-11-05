# Resonanz interface foundations

The existing Angular desktop interface uses Mosaik Soho and the owner-approved
warm theme exported in [resonanz-soho.ts](resources/themes/resonanz-soho.ts).
Both light and dark modes retain its Georgia typography, beige surfaces, layout
and shape values. The primary brand color is the exported wine red `#a94752`.

## Application artwork and session actions

The native application artwork uses the existing Resonanz wave mark on a wine-red
macOS squircle, with a smooth gradient, a restrained highlight and an inset edge.
[The icon generator](tools/generate-app-icons.mjs) owns SVG, PNG, ICNS, ICO and
favicon outputs. The renderer's brand tile loads the same generated SVG. Native
tray templates retain their monochrome glyph and recording/pause indicators.

Session rows use a full-width Mosaik Button beside a separate plain Mosaik
ToggleButton. Pointer activation, Enter and Space open the session; focusing the
row still selects its preview. Favorite state uses the public outline/filled star
icons and the requested yellow, declared once as `--resonanz-favorite-color`.
It changes no semantic warning palette or application theme.
During a pending save the toggles are inert. The installed Mosaik Checkable setter
ignores controlled state writes while disabled, so using `disabled` for that
temporary guard can leave the control out of sync with persisted session data.
Inert blocks repeated pointer/keyboard actions while allowing the checked binding
to follow the durable result.

The official Mosaik MCP supplied `toggle-button`, `button`, the Angular guide and
Studio authoring rules. Catalog searches for `library` and `favorite` returned
marketing, commerce and CRM examples; none matched the existing native session
library, so its layout remains the source. This is framework code, not a Studio
IElement tree; Studio tree validation is inapplicable. Native acceptance evidence
and its limits are recorded in [verification](docs/project/verification.md).

The framework checker does not count Mosaik tags. Its review of the changed
templates finds one existing native `details` session menu, whose surrounding
menu lifecycle is outside this icon/row/favorite change. It introduces no new
native controls. The new row and favorite actions use the actual typed Mosaik
Angular components; the existing menu container is retained as a scoped review
exception rather than expanding this task into a menu migration.
Manual source counting finds 42 Mosaik tags across the three reviewed templates.
