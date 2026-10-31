# Projektplan

Stand: 31. Oktober 2026. Die folgenden Abläufe sind ein Konzept, keine Beschreibung
bereits implementierter Funktionen. Die verbindlichen Eckpunkte und offenen
Entscheidungen stehen im [Entscheidungsstand](entscheidungen.md).

## Ziel

Resonanz macht Gesprochenes dauerhaft nutzbar: Eine Session wird aufgenommen und
transkribiert, von KI analysiert und später durch Fragen erschlossen. Die
Tray-Anwendung soll während des Gesprächs wenig Aufmerksamkeit beanspruchen.

Die Integration lokaler KI-Assistenten ist eine zentrale Produktanforderung.
Transkription und Assistentenanbindung können technisch unterschiedliche
Schnittstellen benötigen; beide werden im ersten technischen Prototyp untersucht.

## Beispiel

Eine Projektbesprechung wird als Session aufgezeichnet. Danach kann die Nutzerin
oder der Nutzer fragen:

- Welche Entscheidungen wurden getroffen?
- Welche Aufgaben wurden mir zugewiesen?
- Welche Fragen sind noch offen?
- Was wurde zum Veröffentlichungsdatum gesagt?

Vorgeschlagen ist, Antworten mit passenden Transkriptstellen und Zeitmarken zu
verbinden, damit die ursprüngliche Aussage leicht wiedergefunden werden kann.
Wenn eine Information im Transkript fehlt, soll die Antwort das kenntlich machen.

## Vorschlag für die erste nutzbare Version

### Aufnahme

- Anwendung über Menüleiste beziehungsweise Systemtray bedienen.
- Verfügbare Audioquelle auswählen.
- Eine Session beginnen, pausieren, fortsetzen und beenden.
- Den Aufnahmestatus und die verstrichene Zeit sichtbar machen.
- Die Aufnahme einer Session zuordnen und wiedergeben können.

Ob bereits der App-Start eine Aufnahme auslöst oder eine separate Startaktion
erforderlich ist, wird vor der Umsetzung entschieden. Mikrofon und Systemaudio
werden getrennt auf ihre Machbarkeit unter macOS und Windows geprüft.

### Transkription

- Aus der Aufnahme ein Transkript mit Zeitmarken erzeugen.
- Den Bearbeitungsstand anzeigen und fehlgeschlagene Verarbeitung erneut starten.
- Deutsch zunächst als Abnahmesprache verwenden; weitere Sprachen später festlegen.

Für den ersten Prototyp genügt eine Verarbeitung nach Aufnahmeende.
Live-Transkription und Sprecherzuordnung werden anschließend bewertet.

### KI und Assistentenanbindung

- Einen vorhandenen lokalen KI-Assistenten über eine definierte Schnittstelle anbinden.
- Eine Session als Kontext an den gewählten Assistenten übergeben.
- Eine Zusammenfassung sowie Entscheidungen, Aufgaben und offene Fragen vorschlagen.
- Nach Abschluss der Aufnahme Fragen zur Session stellen und Folgefragen ermöglichen.
- Aufnahme und Transkript auch bei vorübergehend nicht verfügbarem Assistenten erhalten.

Die konkrete Ausführung der Modelle, die Konfiguration und der Umfang der
übergebenen Sessiondaten sind noch festzulegen.

### Sessions

- Aufgezeichnete Sessions in einer Übersicht finden und umbenennen.
- Aufnahme, Transkript, Analyse und zugehörige Fragen gemeinsam öffnen.
- Sessions mitsamt ihren gespeicherten Inhalten löschen können.

## Vorgeschlagene Umsetzungsschritte

1. **Grundentscheidungen:** Audioquellen, Startverhalten, Speicherstrategie und
   mindestens einen Assistenten für den Prototyp festlegen.
2. **Technischer Durchstich:** kurze Aufnahme, Transkription, Übergabe an einen
   lokalen Assistenten und eine belegbare Antwort auf eine Frage demonstrieren.
   Die Aufnahmefähigkeit unter beiden Zielbetriebssystemen überprüfen.
3. **Nutzbarer Ablauf:** Tray-Bedienung, Sessionübersicht, Fortschrittsanzeigen,
   Wiederholungen bei Fehlern und persistente Fragen ergänzen.
4. **Desktop-Auslieferung:** Installation und Betrieb unter macOS und Windows
   prüfen und erst danach zusätzliche Plattformen oder Funktionen einplanen.

## Vorgeschlagene Abnahme des ersten Durchstichs

- Eine kurze deutsche Testbesprechung lässt sich aufzeichnen und wiedergeben.
- Das Transkript enthält erkennbare Aussagen und passende Zeitmarken.
- Ein angebundener lokaler KI-Assistent kann den Inhalt analysieren.
- Eine konkrete Frage zur Besprechung wird anhand des Transkripts beantwortet.
- Eine im Gespräch nicht enthaltene Information wird nicht als belegte Aussage ausgegeben.
- Nach einem Neustart lässt sich die gespeicherte Session wieder öffnen.
- Bei fehlender Assistentenanbindung bleiben Aufnahme und Transkript verfügbar.

## Spätere Erweiterungen

Live-Transkription, Sprecherzuordnung, Export und Fragen über mehrere Sessions
hinweg sind mögliche Erweiterungen. Sie sind noch nicht für die erste Version
beschlossen.
