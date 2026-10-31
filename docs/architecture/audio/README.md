# Aufnahme, Sprachausgabe und Sprachgespräch

## Unverändert aus Flamox übernommen

`@resonanz/audio` enthält 51 Produktionsdateien und 12 Verhaltensspezifikationen
bytegleich aus dem FLAMOX365-Core-Frontend. Revision, Originalpfade, Zielpfade und
SHA-256-Digests stehen im [Herkunftsmanifest](../../../libs/audio/provenance.json).
Die vollständigen Attributionen und MIT-Texte bleiben erhalten.

| Gemeinsamer Besitzer    | Verantwortung                                                 |
| ----------------------- | ------------------------------------------------------------- |
| AudioInputDeviceService | Verfügbare Aufnahmemikrofone und Gerätefreigabe               |
| AudioRecorder           | Mikrofonstream, MediaRecorder, geordnete Chunks und Abschluss |
| PcmAudioCapture         | Begrenzte PCM-Fragmente für Pegel- und Sprachaktivität        |
| PcmAudioStreamPlayer    | Gemeinsame gepufferte PCM-Ausgabe                             |
| AudioPlayer             | Gespeicherte Aufzeichnungen anhören                           |
| TextToSpeechService     | Gespeicherten Text mit Browser-/Systemstimme vorlesen         |
| DurableAudioChunkOutbox | Gemeinsam bereitgestellte IndexedDB-Outbox                    |

Produktkomposition liegt außerhalb des kopierten Dateisatzes. Der statische
Worklet-Loader verwendet dessen unveränderte Prozessordefinition als lokale
Datei. `tools/generate-audio-worklet.mjs --check` bestätigt die Übereinstimmung;
die strikte Skriptrichtlinie muss keine Blob-Skripte erlauben.

## Keyloser Live-Pfad

Resonanz verwendet die systemeigene Spracherkennung, den angemeldeten lokalen
Codex-/Claude-Assistenten über Synapse und native Sprachausgabe. Flamox-spezifische
Cloud-Audioverträge, Credits und API-Key-Einrichtung gehören nicht zum Produkt.
Die vorhandenen Audioprimitive bleiben dabei unverändert.

Der Renderer besitzt Mikrofonaufnahme, PCM-Auswertung, Wiedergabe und den
Stereo-Mediengraphen. Electron Main besitzt native Erkennung und Sprachclips.
Der Utility Process besitzt Gesprächskontext und Synapse-Ausführung.

- `speech.start/stop/listen` koordinieren die systemeigene Erkennung.
- `speech.result` trägt Session, Segmentkennung, Text, Finalität und Zeitmarken.
- Der Host persistiert einen finalen Teilnehmerbeitrag vor seiner Bestätigung.
- `live.respond` startet einen echten Assistententurn für diesen Gesprächsstand.
- `assistant.text/completed/failed` sind an dessen Session und Run-ID gebunden.
- `speech.synthesize` erstellt lokale WAV-Clips; eine geschützte Voice-URL erlaubt
  die Wiedergabe ohne allgemeine Dateisystemrechte im Renderer.

Der Renderer führt sprechbare Antwortabschnitte in geordneter Folge aus.
Tatsächliche Wiedergabe und Mikrofon gehen auf getrennte Kanäle des bestehenden
ConversationAudioRecorder. Nur vollständig abgespielte Antwortabschnitte werden
als Assistententranskript bestätigt. Ein unterbrochener Anfang bleibt im Audio;
sein ungehörter Rest wird nicht archiviert. Das native Systemmikrofon und
das Aufnahmemikrofon müssen bei Live dieselbe Standardquelle verwenden.

## Lebenszyklus und Begrenzungen

Eine gemeinsame Mikrofon-Lease verhindert parallele Recording-/Live-Starts.
Generationen trennen Session, Assistententurn und Sprachclip. Späte Ergebnisse
abgebrochener Arbeit dürfen weder eine neue Session verändern noch hörbar werden.
Während eigener Ausgabe wird die Erkennung passend pausiert; Unterbrechung gibt
das Hören wieder frei. Die Audioaktivität wird aus dem vorhandenen PCM-Pfad
bestimmt. Mute stoppt auch native Erkennung, nicht bloß die Archivspur.

Pause und Stop geben Mikrofon und native Erkennungsressourcen frei. Der
abschließende Browserchunk wird abgewartet und erst nach bestätigter Ablage wird
die Session finalisiert. Native Syntheseprozesse und Helper besitzen begrenzte,
abgewartete Bereinigung; fremde Prozesse bleiben unberührt.

`OrderedAudioChunkWriter` schreibt ab Sequenz 1 nacheinander über die typisierte
Desktop-Grenze. Der zurückgehaltene Audiopuffer ist auf 16MiB begrenzt. Ein
Datenträgerfehler erzeugt keine Bestätigungslücke; vorhandene vollständige Blöcke
bleiben als Teilaudio wiederherstellbar. Die Sessionablage bestätigt identische
Wiederholungen idempotent und verwirft abweichende Wiederholungen oder Lücken.

## Transkription und Vorlesen

Normale Aufzeichnungen können nach ihrem Abschluss automatisch transkribiert
werden. Die Option ist abschaltbar. Native Verfügbarkeit, ausgewählte Sprache und
Systemfreigaben werden unabhängig vom gespeicherten Audio beurteilt.

Auf macOS bleibt die vorhandene native Dateitranskription der Ausgangsweg.
Windows nutzt die verfügbare SAPI-Erkennung mit lokal decodiertem PCM-WAV.
Die Dateierkennung sammelt Ergebnisse bis zum nativen `RecognizeCompleted`-Ereignis.
Damit bleibt der letzte erkannte Abschnitt auch beim Dateiende erhalten;
erneute Erkennungsaufrufe nach WAV-Ende können laut
[Microsoft-Dokumentation](https://learn.microsoft.com/en-us/dotnet/api/system.speech.recognition.speechrecognitionengine.setinputtowavefile?view=netframework-4.8.1)
eine Ausnahme auslösen.
Der Browserdecoderpfad ist auf 64MiB WAV begrenzt und ersetzt das Originalarchiv
nicht. Ein fehlendes Sprachpaket erzeugt einen Einrichtungsfehler und keinen
Cloud-Fallback.

Für das Vorlesen gespeicherter Zusammenfassungen und Antworten wird weiterhin
`TextToSpeechService` unverändert genutzt. Seine Stimmen-, Sprach-, Rate-,
Tonhöhen-, Lautstärke- und Abbruchbehandlung bleiben identisch zu Flamox.
Live-Antworten verwenden native WAV-Clips, damit die gehörte Stimme tatsächlich
im Stereoarchiv enthalten ist.

## Prüfung

Der Herkunftscheck beweist die übernommenen Bytes. Unit- und kontrollierte
Medientests beweisen ihre jeweiligen Verträge; sie ersetzen kein reales
Sprachgespräch. Die aktuelle [Abnahme](../../project/abnahme.md) unterscheidet
synthetischen Mikrofoneingang, tatsächliche Systemstimme, native Spracherkennung,
wirkliche CLI-Inferenz und native Zielplattformstarts.
