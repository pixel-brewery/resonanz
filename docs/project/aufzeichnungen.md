# Aufzeichnungen verwalten

Diese Seite beschreibt den fachlichen Prototypumfang. Die Umsetzung und ihre
Prüfung werden in der [Abnahme](abnahme.md) getrennt ausgewiesen.

## Eine Aufnahme erstellen

1. Eine neue Aufnahme über die Anwendung oder ihren Tray-Eintrag starten.
2. Das gewünschte Mikrofon wählen und die Betriebssystemfreigabe erteilen.
3. Den sichtbaren Aufnahmestatus und Eingangspegel prüfen.
4. Bei Bedarf pausieren und dieselbe Session fortsetzen.
5. Beenden und auf die Bestätigung der gespeicherten letzten Audioblöcke warten.

Der erste Prototyp nimmt das gewählte Mikrofon auf. Ein allgemeiner Mitschnitt
der Audioausgabe anderer Anwendungen ist damit noch nicht beschlossen oder
implementiert. Bei einer Live-Unterhaltung wird zusätzlich der tatsächliche
abgespielte Assistentenausgabe archiviert.

Bereits bestätigte Audioblöcke werden fortlaufend gespeichert. Kann eine Aufnahme
nicht regulär beendet werden, soll die Session als unterbrochen beziehungsweise
fehlerhaft erscheinen; vorhandenes Audio bleibt zur Wiederherstellung erhalten.
Eine verifizierte Wiederherstellung benötigt einen eigenen Laufzeittest.

## Hören und transkribieren

Eine beendete Aufnahme lässt sich wiedergeben und mit systemeigener
Spracherkennung transkribieren. Dafür werden keine zusätzlichen Dienstzugänge
oder API-Keys eingerichtet. Die gewählte Sprache und die Mikrofon-/
Spracherkennungsfreigaben müssen auf dem Betriebssystem verfügbar sein.

„Aufnahmen automatisch transkribieren“ startet die Erkennung nach dem Beenden.
Die Option ist abschaltbar; „Transkribieren“ verarbeitet vorhandenes Audio später.
Aufnehmen, Anhören und manuelles Ergänzen bleiben auch ohne verfügbare Erkennung
möglich. Windows bereitet Browser-Audioformate lokal als begrenztes PCM-WAV vor;
die Originalaufnahme wird dabei nicht ersetzt.

Transkripte enthalten Sprecherzuordnung und Zeitmarken. Bei normalen Aufnahmen
kennzeichnet der Prototyp die Teilnehmerseite gemeinsam; automatische
Unterscheidung sämtlicher Personen ist kein zugesagter Funktionsumfang.

## Ordnen und wiederfinden

Die Bibliothek soll sich nach Titel beziehungsweise Tags durchsuchen lassen.
Sessions können umbenannt, favorisiert, mit Tags versehen und einer Sammlung
zugeordnet werden. Sammlungen lassen sich erstellen, umbenennen und entfernen.
Beim Entfernen einer Sammlung bleiben ihre Sessions in der Bibliothek erhalten.
Die gespeicherte Standardreihenfolge richtet sich nach der letzten Änderung.

Titel, Sammlung, Tags, Transkript, Zusammenfassung und Fragenverlauf werden
zusammen mit der Session über Neustarts erhalten. Die native Audioquelle wird
beim Fortsetzen einer beendeten Session nicht heimlich erneut aktiviert.

## Mit dem Gespräch arbeiten

Eine Auswertung erstellt eine deutsche Markdown-Zusammenfassung mit
Kernaussagen, Entscheidungen, Aufgaben und offenen Fragen. Danach lassen sich
Fragen stellen, beispielsweise „Was wurde zum Termin beschlossen?“ oder
„Welche Aufgabe wurde mir ausdrücklich zugewiesen?“.

Die App verwendet dafür den ausgewählten lokalen Assistenten über Synapse.
Antworten erscheinen fortlaufend und lassen sich abbrechen. Ein Anbieterfehler
bleibt ein sichtbarer Fehler; er wird nicht durch eine vorgefertigte Antwort
ersetzt. Für dieselbe Session wird jeweils nur ein solcher Auftrag zugelassen.

## Import und Export

- Audioimport: WebM, WAV, MP3, M4A/MP4, OGG und FLAC über die native Dateiauswahl.
- JSON-Import: zuvor exportiertes Resonanz-Sessiondokument mit Transkript,
  Zusammenfassung und Fragenverlauf; es erhält eine neue Sessionkennung.
- Markdown-Export: lesbare Zusammenfassung, Transkript und Fragen/Antworten.
- JSON-Export: strukturierter Sessioninhalt, ohne native Kontozugangsdaten oder
  interne Assistentenfortsetzungen.
- Audioexport: die tatsächlich gespeicherte Mediendatei.

Ein JSON-Export enthält keine eingebettete Audiodatei. Beim erneuten Import ist
daher kein Audio vorhanden, bis eine entsprechende Audioquelle separat vorliegt.
Der Prototyp unterstützt keinen automatischen Abgleich solcher getrennten Importe.

## Entfernen und Größenbegrenzungen

Das Löschen einer Session beendet ihre zugeordneten App-Aufträge und entfernt
deren Bibliothekseintrag und Audiojournal. Lokale native Assistentenkonten sind
separat organisiert; ihre Kontohistorien werden dadurch nicht als vollständig
gelöscht ausgewiesen.

Die aktuellen Speicherverträge begrenzen eine Aufnahme beziehungsweise einen
Audioimport auf 512 MiB, einzelne Audioblöcke auf 4 MiB und JSON-Importe auf
10 MiB. Der Windows-Dateitranskriptionspfad ist auf 64 MiB decodiertes PCM-WAV
begrenzt. Die Verfügbarkeit der nativen Erkennung wird getrennt von den Dateigrößen geprüft.
Bei Erreichen eines Limits soll ein konkreter Hinweis zum nächsten Schritt
erscheinen. Automatische Aufteilung langer Aufnahmen ist noch offen.
