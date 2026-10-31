# Referenzentscheidungen für die Oberfläche

| Entscheidung                                             | Einordnung | Umsetzung und Grund                                                                                                                                        |
| -------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Angular OnPush, Signals, Signal Forms und View/Presenter | Adopt      | Dieselben Framework-Muster wie Flamox und Symphony; typisierte Mosaik-Formintegration.                                                                     |
| Mosaik, Soho, Inter und Reicon                           | Adopt      | Öffentliche Angular-Wrapper, Theme und gemeinsame Icons statt Nachbau der Controls.                                                                        |
| Recorder, PCM, Player und Text-to-Speech                 | Adopt      | Bytegleiche Kopien mit SHA-256-Herkunft und ursprünglichen Verhaltensspezifikationen.                                                                      |
| Shell und Arbeitsbereich                                 | Adapt      | Aufzeichnungen, Live-Gespräche, Favoriten und Sammlungen statt Delivery-Funktionen.                                                                        |
| Persistenz und Integration                               | Adapt      | Typisierte Preload-API, Main und Utility Process mit lokaler Sessionablage.                                                                                |
| Sprachgespräch                                           | Differ     | Die vom Nutzer präzisierte Zielrichtung nutzt systemeigene Sprache und Synapse-CLI-Anmeldung. Flamox-spezifischer Cloud-Audiozugang wird nicht übernommen. |
| Live-Archiv                                              | Adapt      | Mikrofon und abgespielte native Assistentenclips werden gemeinsam archiviert; die unveränderten Audioprimitive bleiben erhalten.                           |
| KI-Anbindung                                             | Adapt      | Derselbe native Assistent besitzt Sprachturns, Analyse und Sessionfragen.                                                                                  |
| Aufnahmewiedergabe                                       | Adopt      | Unveränderter AudioPlayer, ohne Zugriff auf dessen private Implementierung.                                                                                |
| Name und Bildmarke                                       | Differ     | Eigene Resonanzbögen mit derselben Familie nativer Iconformate.                                                                                            |
| Credits, Mandanten und Git-Lieferungen                   | Differ     | Diese Referenzdomänen gehören nicht zum Aufnahmeprodukt.                                                                                                   |

Quellrevisionen und Kopierherkunft stehen im [Audiohandbuch](audio/README.md).
Den Mosaik-Katalogabgleich und Frontendvertrag beschreibt das
[Oberflächenhandbuch](frontend/README.md). Verhaltensnachweise werden in der
laufenden Electron-Anwendung erhoben.
