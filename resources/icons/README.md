# Resonanz brand mark

The central acoustic pulse and two pairs of arcs form a monochrome mark that remains
readable in the tray. `resonanz-mark.svg` is its editable source.

`yarn icons` creates the macOS-style wine-red application tile, PNG sizes, monochrome tray
variants, recording/paused indicators, light/dark attention badges and native ICO/ICNS containers.
Its gradient uses the exported Resonanz primary palette; the inset edge, soft highlight
and raised white mark keep the artwork recognizable at native sizes. The favicon and
in-app brand tile share the generated artwork. The formats
follow Symphony's pipeline; Sharp rasterizes without another browser instance.

The app uses these generated assets for its window, dock, tray and native bundles.
The product-specific glyph is not added to Mosaik's global icon sets.
