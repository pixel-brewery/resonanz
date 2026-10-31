# Entscheidungen und offene Fragen

Stand: 31. Oktober 2026. Beschlossene Ziele, tatsächlich gewählte Prototyptechnik
und noch ausstehende Laufzeitnachweise sind unterschiedliche Kategorien.

## Verbindlich festgelegt

| Thema               | Entscheidung                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Name und Repository | Resonanz; `pixel-brewery/resonanz`, öffentlich auf GitHub                                              |
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

Eigene Quellen stehen unter der [MIT-Lizenz](../LICENSE). Die Quellcodefreigabe
ist erfolgt; Installer, Signierung und Updates folgen dem
[Auslieferungsleitfaden](project/veroeffentlichung.md).

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
| Audioquelle       | Gewähltes Mikrofon; bei Live das Systemstandardmikrofon und tatsächlich abgespielte native Antwortclips                                                                  |
| Transkription     | Systemeigene Spracherkennung; fehlende Sprache oder Freigabe sichtbar melden, kein Cloud-Fallback.                                                                       |
| Paketinstallation | Gepinnte lokale Mosaik- und Synapse-Distributionsarchive mit Hashmanifesten; keine Abhängigkeit von persönlichen Checkoutpfaden oder einem zusätzlichen Registry-Token   |
| App-Symbol        | Editierbare Resonanz-Bildmarke mit nativen PNG-/ICO-/ICNS- und monochromen Trayvarianten                                                                                 |

Die gewählte JSON-Ablage ist eine bewusste Prototypabweichung von Symphonys
umfangreicher Persistenz. Eine spätere Migration muss Sessionidentitäten,
Audiojournale, Fragen und vollständige Assistentenfortsetzungen erhalten. Die
Prozess-/Vertragsgrenzen bleiben davon unabhängig.

## Tatsächlicher Nachweis

Die [Abnahme](project/abnahme.md) führt Herkunfts-, Typ- und Verhaltenstests,
Builds, native Pakete und die Bedienläufe zentral. macOS und Windows bestanden
die getrennte CI. Unter macOS wurden zusätzlich deutsche Datei- und physische
Mikrofonerkennung, echte Codex-Anmeldung und -Inferenz, native Sprachausgabe,
Unterbrechung, Mute und Pause/Fortsetzen geprüft. Das Gesprächsarchiv enthielt
positive Energie auf beiden Stereokanälen.

Windows bestand zusätzlich tatsächliche System.Speech-Kompilierung, WAV-Synthese
und en-US-Dateierkennung. Ein physisches Windows-Mikrofon mit deutschem Sprachpaket
und ein Claude-Konto bleiben getrennte Prüfungen. Ein installierter CLI-Pfad oder
eine ausgewählte Einstellung wird weiterhin nicht als erfolgreiche Inferenz
gewertet.

## Offene Entscheidungen nach dem Prototyp

- Öffentliche Installerreleases, unterstützte Architekturen und Auslieferungsmodell.
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
