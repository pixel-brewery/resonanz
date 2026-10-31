# Sicherheitsmeldungen

Bitte melde Sicherheitslücken über die aktivierte
[private GitHub-Meldung](https://github.com/pixel-brewery/resonanz/security/advisories/new).
Veröffentliche Exploitdetails, Zugangsdaten, Anmeldelinks oder persönliche
Gesprächsinhalte nicht in öffentlichen Issues oder Pull Requests.

Hilfreich sind die betroffene Version beziehungsweise der Commit, Betriebssystem,
CLI-Version, eine minimale Reproduktion mit künstlichen Daten und eine
Beschreibung von Auswirkung und erwartetem Verhalten. Bereits veröffentlichte
Zugangsdaten bitte zuerst beim jeweiligen Anbieter widerrufen.

## Betroffener Bereich

Resonanz verarbeitet Mikrofonaufnahmen, lokale Sessiondateien und die native
Kontoanmeldung installierter KI-Assistenten. Relevante Meldungen betreffen etwa
Dateizugriff und Import/Export, die Renderer-/Host-Grenze, Profiltrennung,
Prozesslebenszyklen oder den Umgang mit Aufnahmen und Zugangsdaten.

Der Renderer besitzt keine Node- oder allgemeinen Dateisystemrechte. Native
Operationen laufen über validierte Verträge; Assistentenanmeldung und Inferenz
bleiben bei Synapse und der jeweiligen CLI. Diese Grenzen und ihre aktuellen
Nachweise stehen in der [Architektur](docs/architecture/README.md) und
[Abnahme](docs/project/abnahme.md). Bestandene Tests sind keine pauschale
Sicherheitsgarantie.

## Unterstützter Stand

Resonanz befindet sich im Prototypstadium. Bitte beziehe Meldungen auf den
aktuellen Hauptbranch oder benenne den geprüften Commit ausdrücklich. Eine
Wartungszusage für ältere Versionen oder feste Reaktionsfristen ist noch nicht
festgelegt. Schwachstellen eines externen Dienstes oder einer nativen CLI sollten
zusätzlich über den Meldeweg des betreffenden Anbieters gemeldet werden.
