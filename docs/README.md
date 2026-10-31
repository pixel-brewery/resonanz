# Resonanz-Dokumentation

Resonanz bündelt Aufzeichnungen, echte Live-Unterhaltungen und spätere Fragen zu
einer Session in einer Desktop-App. Die Oberfläche verwendet Angular und Mosaik.
Lokale Assistenten laufen über Synapse. Systemeigene Spracherkennung und
Sprachausgabe ermöglichen den Sprachdialog über dieselbe Kontoanmeldung ohne
zusätzliche API-Keys. Recorder und Text-to-Speech werden aus FLAMOX365 unverändert
wiederverwendet.

| Einstieg                                    | Inhalt                                                                         |
| ------------------------------------------- | ------------------------------------------------------------------------------ |
| [Produkt und Bedienung](project/README.md)  | Aufzeichnungen, Live-Unterhaltung, Organisation und Einrichtung                |
| [Architektur](architecture/README.md)       | Symphony-Prozessgrenzen, technische Besitzer, Quellen und bewusste Anpassungen |
| [Projektplan](projektplan.md)               | Vollständiger verbindlicher Umfang bis zur lauffähigen App                     |
| [Entscheidungen](entscheidungen.md)         | Gewählte Prototyptechnik und noch offene Produkt-/Auslieferungsfragen          |
| [Abnahme und Nachweise](project/abnahme.md) | Konkrete Prüfungen, beobachtete Nutzerwege und verbleibende Grenzen            |
| [Mitarbeit](../CONTRIBUTING.md)             | Lokaler Start, Prüfungen und Umgang mit Referenzimplementierungen              |
| [Agentenhinweise](../AGENTS.md)             | Arbeitsordner, Quellbesitzer und lokale Review-/Prüfregeln                     |
| [Fremdmaterial](../THIRD_PARTY_NOTICES.md)  | Vollständige erhaltene Attributionen, MIT-Texte und Inter-Schriftlizenz        |

## Fachliche Abläufe

- [Aufzeichnungen verwalten](project/aufzeichnungen.md)
- [Live mit KI sprechen](project/live-unterhaltung.md)
- [KI verbinden und einrichten](project/ki-und-einrichtung.md)

## Technische Einstiege

- [Desktop, Verträge und Sessionablage](architecture/desktop/README.md)
- [Audio und echte Live-Verbindung](architecture/audio/README.md)
- [Lokale Assistenten und Synapse](architecture/local-assistants/README.md)

## Stand richtig einordnen

Die Angular-/Mosaik-Oberfläche und die native Kommunikation wurden auch im
erzeugten macOS-Paket bedient. Aufnahme mit synthetischem Mikrofonsignal,
Wiedergabe, Organisation, Import/Export und Persistenz nach Neustart sind geprüft.
Ein physisches Mikrofon, persönliche Live-/Assistenteninferenz und native
Windows-Ausführung benötigen eigene Nachweise.

Die [Abnahmematrix](project/abnahme.md) behält den vollständigen Projektauftrag bei.
Neue Ergebnisse müssen dort am passenden Nutzerweg ergänzt werden; ein einzelner
Teilerfolg verkürzt weder den Umfang noch ersetzt er eine offene Laufzeitprüfung.
