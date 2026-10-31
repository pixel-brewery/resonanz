# Abnahme und Nachweise

Stand: 31. Oktober 2026. Der Prototyp verwendet die native Codex-/Claude-Anmeldung,
systemeigene Sprachfunktionen und den unveränderten Flamox-Audiokern.
Ein zusätzlicher API-Key oder Cloud-Sprachdienst gehört nicht zum Produkt.

## Tatsächliche macOS-Ausführung

Der keylose macOS-arm64-Stand wurde als natives App-Bundle gestartet. Die
Paketprüfung verglich 121 aktuelle Build-/Ressourcendateien, native Abhängigkeiten,
Schriften, Worklet und Icons und bestätigte die lokale Ad-hoc-Signatur.
Der abschließende Paketstand einschließlich Freigabe-/Statuskorrekturen bestand
ebenfalls Paketprüfung und alle acht Bedienprüfgruppen. Der automatisierte
Bedienlauf verwendete ein synthetisches Mikrofonsignal und kontrollierte
Dateidialoge: Aufnahme, Pause/Fortsetzen,
Abschluss, Decoder/Wiedergabe, Organisation, Import/Export, keylose Einstellungen,
Neuladen, vollständiger App-Neustart und persistierte Löschungen.

In der tatsächlichen Benutzer-App wurde Codex über die native Browseranmeldung
verbunden. Das vom nativen Modellkatalog angebotene Standardmodell wurde
übernommen. Synapse/Codex analysierte ein künstliches Transkript und beantwortete
eine Folgefrage korrekt mit Mira, Dienstag und Zeitmarke. Diese Antworten stammen
aus realer Konto-Inferenz. Das Vorlesen bestand mit tatsächlicher Systemstimme,
Pause, Fortsetzen und Stop über den unveränderten TextToSpeechService.
Die Anmeldung und gespeicherten Ergebnisse blieben im keylosen App-Stand erhalten.

Eine künstliche deutsche WAV-Datei wurde über die App importiert und von der
systemeigenen Erkennung tatsächlich in 17 zeitmarkierte Segmente umgewandelt:
„Resonanz ist unser neues Projekt“, Mira/Dienstag/Dokumentation und
Leon/Audioaufnahme wurden erkannt. Die Betriebssystemfreigaben wurden im nativen
Dialog eingerichtet. Ein anfänglicher Freigabe-Timeout wurde nach Freigabe
wiederholt; die Startbereinigung und Mikrofonfreigabe vor dem SDK-Start sind
anschließend korrigiert und durch einen Regressionstest abgesichert.

Ein tatsächlicher Sprachdurchlauf verwendete das physische Standardmikrofon.
Ein vom Mac abgespielter künstlicher Testsatz wurde erkannt, an Codex übergeben
und mit „resonanz ist bereit“ beantwortet. Die native Antwort wurde tatsächlich
abgespielt und als Assistententranskript bestätigt. Eine zweite echte Antwort
(Zahlen 1 bis 20) wurde während ihrer Sprachausgabe über „Unterbrechen“ beendet.
Ihr ungehörter Rest erhielt keinen Transkripteintrag; die Modellantwort blieb im
Fragenverlauf. Der stummgeschaltete Testsatz erzeugte keinen Erkennungsbeitrag.
Pause und Fortsetzen arbeiteten in derselben Session weiter. Nach Stop war die
Session gespeichert und hatte keine Sprach-/Assistentenfehler gemeldet.

Das gespeicherte Gespräch wurde tatsächlich decodiert: zwei Kanäle, 182,7 Sekunden,
2.197.615 Archivbytes. Der Mikrofonkanal hatte RMS 0,01421, der Ausgabekanal
0,01247 und 81.278 Samples über Betrag 0,001. Damit wurde auch die tatsächlich
abgespielte Assistentenstimme im Archiv nachgewiesen, nicht bloß ein laufender
Wiedergabezähler.

Über das tatsächliche native Tray-Menü wurde das verborgene Fenster erneut
geöffnet und eine neue Mikrofonaufnahme gestartet. Diese wurde beendet und
gespeichert; ausschließlich diese kurze Diagnoseaufnahme wurde danach entfernt.
Die bestehende Einstellung zur automatischen Transkription wurde wiederhergestellt.

## Reproduzierbare Prüfungen

Zwölf Paketarchive und alle 63 kopierten Audioquellen bestanden ihre
SHA-256-Herkunftsprüfungen. Der statische PCM-Worklet stimmte mit seiner Quelle
überein. Der abschließende integrierte keylose Gesamtlauf bestand mit
244 Verhaltenstests in 30 Dateien, nativer und Angular-Typprüfung sowie beiden
Builds. Der Regressionstest für fehlgeschlagene Erkennungsstarts ist enthalten.
Die Paketierungswerkzeuge bestanden sieben gezielte Tests unter Node 24.

