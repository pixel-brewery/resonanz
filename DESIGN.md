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
After each save attempt, the view also reconciles the public ToggleButton checked
property with the current session owner. This restores a rejected change even
when the unchanged Boolean input would not trigger another Angular binding write;
disconnected controls and a different current session are guarded.

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

## Ring chapter controls

The Ring retains the same Soho foundations, warm light/dark surfaces, Georgia
typography and wine-red primary. Its chapter titles use bounded Mosaik Button
pills with a chapter-color dot, a single ellipsized line and a full-title Mosaik
Tooltip. Selection uses the theme's inverse foreground/background pair. Keyboard
focus stays local to the button and uses the wine-red primary; an oversized
focusable SVG group no longer includes the label's invisible layout rectangle.

The measured square determines which controls fit. Titled pills leave the central
context clear. Numbered bubbles replace titles when they collide, and a public
Mosaik Select exposes every chapter when even numbered controls cannot fit.
Actual marker hit areas participate in collision checks. In Select mode a separate
header strip keeps the picker away from the ring's top markers. Focus follows an
owned chapter control across these modes without taking focus from another pane.
The ring continues to render the session's original chapters and audio geometry.

The official Mosaik MCP supplied `tooltip`, `button` and `select` documentation.
Timeline recipe searches returned changelog, history, order-tracking and release
examples; none matched a circular audio visualization. The existing Ring remains
the diagram owner, composed with public Angular controls. This framework template
is not an IElement tree. Checker results and actual native interaction evidence
are recorded in [verification](docs/project/verification.md).
The framework checker reports zero errors, warnings and exceptions for the
RadialTimeline template; manual source counting finds five Mosaik tags.
In the installed composite Select/Tooltip, Select consumes Escape before the
Tooltip's anchor listener receives it. Native acceptance reproduced the open
hover tooltip. RadialTimeline controls the public Tooltip `isOpen` property and
dismisses its own tooltip state from a lifecycle-cleaned capture listener, without
preventing the Select's ordinary Escape action. No vendored component is changed.
The same native check exposed Select clearing its internal value on closed Escape.
A native `change` handler restores only a rejected null value from the current
chapter owner, leaving new valid chapter choices and dropdown closing intact.
