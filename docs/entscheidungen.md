# Entscheidungen und offene Fragen

Stand: 31. Oktober 2026.

## Festgelegt

| Thema | Entscheidung |
| --- | --- |
| Projektname | Resonanz |
| Repository | `pixel-brewery/resonanz` |
| Anwendung | Desktop-Anwendung mit Tray- beziehungsweise Menüleisten-Zugriff |
| Zielplattformen | macOS und Windows; weitere Plattformen später bewerten |
| Kernablauf | Aufnahme → KI-Transkription → KI-Analyse → Fragen zur Session |
| KI-Integration | Anbindung lokaler KI-Assistenten als zentrale Produktanforderung |
| Inhalt einer Session | Aufnahme, Transkript, Analyse und zugehörige Fragen |

## Einrichtung zum Projektstart

Das Repository wurde zunächst privat angelegt. Sichtbarkeit, Lizenz und
Veröffentlichungsmodell sind damit noch nicht als dauerhafte Produktentscheidungen
festgelegt.

## Vor der Umsetzung klären

| Thema | Offene Entscheidung |
| --- | --- |
| Audioquellen | Mikrofon, Systemaudio oder beide; technische Möglichkeiten pro Betriebssystem |
| Aufnahmestart | Automatisch beim App-Start oder nach einer separaten Startaktion |
| Aufnahmebedienung | Verhalten bei Pause, Quellenwechsel, Ruhezustand und Abbruch |
| Desktop-Technik | Wiederverwendung geeigneter Symphony-Muster und Wahl des Anwendungsframeworks |
| Assistenten | Erster unterstützter lokaler Assistent und dessen Integrationsschnittstelle |
| Transkription | Lokale Engine, externer Dienst oder konfigurierbare Auswahl |
| Analyse | Verarbeitung nach Aufnahmeende oder bereits während der Aufnahme |
| Datenverarbeitung | Welche Schritte lokal laufen und welche externen Dienste optional zulässig sind |
| Speicherung | Speicherort, Datenmodell, Aufbewahrung und Löschverhalten |
| Zugriff auf Daten | Welche Sessioninhalte an den jeweiligen Assistenten übergeben werden |
| Antwortbelege | Verknüpfung von Antworten mit Transkriptstellen und Zeitmarken |
| Sprache | Deutsch als vorgeschlagene erste Abnahmesprache; weitere Sprachen offen |
| Auslieferung | Installationspakete, Signierung und Updates für beide Zielplattformen |

## Umgang mit weiteren Entscheidungen

Der [Projektplan](projektplan.md) enthält Vorschläge für den ersten Funktionsumfang.
Diese werden erst nach einer fachlichen oder technischen Entscheidung verbindlich.
Größere Architekturentscheidungen sollen später mit Begründung, Alternativen und
Konsequenzen dokumentiert werden.