Die lokalen Belege liegen ausschließlich unter dem ignorierten `.codex-work/`,
insbesondere `keyless-verify.log`, `keyless-final-verify.log`,
`keyless-packaged-e2e.log`, `keyless-final-packaged-e2e.log`,
`keyless-final-package.log`, `out/package-verification.json`,
`native-assistant-evidence.json`, `native-keyless/transcription-evidence.json`,
`native-keyless/live-evidence.json`, `native-keyless/tray-evidence.json`
und `run-forge-tests.log`.
Persönliche Anmeldung und Aufzeichnungen werden nicht ins Repository übernommen.
Die reproduzierbaren Prüfer stehen unter [tools](../../tools/).
Die [Desktop-CI](https://github.com/pixel-brewery/resonanz/actions/workflows/ci.yml)
führt Herkunft, Formatierung, Typen, Tests, Builds, Paketprüfung und den
kontrollierten App-Bedienlauf getrennt unter macOS und Windows aus. Ein grüner
Matrixlauf ersetzt keine physische Mikrofon-/Sprachprüfung unter Windows.

Der direkte Windows-Sprachprüfer kompiliert außerdem die im Paket enthaltene
System.Speech-Brücke und erzeugt eine echte Sprach-WAV. Wenn eine passende
en-US-/de-DE-Erkennungssprache installiert ist, transkribiert das native Modell
diese künstliche Datei. Verfügbare Sprachen und fehlende Erkennungsprüfung werden
im gesonderten Bericht `out/windows-speech-verification.json` festgehalten.

## Umfang und Grenzen

| Bereich                  | Nachgewiesen                                                                                                                                                              | Verbleibende Prüfung                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| macOS-App und Oberfläche | Abschließendes natives Paket einschließlich Freigabe-/Statuskorrekturen; Angular/Mosaik, keylose Einstellungen, gespeicherte Anmeldung und Daten                          | Weitere Geräte-/OS-Versionen                                     |
| Tray und Icon            | Eigene Icons; Fenster schließen/verstecken, über natives Tray-Menü öffnen und neue Aufnahme starten tatsächlich bedient                                                   | Weitere OS-Menüvarianten                                         |
| Aufnahme                 | Synthetische Aufnahme sowie physisches Mikrofon im Sprachgespräch; geordneter Abschluss                                                                                   | Weitere physische Geräte und Aufnahmequalität                    |
| Transkription            | Tatsächliche deutsche macOS-Datei- und Live-Erkennung                                                                                                                     | Andere Sprachpakete; Windows-Erkennung                           |
| Sprachgespräch           | Tatsächliche Erkennung → Synapse/Codex → native Stimme                                                                                                                    | Weitere Geräte-/Sprachkombinationen                              |
| Lebenszyklus             | Mute, explizites Unterbrechen, Pause/Fortsetzen und Stop tatsächlich bedient                                                                                              | Automatisches Unterbrechen bei verschiedenem Raum-/Echoverhalten |
| Gesprächsarchiv          | Zwei decodierte Kanäle mit positiver Energie, beide Sprecher und Zeitmarken                                                                                               | Lange Gespräche und Gerätewechsel                                |
| Lokale Assistenten       | Codex-Anmeldung, Modellkatalog, echte Analyse, Folgefrage und gesprochene Turns                                                                                           | Claude-Konto separat verifizieren                                |
| Unverändertes Audio      | 51 Produktionsdateien und 12 Specs bytegleich; Recorder, Player und TTS verwendet                                                                                         | Bewusste spätere Upstream-Updates                                |
| Organisation und Daten   | Titel, Tags, Favoriten, Suche, Sammlungen, Löschen; Audio-/JSON-/Markdown-I/O und Neustart                                                                                | Größere Bestände                                                 |
| Windows                  | Native SAPI-Brücke und begrenzter WAV-Decoder implementiert; automatische Build-/Paket-/Bedienprüfung in der CI-Matrix                                                    | Physische Windows-Sprachhardware und deutsche Sprachpakete       |
| Repository               | Quellstand im privaten Repository gesichert; [Draft-PR 1](https://github.com/pixel-brewery/resonanz/pull/1) enthält Hero, Icons, App-Abbildung, Dokumentation und Notices | Keine öffentliche Auslieferung                                   |

Mit dem in `.nvmrc` gepinnten Node-24-LTS-Basisstand:

```sh
yarn install --immutable
yarn verify
yarn package
yarn verify:package
yarn test:e2e --packaged
```

`RESONANZ_OUTPUT_DIR` erlaubt einen eigenen lokalen Ausgabepfad, um ein bereits
verwendetes App-Bundle zu erhalten. Der optionale Schalter `--speech` prüft
Vorlesen. Accountfreie synthetische Tests beweisen keine persönliche Anmeldung,
physische Sprachaufnahme oder reale Inferenz; diese wurden separat ausgeführt.

Native Sprachpakete und OS-Freigaben bleiben Laufzeitvoraussetzungen. Öffentliche
Signierung/Notarisierung, Installerveröffentlichung und automatische Updates sind
eigene Auslieferungsentscheidungen.
