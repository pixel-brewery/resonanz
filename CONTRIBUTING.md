# An Resonanz mitarbeiten

Beiträge, Fehlerberichte und Ideen sind willkommen. Verwende die
[Issue-Vorlagen](https://github.com/pixel-brewery/resonanz/issues/new/choose) und
beachte den [Verhaltenskodex](CODE_OF_CONDUCT.md). Sicherheitslücken haben einen
[eigenen privaten Meldeweg](SECURITY.md).

## Arbeitsumgebung

Verwende den festgelegten lokalen Git-Checkout außerhalb synchronisierter
Dokumenten-/iCloud-Verzeichnisse. Persönliche absolute Entwicklungs- oder
Installationspfade gehören nicht in Konfiguration, Quellcode oder Dokumentation.
Vorhandene Nutzerarbeit bleibt erhalten.

Erforderlich sind Node.js **24 LTS** ab `24.15.0` und Yarn `4.10.3`, wie in `package.json`
festgelegt. Die gepinnten `vendor/`-Archive gehören zum Checkout. Sie ersetzen
einen persönlichen Registry-Zugang für die ausgewählten Mosaik-/Synapse-Pakete,
aber weder native Assistenteninstallationen noch deren Anmeldung.

```sh
yarn install --immutable
yarn start
```

`yarn start` baut Renderer und nativen Host, bevor Electron startet.
`yarn start:built` öffnet einen vorhandenen Build. Es wird kein zusätzlicher
Produkt-HTTP-Server und keine separate Datenbank benötigt.

## Quellbesitzer und Referenzen

- Oberfläche in `apps/renderer` mit Angular und öffentlichen Mosaik-Komponenten
  umsetzen. Fachliche Sessionlogik bleibt außerhalb der View.
- Native Operationen nur über `libs/contracts` und die begrenzte Preload-API
  anbinden. Den Renderer ohne Node-Integration halten.
- Sessionfälle und dauerhafte Schreibvorgänge im Utility Process halten;
  lokale KI ausschließlich über `@resonanz/assistant`/Synapse ausführen.
- Kopierte Audioquellen nicht für Produktanpassungen verändern. Komposition und
  Desktopanpassungen gehören in die Hostadapter außerhalb dieses Dateisatzes.
- Vor einer bewussten Audioquellenaktualisierung Originalrevision, Dateipfade,
  Hashes und relevante Verhaltensspezifikationen gemeinsam prüfen und aktualisieren.
- Paketarchive und deren Herkunftsdateien zusammen aktualisieren. Keine
  Workarounds über benachbarte persönliche Checkoutpfade einführen.

Die [Architekturübersicht](docs/architecture/README.md) benennt die konkreten
Symphony-, Synapse-, Flamox- und Mosaik-Referenzen sowie bewusste Anpassungen.

## Prüfungen

Schwere Installations-/Build-/Testläufe werden auf dem Entwicklungsrechner
koordiniert nacheinander ausgeführt. Relevante schmale Prüfungen kommen vor dem
integrierten Gesamtlauf.

| Befehl                | Aussage                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------- |
| `yarn verify:vendor`  | Gepinnte Mosaik-/Synapse-Archivbytes stimmen mit ihren Digests überein                                   |
| `yarn verify:audio`   | Kopierte Flamox-Audiodateien stimmen mit ihrer dokumentierten Herkunft überein                           |
| `yarn typecheck`      | Native TypeScript-Grenzen und Angular-Templates kompilieren am aktuellen Stand                           |
| `yarn test`           | Vorhandene Verhaltensspezifikationen laufen mit einem Worker                                             |
| `yarn build`          | Renderer und native Prozesse werden gebaut                                                               |
| `yarn test:e2e`       | Gebautes Electron mit synthetischem Mikrofon, echten UI-/IPC-/Dateipfaden und isoliertem Profil bedienen |
| `yarn verify`         | Konfigurierter Herkunfts-, Typ-, Test- und Build-Gesamtlauf                                              |
| `yarn package`        | Electron-Programmpaket für das ausführende Hostsystem erzeugen                                           |
| `yarn verify:package` | Erzeugtes Paket gegen aktuelle Bundles, Ressourcen, Metadaten und native Abhängigkeiten prüfen           |
| `yarn make`           | Für das Hostsystem unterstützte Installer-/Archivmaker ausführen                                         |

Ein konfigurierter Befehl ist kein Nachweis, dass er bereits erfolgreich lief.
Tatsächliche Ergebnisse und Laufzeitprüfungen stehen in der
[Abnahme](docs/project/abnahme.md). Echte Accounts, Mikrofon und Sprachdialog werden
separat geprüft; normale accountfreie Tests starten keine persönliche Anmeldung
oder bezahlte Inferenz. Eine macOS-Prüfung ersetzt keinen Windows-Lauf.

Unter Windows prüft `node tools/verify-windows-speech.mjs` die mitgelieferte
System.Speech-Brücke unmittelbar: native Kompilierung, verfügbare Stimmen und
eine tatsächlich erzeugte WAV-Datei. Mit einem installierten passenden
en-US-/de-DE-Erkennungspaket folgt die native Dateitranskription. Fehlt dieses
Paket, hält der Bericht die fehlende Prüfung ausdrücklich fest. Der Lauf verwendet
künstlichen Sprachtext und kein physisches Mikrofon oder Assistentenkonto.

Benötigte Testdaten und temporäre Profile bleiben test-eigen. Keine Nutzerprofile,
Aufzeichnungen oder fremden Prozesse für einen Test zurücksetzen oder löschen.
Neue Verhaltenstests liegen neben dem tatsächlichen Produktionsbesitzer;
Kopier-/Format-/Stylesheetänderungen benötigen keine Tests, die nur ihren Text
nachbilden.

`yarn test:e2e --packaged` bedient das erzeugte native Paket. Die optionale
Ergänzung `--speech` prüft hörbares Vorlesen mit einer tatsächlich verfügbaren
Systemstimme und ausdrücklich manuell vorgegebenen Testdaten. Alle Prüfartefakte
bleiben unter `.codex-work/`; weder persönliche Anmeldung noch reale KI-Anfragen
sind Teil dieses Laufs.

## Pull Requests und Übergabe

Vor jeder Pull-Request-Erstellung den lokalen Ship-it-Review ausführen, sofern
im Repository vorhanden, und seine blockierenden Befunde zuerst beheben. Einen
nicht ausgeführten Review nicht als bestanden melden. Das ist eine stehende
Vorgabe des Repository-Owners.

Die Beschreibung führt mit dem veränderten Nutzerverhalten und nennt konkrete
Prüfungen sowie verbleibende Laufzeit-/Plattformgrenzen. Dokumentation muss
implementiertes Verhalten, verbindlichen Zielumfang und offene Abnahme trennen.
Native Paketierung bedeutet keine öffentliche Veröffentlichung und keine
automatische Freigabe eines Releases.

## Öffentlicher Quellcode und Lizenz

Eigene Beiträge folgen der [MIT-Lizenz](LICENSE). Übernommene Quellen und
Paketarchive behalten ihre vollständigen Hinweise. Der Root-Workspace bleibt
`private: true`, damit eine GitHub-Quellcodefreigabe keine npm-Publikation auslöst.
Installer und automatische Updates folgen einem eigenen
[Auslieferungsablauf](docs/project/veroeffentlichung.md).
