# Produkt und Bedienung

**Resonanz bewahrt Gespräche und macht sie erneut nutzbar.** Eine Session bündelt
Aufnahme, Transkript, Zusammenfassung sowie spätere Fragen und Antworten. Eine
Live-Unterhaltung ist ebenfalls eine Session: Die eigene Stimme und die
Audioantwort des KI-Gesprächspartners gehören zum selben Gesprächsverlauf.

## Kernabläufe

- [Aufzeichnungen verwalten](aufzeichnungen.md): aufnehmen, pausieren,
  wiedergeben, transkribieren, ordnen, importieren und exportieren.
- [Live mit KI sprechen](live-unterhaltung.md): eine echte Audioverbindung
  starten, sprechen, unterbrechen und die Unterhaltung später wiederfinden.
- [KI verbinden und einrichten](ki-und-einrichtung.md): lokale Assistenten
  anmelden, ein Modell auswählen und Audiofähigkeiten konfigurieren.
- [Abnahme und Nachweise](abnahme.md): nachgewiesenes Verhalten und noch zu
  prüfende Nutzerwege.

## Bedienungsprinzipien

Aufnahme und Live-Unterhaltung beginnen durch eine bewusste Startaktion.
Mikrofonwahl, laufender Zustand, Pause und Beenden müssen dabei erkennbar sein.
Das Schließen des Fensters lässt die Tray-Anwendung weiterlaufen. Über Menüleiste
beziehungsweise Systemtray sollen sich Bibliothek, neue Aufnahme und neue
Live-Unterhaltung wieder öffnen lassen.

Die Anwendung verwendet Angular und Mosaik für Oberfläche und Steuerelemente.
Die Audio-Grundfunktionen einschließlich Vorlesen stammen unverändert aus
FLAMOX365. Die folgenden Seiten definieren den fachlichen Prototypumfang; ob ein
Nutzerweg bereits in der laufenden Anwendung geprüft wurde, steht ausdrücklich
in der Abnahme.

## Inhalt einer Session

| Bestandteil                | Zweck                                                                |
| -------------------------- | -------------------------------------------------------------------- |
| Titel, Zeit und Dauer      | Gespräch wiedererkennen                                              |
| Sammlung, Favorit und Tags | Aufzeichnungen organisieren                                          |
| Aufnahme                   | Original hören und Aussagen erneut prüfen                            |
| Transkript mit Zeitmarken  | Gesprochenes lesen und gezielt wiederfinden                          |
| Zusammenfassung            | Kernaussagen, Entscheidungen, Aufgaben und offene Fragen überblicken |
| Fragen und Antworten       | Später anhand des konkreten Gesprächs weiterarbeiten                 |

Eine KI-Antwort soll bei einer Aussage aus dem Gespräch auf Zeitmarken verweisen.
Fehlt eine Information im Transkript, soll die Antwort diese Lücke kenntlich
machen. Automatisch vorgeschlagene Aufgaben sind Gesprächsauswertungen; daraus
folgt noch keine ausgeführte externe Aktion.
