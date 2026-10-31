param([ValidateSet('inspect', 'listen', 'synthesize', 'transcribe')][string]$Mode)
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -AssemblyName System.Speech
Add-Type -AssemblyName System.Web.Extensions
Add-Type -ReferencedAssemblies System.Speech,System.Web.Extensions -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.Speech.Recognition;
using System.Speech.Synthesis;
using System.Web.Script.Serialization;

public static class ResonanzSystemSpeech {
    private static readonly object OutputLock = new object();
    public static void Emit(object value) {
        lock (OutputLock) {
            Console.WriteLine(new JavaScriptSerializer().Serialize(value));
            Console.Out.Flush();
        }
    }
    public static void Inspect() {
        var locales = new List<string>();
        foreach (var recognizer in SpeechRecognitionEngine.InstalledRecognizers())
            if (!locales.Contains(recognizer.Culture.Name)) locales.Add(recognizer.Culture.Name);
        var voices = new List<object>();
        using (var synth = new SpeechSynthesizer()) {
            foreach (var voice in synth.GetInstalledVoices())
                if (voice.Enabled) voices.Add(new { id = voice.VoiceInfo.Name, name = voice.VoiceInfo.Name, locale = voice.VoiceInfo.Culture.Name });
        }
        Emit(new { locales = locales, voices = voices });
    }
    public static void Listen(string locale) {
        using (var engine = new SpeechRecognitionEngine(new CultureInfo(locale))) {
            var clock = Stopwatch.StartNew();
            engine.LoadGrammar(new DictationGrammar());
            engine.SetInputToDefaultAudioDevice();
            engine.SpeechHypothesized += (sender, e) => Emit(new { type = "result", text = e.Result.Text, isFinal = false, timestampMs = clock.ElapsedMilliseconds });
            engine.SpeechRecognized += (sender, e) => Emit(new { type = "result", text = e.Result.Text, isFinal = true, timestampMs = clock.ElapsedMilliseconds });
            engine.RecognizeCompleted += (sender, e) => {
                if (e.Error != null) Emit(new { type = "error", message = "Die native Spracherkennung wurde unterbrochen." });
            };
            engine.RecognizeAsync(RecognizeMode.Multiple);
            Emit(new { type = "ready" });
            // The bridge has one owned recognizer and ends when its host closes stdin.
            while (Console.ReadLine() != null) break;
            engine.RecognizeAsyncCancel();
        }
    }
    public static void Synthesize(string text, string voice, string path) {
        using (var synth = new SpeechSynthesizer()) {
            if (!String.IsNullOrEmpty(voice)) synth.SelectVoice(voice);
            synth.SetOutputToWaveFile(path);
            synth.Speak(text);
            synth.SetOutputToNull();
        }
        Emit(new { complete = true });
    }
    public static void Transcribe(string locale, string path) {
        var segments = new List<object>();
        using (var engine = new SpeechRecognitionEngine(new CultureInfo(locale))) {
            engine.LoadGrammar(new DictationGrammar());
            engine.SetInputToWaveFile(path);
            RecognitionResult result;
            while ((result = engine.Recognize()) != null) {
                if (!String.IsNullOrWhiteSpace(result.Text)) {
                    var start = result.Audio == null ? 0 : result.Audio.AudioPosition.TotalMilliseconds;
                    var end = result.Audio == null ? start : start + result.Audio.Duration.TotalMilliseconds;
                    segments.Add(new { id = Guid.NewGuid().ToString(), text = result.Text, startMs = start, endMs = end });
                }
                if (segments.Count > 20000) throw new InvalidOperationException();
            }
        }
        Emit(new { segments = segments });
    }
}
'@
try {
    $configuration = [Console]::ReadLine() | ConvertFrom-Json
    switch ($Mode) {
        'inspect' { [ResonanzSystemSpeech]::Inspect() }
        'listen' { [ResonanzSystemSpeech]::Listen($configuration.locale) }
        'synthesize' { [ResonanzSystemSpeech]::Synthesize($configuration.text, $configuration.voice, $configuration.outputPath) }
        'transcribe' { [ResonanzSystemSpeech]::Transcribe($configuration.locale, $configuration.filePath) }
    }
} catch {
    [Console]::Error.WriteLine('Die native Windows-Sprachfunktion ist nicht verfügbar. Prüfe installierte Erkennungssprache, Stimme und Mikrofonfreigabe.')
    exit 1
}
