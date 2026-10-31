# Entscheidungen und offene Fragen

Stand: 31. Oktober 2026. Beschlossene Ziele, tatsächlich gewählte Prototyptechnik
und noch ausstehende Laufzeitnachweise sind unterschiedliche Kategorien.

## Verbindlich festgelegt

| Thema               | Entscheidung                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Name und Repository | Resonanz; `pixel-brewery/resonanz`                                                                     |
| Anwendung           | Desktop-Anwendung mit Menüleisten-/Systemtray-Zugriff                                                  |
| Zielplattformen     | macOS und Windows; beide benötigen eigene native Abnahme                                               |
| Kernablauf          | Aufnahme, KI-Transkription, KI-Analyse und spätere Fragen zur Session                                  |
| Live-Unterhaltung   | Echte duplexe Audioverbindung im ersten Prototyp, einschließlich gespeicherter Gesprächsseiten         |
| Frontend            | Angular und Mosaik                                                                                     |
| Lokale KI           | Synapse als Integrations-/Prozess-/Authentifizierungsbesitzer                                          |
| Audio und TTS       | Wiederverwendung des vorhandenen Flamox-Core-Frontend-Audios; unveränderte Kopien mit Herkunftsprüfung |
| Desktop-Referenz    | Symphony-Prozessgrenzen und native Lebenszyklusmuster                                                  |
| Organisation        | Gemeinsam verwaltete Aufzeichnungen und Unterhaltungen mit Sessionkontext                              |
| Gestaltung          | Eigene App-/Tray-Bildmarke und Repository-Präsentation nach den bestehenden Projekten                  |

## Gewählte Prototypumsetzung

| Thema             | Aktuelle Umsetzung und Begründung                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Desktop           | Electron mit sandboxiertem Angular-Renderer, schmaler Preload-API und eigenem Utility Process                                                                            |
| Verträge          | Gemeinsame TypeScript-Typen und Zod-Prüfung an IPC-/Speichergrenzen                                                                                                      |
| Persistenz        | Versionierter JSON-Katalog und Sessiondateien mit atomarem Ersetzen; geordnetes Audiojournal mit Prüfsummen. Keine zusätzliche Datenbank oder HTTP-API für den Prototyp. |
| KI-Ausführung     | `@resonanz/assistant` komponiert die öffentlichen Synapse-Pakete und führt ausschließlich read-only Textaufträge in Sessionarbeitsverzeichnissen aus.                    |
| Konten            | Resonanz-eigene native Profile; explizite Anmeldung, kein stiller Import globaler CLI-Zugangsdaten                                                                       |
| Live-Audio        | Systemeigene Spracherkennung → Synapse-CLI-Turn → native Sprachausgabe; gesprochene Antworten werden archiviert.                                                         |
| Audiozugang       | Vorhandene Kontoanmeldung des lokalen Assistenten; kein zusätzlicher API-Key oder Sprachdienst.                                                                          |
| Authentifizierung | Native Browser-/Geräteanmeldung im eigenen Profil; keine API-Key-Einrichtung im Produkt.                                                                                 |
| Aufnahmestart     | Bewusste Startaktion statt automatischer Aufnahme beim bloßen App-Start                                                                                                  |
| Audioquelle       | Gewähltes Mikrofon; bei Live-Unterhaltung zusätzlicher tatsächlicher Gegenstellenstream                                                                                  |
| Transkription     | Systemeigene Spracherkennung; fehlende Sprache oder Freigabe sichtbar melden, kein Cloud-Fallback.                                                                       |
| Paketinstallation | Gepinnte lokale Mosaik- und Synapse-Distributionsarchive mit Hashmanifesten; keine Abhängigkeit von persönlichen Checkoutpfaden oder einem zusätzlichen Registry-Token   |
| App-Symbol        | Editierbare Resonanz-Bildmarke mit nativen PNG-/ICO-/ICNS- und monochromen Trayvarianten                                                                                 |

Die gewählte JSON-Ablage ist eine bewusste Prototypabweichung von Symphonys
umfangreicher Persistenz. Eine spätere Migration muss Sessionidentitäten,
Audiojournale, Fragen und vollständige Assistentenfortsetzungen erhalten. Die
Prozess-/Vertragsgrenzen bleiben davon unabhängig.

## Tatsächlicher Nachweis

Die [Abnahme](project/abnahme.md) führt die aktuellen Nachweise und deren
ausgeführte Befehle zentral: Herkunfts-/Typ-/Verhaltensprüfungen und beide Builds,
Prüfung des macOS-arm64-App-Bundles sowie der erfolgreiche Bedienlauf des
tatsächlich paketierten Executables mit synthetischem Mikrofon. Er umfasst auch
Organisation, native Dateioperationen, verschlüsselte Schlüsselablage mit
ungültigem Prüfschlüssel und Persistenz über einen vollständigen App-Neustart.

Physisches Mikrofon, automatische Transkription, echte Provider-Unterhaltung,
persönliche native Assistenteninferenz, hörbares Vorlesen, Traybedienung und
Windows bleiben eigenständige offene Prüfungen. Die konfigurierte Paket- oder
Modellauswahl und der implementierte Quellcode gelten nicht allein als
Funktionsnachweis. Die vorbereitete macOS-/Windows-CI ist noch nicht ausgeführt.

## Offene Entscheidungen nach dem Prototyp

- Öffentliche Sichtbarkeit, Lizenz der Resonanz-eigenen Quellen und Veröffentlichungsmodell.
- Vertrauenswürdige Signierung/Notarisierung, Updatefeed und Auslieferungskanäle.
- Allgemeines Systemaudio beziehungsweise Mitschnitt anderer Anwendungen.
- Weitere Betriebssysteme und zusätzliche lokale Transkriptionsengines.
- Sprechertrennung normaler Mehrpersonenaufnahmen und zusätzliche Sprachen.
- Automatische Aufteilung großer Aufnahmen, längere Kontextstrategien und
  sessionübergreifende Fragen/Suche.
- Aufbewahrung und gezielte Bereinigung separat gespeicherter nativer
  Assistentenhistorien zusätzlich zum Löschen der App-Session.

## Herkunft von Entscheidungen

Die ursprüngliche Produktidee sowie die spätere Vorgabe zu Live-Unterhaltung,
Angular/Mosaik, Synapse und unveränderter Flamox-Audio-Wiederverwendung sind die
verbindliche fachliche Grundlage. Architekturentscheidungen sind hier anhand der
aktuellen Quellbesitzer dokumentiert; größere Änderungen benötigen eine neue
Begründung mit Alternativen, Folgen und passenden Abnahmenachweisen.
