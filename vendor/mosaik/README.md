# Mosaik-Distributionen

Die Archive enthalten unveränderte veröffentlichte Mosaik-Pakete der Version
`0.1.183`. Sie wurden deterministisch aus den ursprünglichen Yarn-Cache-ZIPs in
das übliche npm-Archivformat `package/` umgepackt. Paketnamen, Manifeste, öffentliche
Exports, Typdeklarationen, Lizenzen und Laufzeitdateien bleiben unverändert.

`provenance.json` dokumentiert Version, ursprünglichen Cache-Artefaktnamen,
Prüfsummen und Dateianzahl. `yarn verify:vendor` prüft die installierbaren Archive.
Abhängigkeiten verwenden die öffentlichen `@pixel-brewery/*`-Namen; es gibt keine
Quellcode-Aliase auf benachbarte Repositories. Die rootweiten Yarn-Resolutions
halten transitive Paketbezüge auf denselben Distributionen.

Dieser Weg ermöglicht die Installation des Prototyps ohne neue Anmeldung an einer
privaten Paketregistry. Aktualisierungen erfolgen als bewusster Austausch aller
zusammengehörigen Pakete einschließlich Lockfile und Prüfsummen.
