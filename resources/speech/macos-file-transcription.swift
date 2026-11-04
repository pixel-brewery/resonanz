import Foundation
import AVFoundation
import CoreMedia
import Speech

private struct HelperFailure: Error {
    let code: String
    let message: String
    var domain: String? = nil
    var nativeCode: Int? = nil
}

private struct Arguments {
    let capabilities: Bool
    let prepare: Bool
    let locale: String
    let file: String?
    let startFrame: Int64?
    let frameCount: UInt32?

    init(_ values: [String]) throws {
        var options: [String: String] = [:]
        var probe = false
        var prepare = false
        var index = 0
        while index < values.count {
            let key = values[index]
            if ["--capabilities", "--prepare"].contains(key) && !probe && !prepare {
                probe = key == "--capabilities"
                prepare = key == "--prepare"
                index += 1
                continue
            }
            guard ["--locale", "--file", "--start-frame", "--frame-count"].contains(key),
                  options[key] == nil, index + 1 < values.count else {
                throw HelperFailure(code: "invalid-input", message: "Invalid transcription arguments.")
            }
            options[key] = values[index + 1]
            index += 2
        }
        guard let locale = options["--locale"], !locale.isEmpty, locale.utf8.count <= 80 else {
            throw HelperFailure(code: "invalid-input", message: "A recognition locale is required.")
        }
        self.capabilities = probe
        self.prepare = prepare
        self.locale = locale
        if probe || prepare {
            guard options.count == 1 else {
                throw HelperFailure(code: "invalid-input", message: "Invalid capability arguments.")
            }
            self.file = nil
            self.startFrame = nil
            self.frameCount = nil
        } else {
            guard options.count == 4, let file = options["--file"], (file as NSString).isAbsolutePath,
                  let start = options["--start-frame"].flatMap(Int64.init), start >= 0,
                  let count = options["--frame-count"].flatMap(UInt32.init), count > 0, count <= 800_000 else {
                throw HelperFailure(code: "invalid-input", message: "A bounded prepared audio range is required.")
            }
            self.file = file
            self.startFrame = start
            self.frameCount = count
        }
    }
}

/** Emits one machine-readable response; neither audio text nor paths are logged. */
private func writeJSON(_ value: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) else {
        FileHandle.standardOutput.write(Data("{\"error\":{\"code\":\"backend-failure\",\"message\":\"Invalid native response.\"}}\n".utf8))
        return
    }
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([10]))
}

/** Reads only the bounded PCM range selected by the desktop owner. */
private func readPreparedBuffer(_ arguments: Arguments) throws -> AVAudioPCMBuffer {
    guard let path = arguments.file, let start = arguments.startFrame, let count = arguments.frameCount else {
        throw HelperFailure(code: "invalid-input", message: "A prepared audio range is required.")
    }
    let file: AVAudioFile
    do {
        file = try AVAudioFile(forReading: URL(fileURLWithPath: path), commonFormat: .pcmFormatFloat32, interleaved: false)
    } catch {
        let native = error as NSError
        throw HelperFailure(code: "audio-read-failed", message: "The prepared audio could not be opened.", domain: native.domain, nativeCode: native.code)
    }
    guard file.processingFormat.sampleRate == 16_000, file.processingFormat.channelCount == 1,
          start < file.length, Int64(count) <= file.length - start,
          let input = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: count) else {
        throw HelperFailure(code: "invalid-input", message: "Prepared audio must be a valid mono 16 kHz range.")
    }
    file.framePosition = start
    try file.read(into: input, frameCount: count)
    guard input.frameLength == count else {
        throw HelperFailure(code: "audio-read-failed", message: "The prepared audio range was incomplete.")
    }
    return input
}

#if RESONANZ_SPEECH_ANALYZER
@available(macOS 26.0, *)
private func availableTranscriber(locale identifier: String) async throws -> (SpeechTranscriber, Bool) {
    guard SpeechTranscriber.isAvailable else {
        throw HelperFailure(code: "hardware-unavailable", message: "Local file recognition is unavailable on this Mac.")
    }
    guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: Locale(identifier: identifier)) else {
        throw HelperFailure(code: "unsupported-locale", message: "This recognition language is unsupported.")
    }
    let transcriber = SpeechTranscriber(locale: locale, preset: .timeIndexedProgressiveTranscription)
    let status = await AssetInventory.status(forModules: [transcriber])
    guard status != .unsupported else {
        throw HelperFailure(code: "assets-unavailable", message: "The local recognition model is unavailable.")
    }
    return (transcriber, status != .installed)
}

