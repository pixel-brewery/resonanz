# Projektplan Resonanz

Stand: 31. Oktober 2026. Dieser Plan ersetzt den anfänglichen Konzeptstand und
behält den vollständigen Auftrag bis zur lauffähigen App bei. Der konkrete
Nachweis je Anforderung steht in der [Abnahme](project/abnahme.md).

## Verbindliches Produktziel

Resonanz ist eine Tray-/Menüleisten-Anwendung für macOS und Windows. Sie hört nach
einer bewussten Startaktion zu, zeichnet eine Session auf, erstellt ein Transkript
und macht den Inhalt durch KI-Auswertung und spätere Fragen zugänglich. Zusätzlich
gehört eine **echte Live-Unterhaltung mit bidirektionalem Audio** zum ersten
Prototyp. Aufzeichnungen und Live-Unterhaltungen werden gemeinsam organisiert.

Die Oberfläche verwendet Angular und Mosaik. Lokale KI-Assistenten werden über
Synapse angebunden. Aufnahme, PCM-Audio, Wiedergabe und Text-to-Speech werden aus
dem FLAMOX365-Core-Frontend übernommen; kopierte Produktionsdateien bleiben
unverändert und erhalten eine prüfbare Herkunft. Symphony liefert die Referenz
für Desktop-Prozessgrenzen, native Lebenszyklen und Repository-Präsentation.

## Erster vollständiger Prototyp

| Bereich           | Geforderter Nutzerweg                                                                                                         |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Desktop           | App starten, im Tray erreichbar bleiben, Fenster erneut öffnen, sauber beenden                                                |
| Aufnahme          | Mikrofon auswählen, aufnehmen, pausieren/fortsetzen, stoppen, gespeichertes Audio hören                                       |
| Live-Unterhaltung | Systemeigene Spracherkennung, echte Synapse-Antwort und native Sprachausgabe, Unterbrechung, Stummschaltung, Pause/Fortsetzen |
| Live-Kontext      | Beide Gesprächsseiten transkribieren und archivieren; Gesprochene Beiträge direkt an den lokalen Assistenten übergeben        |
| Transkription     | Abgeschlossene Aufnahmen mit der systemeigenen Erkennung unter macOS oder Windows transkribieren                              |
| Lokale KI         | Codex oder Claude Code erkennen, mit dem eigenen Konto anmelden, Modell auswählen und einen Auftrag abbrechen                 |
| Auswertung        | Zusammenfassung, Entscheidungen, Aufgaben und offene Fragen anhand des tatsächlichen Transkripts                              |
| Sessionfragen     | Fortlaufende Antworten, Folgefragen und belegte Zeitmarken; fehlende Informationen benennen                                   |
| Organisation      | Titel, Sammlungen, Tags, Favoriten, Suche und Löschen                                                                         |
| Daten             | Über Neustarts erhaltene Aufnahme, Transkript, Analyse und Fragen; Audio-/JSON-Import sowie Audio-/JSON-/Markdown-Export      |
| Gestaltung        | Mosaik-Steuerelemente, eigene lesbare App-/Tray-Bildmarke, README mit Hero und klarer Produkt-/Installationsführung           |
| Auslieferung      | Gebaute und gestartete App; native Paketierung und explizite Prüfung je Zielplattform                                         |

Resonanz benötigt keine API-Keys. Die vorhandene Kontoanmeldung von Codex oder
Claude Code ist der KI-Zugang für sämtliche Funktionen einschließlich Sprache.
Spracherkennung und Sprachausgabe kommen vom Betriebssystem.

## Architektur und Wiederverwendung

Die Anwendung übernimmt Angular Renderer → typisierte Preload-API → Electron Main
→ beaufsichtigter Utility Process. Sessiondaten und Synapse-Ausführung liegen im
Utility Process. Electron Main besitzt Fenster/Tray, native Berechtigungen und
Dateidialoge sowie die systemeigenen Sprachfunktionen. Der Renderer bleibt
ohne Node-Integration und verwendet echte Browsermedienressourcen.

Das Audio wird nicht durch einen Prototyp-Nachbau ersetzt. Das Manifest
`libs/audio/provenance.json` benennt die unveränderten Flamox-Dateien einschließlich
TTS und Verhaltensspezifikationen. Resonanz-spezifische IPC-, Persistenz- und
Sprachdialog-Komposition bleibt außerhalb dieses kopierten Dateisatzes.

Die [Architekturübersicht](architecture/README.md) beschreibt aktuelle Besitzer,
Referenzstände und bewusste Abweichungen. Insbesondere bleibt Synapse eine
Text-/CLI-Integration; systemeigene Spracherkennung, Sprachclips und der
Stereo-Mediengraph ergänzen diesen Pfad innerhalb derselben App.

## Umsetzung und Integrationsreihenfolge

1. **Architektur und native Grundlagen:** Prozessgrenzen, validierte Verträge,
   persistente Sessionablage, installierbare Paketarchive und Synapse-Lebenszyklus
   implementieren. Diese Grundlagen dürfen den integrierten App-Nachweis nicht
   ersetzen.
2. **Unveränderte Audiobasis:** Flamox-Implementierungen mit Herkunft übernehmen;
   Aufnahme, finale Chunk-Bestätigung, Wiedergabe und Vorlesen anbinden.
3. **Keylose Live-Unterhaltung:** Native Spracherkennung, direkte Synapse-Turns,
   native Sprachausgabe, Archivierung, Unterbrechen und geordnete Freigabe integrieren.
4. **Nutzbare Oberfläche:** Angular-/Mosaik-Bibliothek, Sessionansicht, Organisation,
   Einstellungen, Anmeldedialoge und sichtbare Fehlerzustände vollständig anbinden.
5. **Laufzeit und Wiederaufnahme:** Reale Aufnahme, Abspielen, Transkription,
   Live-Gespräch, lokale Inferenz und Persistenz nach Neustart prüfen.
6. **Paket und Repository:** Native Icons/Container, Hero/README, vollständige
   Dokumentation und Lizenzhinweise fertigstellen; erzeugte App-Pakete starten.

## Objektive Abnahme

Die vollständige [Abnahmematrix](project/abnahme.md) bleibt maßgeblich. Ein
bestandener Build, eine kopierte Audiodatei oder ein kontrollierter Treibertest
belegen jeweils nur ihren eigenen Bereich. Zur Gesamtfertigstellung gehören
sichtbare, funktionierende Nutzerwege in der tatsächlichen Electron-Anwendung.

Die ursprüngliche Idee wird deshalb nicht auf einen Web-Mock, reines Vorlesen,
eine CLI-Demo oder ausschließlich nachträgliche Zusammenfassungen verkürzt.
Echte Live-Unterhaltung, Organisation, Synapse und eine lauffähige App bleiben
Bestandteile desselben Auftrags.

## Noch offene Folgeentscheidungen

Öffentliche Installerreleases, vertrauenswürdig signierte/notarisierte Pakete,
automatische Updates, zusätzliche Betriebssysteme, allgemeines Systemaudio,
Sprechertrennung normaler Mehrpersonengespräche, sessionübergreifende Suche und
automatische Aufteilung sehr langer Aufnahmen werden nach dem ersten Prototyp
entschieden. Sie werden nicht stillschweigend als bereits vorhanden dokumentiert.
