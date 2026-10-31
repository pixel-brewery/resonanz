# Resonanz audio

Browserseitige Audiofunktionen aus dem FLAMOX365-Frontend. Die in
[`provenance.json`](provenance.json) erfassten 51 Produktionsdateien und 12
Verhaltensspezifikationen sind unveränderte Kopien der dort genannten Quellen.
Der Renderer konsumiert das private Workspace-Paket als `@resonanz/audio`.

## Enthaltene Funktionen

- Mikrofone erkennen, Berechtigung anfragen und den Signalpegel prüfen.
- Audio in geordneten MediaRecorder-Chunks aufnehmen, pausieren und beenden.
- Bestehende Aufnahmen abspielen.
- Text mit den verfügbaren Browser-/Betriebssystemstimmen vorlesen.
- PCM-Audio über AudioWorklets aufnehmen, umwandeln und gepuffert abspielen.
- Audio-Chunks in einer IndexedDB-Outbox bis zur bestätigten Übertragung halten.
- Vorhandene Strategien für browserseitige oder HTTP-basierte Transkription.

## Angular-Komposition

`provideAudioServices()` registriert `AudioRecorder`, `AudioPlayer`,
`AudioInputDeviceService`, `PcmAudioCapture`, `PcmAudioStreamPlayer` und den
standardmäßigen Worklet-Lader. Ein optionaler `IVoiceTranscriber` kann übergeben
oder separat über `VOICE_TRANSCRIBER` registriert werden.

`TextToSpeechService`, `DurableAudioChunkOutbox` und
`AudioChunkChecksumService` verwenden die unveränderte Angular-Registrierung
`providedIn: 'root'`.

Der Host kann `RealtimeAudioWorkletModuleLoader` ersetzen, wenn seine
Content-Security-Policy einen statischen Worklet anstelle einer kurzlebigen
Blob-URL verlangt. Aufnahme, DSP und Wiedergabe bleiben dabei unverändert.

## Herkunft und Gleichheit prüfen

```sh
node libs/audio/verify-provenance.mjs
```

Die Prüfung benötigt keinen Zugriff auf das private Quellrepository. Sie
vergleicht jede kopierte Datei mit ihrem gespeicherten SHA-256-Wert. Eine
bewusste Quellenaktualisierung muss Commit, Herkunftspfade und Hashes gemeinsam
aktualisieren. Produktanpassungen gehören in Hostadapter außerhalb der
kopierten Implementierungen.

Die neuen Exportdateien, `provideAudioServices`, die Testumgebung und der
Prüfer sind Resonanz-eigene Komposition und stehen deshalb nicht in der Liste
unveränderter Quelldateien.

## Prüfung des Verhaltens

`vitest.config.mts` führt die übernommenen Spezifikationen mit einer
Angular-Testumgebung in jsdom und einem Worker aus. Dafür werden neben Angular
und RxJS die Entwicklungsabhängigkeiten `vitest`, `jsdom`,
`@angular/compiler`, `@angular/platform-browser` und `fake-indexeddb` benötigt.
Die Tests prüfen unter anderem Chunk-Reihenfolge, Abbruch, Ressourcenfreigabe,
PCM-Konvertierung, Puffergrenzen und persistente Wiederholungen.

Diese Tests ersetzen weder eine echte Mikrofonaufnahme noch die Prüfung der
ausgelieferten Electron-Anwendung und ihrer Berechtigungen.

Siehe [Audioarchitektur](../../docs/architecture/audio/README.md) für
Verantwortlichkeiten, Hostadapter und die Unterscheidung zwischen Vorlesen,
lokaler Assistentenunterhaltung und duplexer Provider-Verbindung.