@available(macOS 26.0, *)
private func preparedBuffer(_ arguments: Arguments, transcriber: SpeechTranscriber) async throws -> AVAudioPCMBuffer {
    let input = try readPreparedBuffer(arguments)
    guard let format = await SpeechAnalyzer.bestAvailableAudioFormat(compatibleWith: [transcriber], considering: input.format),
          format.sampleRate > 0, format.sampleRate <= 48_000, format.channelCount <= 2 else {
        throw HelperFailure(code: "audio-format-unavailable", message: "No bounded recognition audio format is available.")
    }
    if input.format.isEqual(format) { return input }
    let capacity = UInt32(ceil(Double(input.frameLength) * format.sampleRate / input.format.sampleRate)) + 32
    guard let output = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: capacity),
          let converter = AVAudioConverter(from: input.format, to: format) else {
        throw HelperFailure(code: "audio-format-unavailable", message: "The recognition audio format could not be prepared.")
    }
    var supplied = false
    var conversionError: NSError?
    let status = converter.convert(to: output, error: &conversionError) { _, result in
        if supplied {
            result.pointee = .endOfStream
            return nil
        }
        supplied = true
        result.pointee = .haveData
        return input
    }
    guard status != .error, conversionError == nil, output.frameLength > 0 else {
        throw HelperFailure(code: "audio-read-failed", message: "The recognition audio conversion failed.")
    }
    return output
}

@available(macOS 26.0, *)
private func transcribe(_ arguments: Arguments, with transcriber: SpeechTranscriber) async throws -> [[String: Any]] {
    let buffer = try await preparedBuffer(arguments, transcriber: transcriber)
    let durationMs = Double(buffer.frameLength) / buffer.format.sampleRate * 1_000
    let analyzer = SpeechAnalyzer(modules: [transcriber])
    let resultTask = Task { () throws -> [[String: Any]] in
        var segments: [[String: Any]] = []
        for try await result in transcriber.results {
            guard result.isFinal else { continue }
            let attributed = result.text
            var fragments: [(String, CMTimeRange)] = []
            var prefix = ""
            for run in attributed.runs {
                let text = String(attributed[run.range].characters)
                if let range = run.audioTimeRange {
                    fragments.append((prefix + text, range))
                    prefix = ""
                } else if !fragments.isEmpty {
                    fragments[fragments.count - 1].0 += text
                } else {
                    prefix += text
                }
            }
            if fragments.isEmpty { fragments = [(String(attributed.characters), result.range)] }
            for (rawText, range) in fragments {
                let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
                guard !text.isEmpty else { continue }
                let start = max(0, CMTimeGetSeconds(range.start) * 1_000)
                let end = min(durationMs, CMTimeGetSeconds(CMTimeRangeGetEnd(range)) * 1_000)
                guard start.isFinite, end.isFinite, start <= end else {
                    throw HelperFailure(code: "invalid-result", message: "Native recognition returned invalid timestamps.")
                }
                guard segments.count < 1_000, text.utf8.count <= 40_000 else {
                    throw HelperFailure(code: "invalid-result", message: "Native recognition exceeded the result limit.")
                }
                segments.append(["text": text, "startMs": Int(start.rounded()), "endMs": Int(end.rounded())])
            }
        }
        return segments
    }
    let input = AsyncStream<AnalyzerInput> { continuation in
        continuation.yield(AnalyzerInput(buffer: buffer))
        continuation.finish()
    }
    do {
        if let end = try await analyzer.analyzeSequence(input) {
            try await analyzer.finalizeAndFinish(through: end)
        } else {
            await analyzer.cancelAndFinishNow()
        }
        return try await resultTask.value
    } catch {
        resultTask.cancel()
        await analyzer.cancelAndFinishNow()
        _ = await resultTask.result
        throw error
    }
}
#endif

private func legacyRecognizer(locale: String) throws -> SFSpeechRecognizer {
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: locale)) else {
        throw HelperFailure(code: "unsupported-locale", message: "This recognition language is unsupported.")
    }
    guard recognizer.supportsOnDeviceRecognition else {
        throw HelperFailure(code: "assets-unavailable", message: "Local recognition is unavailable for this language.")
    }
    guard recognizer.isAvailable else {
        throw HelperFailure(code: "backend-unavailable", message: "Local speech recognition is unavailable.")
    }
    let authorization = SFSpeechRecognizer.authorizationStatus()
    guard authorization != .denied && authorization != .restricted else {
        throw HelperFailure(code: "permission-denied", message: "Speech recognition permission was denied.")
    }
    return recognizer
}

/** Resolves exactly once and retains the native task through its final callback. */
private final class LegacyCompletion: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<[[String: Any]], Error>?
    private var task: SFSpeechRecognitionTask?

    init(_ continuation: CheckedContinuation<[[String: Any]], Error>) {
        self.continuation = continuation
    }

    func attach(_ task: SFSpeechRecognitionTask) {
        lock.lock()
        let finished = continuation == nil
        if !finished { self.task = task }
        lock.unlock()
        if finished { task.cancel() }
    }

    func finish(_ result: Result<[[String: Any]], Error>) {
        lock.lock()
        let continuation = self.continuation
        self.continuation = nil
        self.task = nil
        lock.unlock()
        continuation?.resume(with: result)
    }
}

