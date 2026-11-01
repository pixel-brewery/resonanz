param([ValidateSet('inspect', 'listen', 'synthesize', 'transcribe')][string]$Mode, [switch]$Diagnostics)
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
using System.Threading;
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
                if (e.Error != null) Emit(new { type = "error", message = "loc.resonanz.error.recognitionInterrupted" });
            };
            engine.RecognizeAsync(RecognizeMode.Multiple);
            Emit(new { type = "ready" });
            // The bridge has one owned recognizer and ends when its host closes stdin.
            while (Console.ReadLine() != null) break;
            engine.RecognizeAsyncCancel();
        }
    }
    public static void Synthesize(string text, string voice, string path, int rate) {
        using (var synth = new SpeechSynthesizer()) {
            if (!String.IsNullOrEmpty(voice)) synth.SelectVoice(voice);
            synth.Rate = rate;
            synth.SetOutputToWaveFile(path);
            synth.Speak(text);
            synth.SetOutputToNull();
        }
        Emit(new { complete = true });
    }
    public static void Transcribe(string locale, string path) {
        var segments = new List<object>();
        using (var engine = new SpeechRecognitionEngine(new CultureInfo(locale)))
        using (var finished = new ManualResetEvent(false)) {
            Exception failure = null;
            engine.LoadGrammar(new DictationGrammar());
            engine.SetInputToWaveFile(path);
            engine.SpeechRecognized += (sender, e) => {
                var result = e.Result;
                if (result == null) return;
                if (!String.IsNullOrWhiteSpace(result.Text)) {
                    if (segments.Count >= 20000) {
                        failure = new InvalidOperationException("The transcript exceeds its segment limit.");
                        engine.RecognizeAsyncCancel();
                        return;
                    }
                    var start = result.Audio == null ? 0 : result.Audio.AudioPosition.TotalMilliseconds;
                    var end = result.Audio == null ? start : start + result.Audio.Duration.TotalMilliseconds;
                    segments.Add(new { id = Guid.NewGuid().ToString(), text = result.Text, startMs = start, endMs = end });
                }
            };
            engine.RecognizeCompleted += (sender, e) => {
                if (e.Error != null) failure = e.Error;
                finished.Set();
            };
            // The stream ends through RecognizeCompleted; restarting a synchronous
            // recognition operation after WAV EOF can throw and discard valid text.
            engine.RecognizeAsync(RecognizeMode.Multiple);
            if (!finished.WaitOne(150000)) {
                engine.RecognizeAsyncCancel();
                finished.WaitOne(5000);
                throw new TimeoutException("Native file recognition timed out.");
            }
            if (failure != null) throw new InvalidOperationException("Native file recognition failed.", failure);
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
        'synthesize' { [ResonanzSystemSpeech]::Synthesize($configuration.text, $configuration.voice, $configuration.outputPath, [int]$configuration.rate) }
        'transcribe' { [ResonanzSystemSpeech]::Transcribe($configuration.locale, $configuration.filePath) }
    }
} catch {
    if ($Diagnostics) {
        $exception = $_.Exception
        while ($null -ne $exception) {
            [Console]::Error.WriteLine($exception.GetType().FullName + ': ' + $exception.Message)
            $exception = $exception.InnerException
        }
    }
    [Console]::Error.WriteLine('Native Windows speech is unavailable. Check installed recognition languages, voices and microphone permission.')
    exit 1
}
