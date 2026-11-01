# Resonanz theme

The owner-approved [Theme Editor](https://beta.mosaik.breadstone.de/tools/theme-editor)
export is kept in [resonanz-soho.ts](../../../resources/themes/resonanz-soho.ts).
It retains the public Soho component anatomy and supplies complete light/dark
schemes, palettes, typography, layout, elevation and motion values. Its warm beige
surfaces and Georgia serif base replace the original handoff's monochrome palette.

`ResonanzTheme.ts` exposes these values as Mosaik's typed `ThemeOverride`. Both
workspace and passive-mini bootstraps pass the same overrides to `provideTheme`.
The appearance service still selects the stored light/dark/system preference.
The native initial window background uses the same portable exported scheme.

The captured export uses body sizes 16/14 px, 14 px buttons and compact section
titles. Custom visualizations consume `--mosaik-font-family` while keeping their
own dimensions and tabular numeric alignment. Georgia is an installed system font;
no new font service, font download or bundled font was introduced. The exported
supporting role retains its explicitly exported Inter/system fallback.

Custom filled controls use the matching palette's step-zero on-color for their
content. A scheme surface is an elevated neutral background and becomes brown in
dark mode; it must not substitute for the on-color of a rose primary fill. The
digest's inverse play control and progress marks use the same primary on-color.

The public Mosaik MCP supplied its schema, examples and generation guide. Its
legacy Style Dictionary validator disagrees with the current Theme Editor's
contrast-aware step-zero colors and generated dark palettes. The actual export
was preserved rather than changed to satisfy those older palette assumptions.
Type checking against the installed public API and rendered light/dark application
checks establish the supported runtime contract; the remote validation was not a
passing gate. See the [verification record](../../project/verification.md) for the
checks actually completed.