private func authorizeLegacy() async throws {
    let status: SFSpeechRecognizerAuthorizationStatus
    if SFSpeechRecognizer.authorizationStatus() == .notDetermined {
        status = await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { continuation.resume(returning: $0) }
        }
    } else {
        status = SFSpeechRecognizer.authorizationStatus()
    }
    guard status == .authorized else {
        throw HelperFailure(code: "permission-denied", message: "Speech recognition permission was denied.")
    }
}

private func transcribeLegacy(_ arguments: Arguments, recognizer: SFSpeechRecognizer) async throws -> [[String: Any]] {
    let buffer = try readPreparedBuffer(arguments)
    let durationMs = Double(buffer.frameLength) / buffer.format.sampleRate * 1_000
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.requiresOnDeviceRecognition = true
    request.shouldReportPartialResults = false
    request.taskHint = .dictation
    return try await withCheckedThrowingContinuation { continuation in
        let completion = LegacyCompletion(continuation)
        let task = recognizer.recognitionTask(with: request) { result, error in
            if let error {
                let native = error as NSError
                if native.domain == "kAFAssistantErrorDomain" && native.code == 1110 {
                    completion.finish(.success([]))
                } else {
                    completion.finish(.failure(HelperFailure(code: "backend-failure", message: "Local file recognition failed.", domain: native.domain, nativeCode: native.code)))
                }
                return
            }
            guard let result, result.isFinal else { return }
            let segments = result.bestTranscription.segments
            guard segments.count <= 1_000 else {
                completion.finish(.failure(HelperFailure(code: "invalid-result", message: "Native recognition exceeded the result limit.")))
                return
            }
            var values: [[String: Any]] = []
            for segment in segments {
                let start = max(0, segment.timestamp * 1_000)
                let end = min(durationMs, (segment.timestamp + segment.duration) * 1_000)
                guard start.isFinite, end.isFinite, start <= end, segment.substring.utf8.count <= 40_000 else {
                    completion.finish(.failure(HelperFailure(code: "invalid-result", message: "Native recognition returned invalid results.")))
                    return
                }
                if !segment.substring.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                    values.append(["text": segment.substring, "startMs": Int(start.rounded()), "endMs": Int(end.rounded())])
                }
            }
            completion.finish(.success(values))
        }
        completion.attach(task)
        request.append(buffer)
        request.endAudio()
    }
}

@main
private struct ResonanzFileTranscriber {
    static func main() async {
        do {
            let arguments = try Arguments(Array(CommandLine.arguments.dropFirst()))
#if RESONANZ_SPEECH_ANALYZER
            if #available(macOS 26.0, *) {
                let transcriber: SpeechTranscriber
                let needsDownload: Bool
                do {
                    (transcriber, needsDownload) = try await availableTranscriber(locale: arguments.locale)
                } catch let error as HelperFailure where arguments.capabilities {
                    writeJSON(["available": false, "backend": "analyzer", "reason": error.code])
                    return
                }
                if arguments.capabilities {
                    writeJSON(["available": true, "backend": "analyzer", "needsDownload": needsDownload])
                    return
                }
                if arguments.prepare {
                    if needsDownload {
                        let installation = try await AssetInventory.assetInstallationRequest(supporting: [transcriber])
                        try await installation?.downloadAndInstall()
                    }
                    guard await AssetInventory.status(forModules: [transcriber]) == .installed else {
                        throw HelperFailure(code: "assets-unavailable", message: "The local recognition model was not installed.")
                    }
                    writeJSON(["prepared": true])
                    return
                }
                guard !needsDownload else {
                    throw HelperFailure(code: "assets-unavailable", message: "The local recognition model must be prepared first.")
                }
                writeJSON(["segments": try await transcribe(arguments, with: transcriber)])
                return
            }
#endif
            let recognizer: SFSpeechRecognizer
            do {
                recognizer = try legacyRecognizer(locale: arguments.locale)
            } catch let error as HelperFailure where arguments.capabilities {
                writeJSON(["available": false, "backend": "legacy", "reason": error.code])
                return
            }
            if arguments.capabilities {
                writeJSON(["available": true, "backend": "legacy", "needsAuthorization": SFSpeechRecognizer.authorizationStatus() == .notDetermined])
                return
            }
            try await authorizeLegacy()
            if arguments.prepare { writeJSON(["prepared": true]); return }
            writeJSON(["segments": try await transcribeLegacy(arguments, recognizer: recognizer)])
        } catch {
            let native = error as NSError
            let failure = error as? HelperFailure ?? HelperFailure(code: "backend-failure", message: "Native file recognition failed.", domain: native.domain, nativeCode: native.code)
            var payload: [String: Any] = ["code": failure.code, "message": failure.message]
            if let domain = failure.domain { payload["domain"] = domain }
            if let code = failure.nativeCode { payload["nativeCode"] = code }
            writeJSON(["error": payload])
            exit(1)
        }
    }
}
