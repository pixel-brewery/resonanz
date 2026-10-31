# KI verbinden und einrichten

Resonanz wird über die Kontoanmeldung einer lokal installierten Codex- oder
Claude-Code-CLI eingerichtet. Ein zusätzlicher API-Key wird nicht benötigt.
Dieselbe Verbindung wird für Analyse, Sessionfragen und Sprachgespräche verwendet.

## Einen Assistenten verbinden

1. Unter Einstellungen Codex oder Claude Code auswählen.
2. Die erkannte Installation prüfen oder den vorhandenen CLI-Pfad angeben.
3. Die angebotene Browser- beziehungsweise Geräteanmeldung starten.
4. Die native Anmeldung abschließen und auf die bestätigte Verbindung warten.
5. Das gewünschte native Modell wählen oder den Standard der CLI verwenden.

Bei Claude kann die native Browseranmeldung einen einmaligen Bestätigungscode
zurückgeben. Dieser gehört zum laufenden Anmeldevorgang und wird über das dafür
angezeigte Feld abgeschlossen. Resonanz fordert keinen dauerhaften API-Key an.
Die App installiert oder aktualisiert die Assistenten nicht automatisch.

Resonanz hält seine eigenen nativen Profile. Globale CLI-Zugangsdaten werden nicht
stillschweigend übernommen. Konto- und Modellwechsel behalten gespeicherte
Gespräche, verwerfen aber unpassende native Fortsetzungen. Die Modellinferenz
folgt dem angemeldeten Assistenten und dessen Konto; eine lokale CLI ist keine
Zusage vollständig offline ausgeführter Modellinferenz.

## Sprache und Aufnahme

Die Spracherkennung und Sprachausgabe kommen vom Betriebssystem. Einstellungen
zeigen die tatsächlich verfügbaren Sprachen und Stimmen. Die Ausgangssprache
ist Deutsch (`de-DE`). Falls ein Sprachpaket oder eine Freigabe fehlt, zeigt die
App dieses konkrete Problem. Es gibt keinen Cloud-Sprachdienst als Ausweichpfad.

Für Live-Gespräche wird das Systemstandardmikrofon verwendet, damit native
Erkennung und gespeicherte Aufnahme dieselbe Quelle hören. Das gewünschte Gerät
kann in den Audioeinstellungen des Betriebssystems ausgewählt werden. Die
Geräteauswahl für normale Aufzeichnungen bleibt gesondert verfügbar.

Aufnahmen lassen sich auf Wunsch nach dem Beenden automatisch transkribieren.
Die Option „Aufnahmen automatisch transkribieren“ kann ausgeschaltet werden;
vorhandenes Audio lässt sich anschließend über „Transkribieren“ bearbeiten.
Vorlesen gespeicherter Texte nutzt den unveränderten Flamox-Dienst und die
verfügbaren Browser-/Systemstimmen. Live-Antworten werden als native Sprachclips
wiedergegeben und dem Gesprächsarchiv zugeordnet.

## Daten und Berechtigungen

Bibliothek, Audiojournale, Einstellungen und native Profile liegen im
Betriebssystem-Anwendungsdatenverzeichnis. Aufnahmen beginnen durch eine
bewusste Startaktion. Mikrofon und Spracherkennung benötigen ihre jeweiligen
Systemfreigaben. Kamera- und allgemeine Dateisystemrechte gehören nicht zur
Renderer-API; Import und Export verwenden native Dateidialoge.

Gespeicherte Aufzeichnungen bleiben unabhängig von einer laufenden KI-Anmeldung
zugänglich. Eine fehlgeschlagene native Inferenz erzeugt keine Demoantwort.

## Aus dem Quellstand starten

Benötigt werden Node.js 24 LTS ab `24.15.0` und der in `package.json` gepinnte
Yarn-Stand. Ein vollständiger Checkout enthält auch `vendor/`.

```sh
yarn install --immutable
yarn start
```

Mosaik und Synapse benötigen durch die mitgeführten Paketarchive keinen
zusätzlichen Registry-Zugang. Ein bereits gebautes App-Paket lässt sich ohne
Entwicklungswerkzeuge öffnen. Tatsächliche Laufzeitnachweise stehen in der
[Abnahme](abnahme.md).
