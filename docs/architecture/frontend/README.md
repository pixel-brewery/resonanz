# Desktop-Oberfläche

## Implementierter Stand

Die Oberfläche verwendet Angular 22, zonenlose Änderungserkennung, eigenständige
OnPush-Views, Signals, Signal Forms und die typisierten Angular-Wrapper von Mosaik.
Die Ansichten für Bibliothek, Sessions und Einstellungen werden über Hash-Routen
getrennt geladen. Die Renderer-Sandbox importiert keine Node- oder Electron-APIs.

`DesktopApi` ist der einzige Zugang zum validierten Preload-Vertrag. `LibraryStore`
hält die Projektion von Sessions, Sammlungen, Einstellungen und Fähigkeiten.
Push-Ereignisse lösen zusammengefasste Aktualisierungen aus; überholte Antworten
werden anhand ihrer Anforderungsgeneration verworfen. Die Sessionansicht bindet
Assistenten-Text zusätzlich an Session- und Lauf-ID.

Views besitzen getrennte TypeScript-, HTML- und SCSS-Dateien. Presenters koordinieren
Anwendungskommandos und Zustände; reine Formatierung von Zeitdauern liegt in einer
Pipe. Zeitdauern sind Millisekunden, gespeicherte Zeitpunkte ISO-Instants und die
Anzeige verwendet die deutsche Locale. Tailwind wird für Layout eingesetzt,
Mosaik für Steuerelemente, Typografie, Farben und Varianten. View-SCSS bleibt leer.

## Referenzen und Wiederverwendung

Symphonys Bootstrap, Shell und Presenter-Komposition sind die konkreten Vorbilder.
Die Soho-Theme, Inter-Schriften und vollständige Reicon-Aliasregistrierung werden
wie dort eingebunden. Produktbezogene Aktionen und Daten gehören zu Resonanz.
Die [Referenzentscheidungen](../frontend-reference-flamox.md) halten die Anpassungen
fest. Audiokoordinatoren verwenden den [unveränderten Flamox-Audiokern](../audio/README.md).

Der öffentliche Mosaik-Beta-MCP wurde am 31. Oktober 2026 konsultiert:

- `get_studio_authoring_rules` und Angular-Integrationsleitfaden;
- `template-ai-chat`, insbesondere die Chat-Seite;
- `recipe-application-shell--assistant`, einschließlich Optionen, Dokumentation und Baum;
- `recipe-app-sidebar` und `recipe-chat-composer`, einschließlich Optionsschemata;
- `recipe-illustration-voice-assistant` als Referenz für die Darstellung von Sprachzuständen;
- Dokumentation der tatsächlich verwendeten Controls einschließlich Password Box und Select Item.

Der unveränderte Referenzbaum `recipe-application-shell--assistant` wurde mit
`validate_design_tree` geprüft: keine Verletzungen. Dies belegt die Katalogvorlage.
Die dynamische Resonanz-Implementierung wird zusätzlich durch den Angular-Compiler
gegen die tatsächlich installierten Mosaik-Wrapper und in der laufenden App geprüft.
Ein erfolgreich validierter Referenzbaum ersetzt diese Laufzeitprüfung nicht.

Die vendorte Mosaik-Version ist `0.1.183`; die Beta-Dokumentation kann neuer sein.
Bei Unterschieden ist die installierte öffentliche API maßgeblich. Beispielsweise
wird die App-Kopfzeile über `provideAppComponent` konfiguriert und ein geheimer Wert
über `PasswordBoxComponent` eingegeben.

Für den lokalen `file:`-Start zeigt die Basis-URL auf `./index.html`; so behält
Angulars Hash-Routing beim Neuladen den Dateinamen bei. Die Produktionsoptimierung
verwendet wie Symphony kein Inline-Critical-CSS, dessen `onload`-Handler die
strikte Skriptrichtlinie verletzen würde. Der gemeinsame PCM-Prozessor wird über
den bestehenden Loader-Port als unverändertes statisches Asset geladen. Der
Generatorcheck verhindert Abweichungen zum kopierten Audiokern.

## Produktabläufe

Die Bibliothek filtert Titel und Tags, zeigt Favoriten und Sammlungen und öffnet
gespeicherte Sessions. Die Sessionansicht bietet Aufnahme-Wiedergabe, segmentweise
Transkriptkorrektur mit erhaltenen Sprechern/Zeitmarken, Zusammenfassung, Fragen,
gestreamte Antworten und Vorlesen. Die unveränderten `AudioPlayer`- und
`TextToSpeechService`-Implementierungen besitzen Wiedergabe beziehungsweise Sprachsynthese.

Die Einstellungen trennen native Assistentenanmeldung und Live-Audio-Zugang.
Anmeldungen sind an Operation und Kontobindung korreliert. Veraltete Statusantworten
und fremde spätere Anmeldeereignisse dürfen die aktuelle Einrichtung nicht ersetzen.
Gespeicherte API-Schlüssel werden nie zurück in den Renderer gelesen.

## Nachweise und Grenzen

Der vollständige Angular-Template- und TypeScript-Check hat bestanden. Die
Settings-Presenter-Regressionsprüfung hat acht Tests bestanden. Weitere Änderungen
erfordern den gemeinsamen Test- und Build-Lauf sowie die Prüfung im echten Electron-Fenster.
Die Abnahme wird zentral in [der Abnahmematrix](../../project/abnahme.md) nachgeführt.

Das generierte Angular-Minimalprojekt setzte ein initiales Bundle-Limit von 1 MB.
Das Mosaik-basierte Desktop-Bundle misst derzeit rund 3,67 MB roh / 427 kB geschätzt
komprimiert. Für die lokal ausgelieferte App gelten 4 MB Warn- und 5 MB Fehlergrenze;
Ansichten bleiben getrennte Lazy-Chunks. Diese Grenze ist kein Beleg für gemessene
Startzeit oder flüssige Bedienung.
