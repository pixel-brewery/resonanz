# Resonanz-Bildmarke

Die Bildmarke verbindet einen zentralen Klangimpuls mit zwei Paaren von
Resonanzbögen. Das monochrome Zeichen bleibt auch im Systemtray lesbar.

`resonanz-mark.svg` ist die editierbare Quelle. `yarn icons` erzeugt daraus die
Anwendungsikone im hellen Squircle, PNG-Größen, monochrome Tray-Vorlagen mit
Aufnahmezustand sowie die nativen ICO- und ICNS-Container. Die Formate und
Container folgen der bestehenden Symphony-Pipeline; die Rasterisierung erfolgt
ohne zusätzliche Browserinstanz mit Sharp.

Die Anwendung verwendet dieselben erzeugten Dateien für Fenster, Dock, Tray und
Installationspakete. Die produktbezogene Bildmarke wird nicht in Mosaiks globale
Icon-Sets aufgenommen.
