/**
 * Self-contained Web Audio processor definition used by the default module loader.
 *
 * @private
 */
export const PCM_AUDIO_WORKLET_DEFINITION = Object.freeze({
    captureProcessorName: 'flamox-pcm-capture',
    playbackProcessorName: 'flamox-pcm-playback',
    source: String.raw`
class FlamoxPcmCaptureProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const configuration = options.processorOptions || {};
        this.channelCount = configuration.channelCount;
        this.samplesPerFrame = configuration.samplesPerFrame;
        this.frame = new Int16Array(this.samplesPerFrame * this.channelCount);
        this.writeOffset = 0;
        this.port.onmessage = (event) => this.onMessage(event.data);
    }

    onMessage(message) {
        if (!message || message.type !== 'flush') {
            return;
        }

        this.emitFrame();
        this.port.postMessage({ type: 'flushed', requestId: message.requestId });
    }

    encodeSample(sample) {
        const clamped = Math.max(-1, Math.min(1, sample));
        return clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);
    }

    readSample(input, targetChannel, sampleIndex) {
        if (this.channelCount === 1) {
            let sum = 0;
            let contributingChannels = 0;

            for (const channel of input) {
                if (sampleIndex < channel.length) {
                    sum += channel[sampleIndex];
                    contributingChannels += 1;
                }
            }

            return contributingChannels === 0 ? 0 : sum / contributingChannels;
        }

        const sourceChannel = input[Math.min(targetChannel, input.length - 1)];
        return sourceChannel && sampleIndex < sourceChannel.length ? sourceChannel[sampleIndex] : 0;
    }

    emitFrame() {
        if (this.writeOffset === 0) {
            return;
        }

        const sampleCount = this.writeOffset / this.channelCount;
        const payload = this.writeOffset === this.frame.length
            ? this.frame.buffer
            : this.frame.slice(0, this.writeOffset).buffer;

        this.port.postMessage({ type: 'frame', data: payload, sampleCount }, [payload]);
        this.frame = new Int16Array(this.samplesPerFrame * this.channelCount);
        this.writeOffset = 0;
    }

    process(inputs) {
        const input = inputs[0];

        if (!input || input.length === 0) {
            return true;
        }

        let blockLength = 0;
        for (const channel of input) {
            blockLength = Math.max(blockLength, channel.length);
        }

        for (let sampleIndex = 0; sampleIndex < blockLength; sampleIndex += 1) {
            for (let channelIndex = 0; channelIndex < this.channelCount; channelIndex += 1) {
                this.frame[this.writeOffset] = this.encodeSample(this.readSample(input, channelIndex, sampleIndex));
                this.writeOffset += 1;
            }

            if (this.writeOffset === this.frame.length) {
                this.emitFrame();
            }
        }

        return true;
    }
}

class FlamoxPcmPlaybackProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const configuration = options.processorOptions || {};
        this.channelCount = configuration.channelCount;
        this.initialBufferSampleCount = configuration.initialBufferSampleCount;
        this.maxBufferSampleCount = configuration.maxBufferSampleCount;
        this.progressThreshold = Math.max(128, Math.round(sampleRate / 20));
        this.queue = [];
        this.queuedSampleCount = 0;
        this.consumedSinceProgress = 0;
        this.flushRequestId = null;
        this.playing = false;
        this.port.onmessage = (event) => this.onMessage(event.data);
    }

    onMessage(message) {
        if (!message || typeof message.type !== 'string') {
            return;
        }

        try {
            if (message.type === 'append') {
                this.append(message.data);
            } else if (message.type === 'flush') {
                this.flushRequestId = message.requestId;
                this.startIfReady(true);
                this.finishDrainIfEmpty();
            } else if (message.type === 'clear') {
                this.clear(message.requestId);
            }
        } catch (error) {
            this.port.postMessage({
                type: 'processor-error',
                message: error instanceof Error ? error.message : 'Realtime PCM playback failed.'
            });
        }
    }

    append(data) {
        const samples = new Int16Array(data);

        if (samples.length === 0 || samples.length % this.channelCount !== 0) {
            throw new Error('PCM playback payload has an invalid channel alignment.');
        }

        const sampleCount = samples.length / this.channelCount;

        if (this.queuedSampleCount + sampleCount > this.maxBufferSampleCount) {
            this.port.postMessage({ type: 'overflow', rejectedSampleCount: sampleCount });
            return;
        }

        this.queue.push({ samples, offset: 0, sampleCount });
        this.queuedSampleCount += sampleCount;
        this.port.postMessage({ type: 'buffered', bufferedSampleCount: this.queuedSampleCount });
        this.startIfReady(false);
    }

    clear(requestId) {
        const discardedSampleCount = this.queuedSampleCount;
        const interruptedFlushRequestId = this.flushRequestId;

        this.queue = [];
        this.queuedSampleCount = 0;
        this.consumedSinceProgress = 0;
        this.flushRequestId = null;
        this.playing = false;

        if (interruptedFlushRequestId !== null) {
            this.port.postMessage({ type: 'drained', requestId: interruptedFlushRequestId, interrupted: true });
        }

        this.port.postMessage({ type: 'cleared', requestId, discardedSampleCount });
    }

    startIfReady(force) {
        if (this.playing || this.queuedSampleCount === 0) {
            return;
        }

        if (force || this.queuedSampleCount >= this.initialBufferSampleCount) {
            this.playing = true;
            this.port.postMessage({ type: 'playback-started' });
        }
    }

    emitProgress() {
        if (this.consumedSinceProgress === 0) {
            return;
        }

        this.port.postMessage({
            type: 'progress',
            consumedSampleCount: this.consumedSinceProgress,
            bufferedSampleCount: this.queuedSampleCount
        });
        this.consumedSinceProgress = 0;
    }

    finishDrainIfEmpty() {
        if (this.flushRequestId === null || this.queuedSampleCount !== 0) {
            return;
        }

        const requestId = this.flushRequestId;
        this.flushRequestId = null;
        this.playing = false;
        this.emitProgress();
        this.port.postMessage({ type: 'drained', requestId, interrupted: false });
    }

    readNextSample(channelIndex) {
        const current = this.queue[0];

        if (!current) {
            return 0;
        }

        const sample = current.samples[current.offset * this.channelCount + channelIndex] || 0;
        return sample < 0 ? sample / 32768 : sample / 32767;
    }

    advanceFrame() {
        const current = this.queue[0];

        if (!current) {
            return;
        }

        current.offset += 1;
        this.queuedSampleCount -= 1;
        this.consumedSinceProgress += 1;

        if (current.offset >= current.sampleCount) {
            this.queue.shift();
        }
    }

    process(_inputs, outputs) {
        const output = outputs[0];

        if (!output || output.length === 0) {
            return true;
        }

        for (const channel of output) {
            channel.fill(0);
        }

        this.startIfReady(this.flushRequestId !== null);

        if (!this.playing) {
            this.finishDrainIfEmpty();
            return true;
        }

        const blockLength = output[0].length;

        for (let sampleIndex = 0; sampleIndex < blockLength; sampleIndex += 1) {
            if (this.queuedSampleCount === 0) {
                break;
            }

            for (let channelIndex = 0; channelIndex < output.length; channelIndex += 1) {
                output[channelIndex][sampleIndex] = this.readNextSample(channelIndex);
            }

            this.advanceFrame();
        }

        if (this.consumedSinceProgress >= this.progressThreshold || this.queuedSampleCount === 0) {
            this.emitProgress();
        }

        if (this.queuedSampleCount === 0) {
            if (this.flushRequestId !== null) {
                this.finishDrainIfEmpty();
            } else if (this.playing) {
                this.playing = false;
                this.port.postMessage({ type: 'underrun' });
            }
        }

        return true;
    }
}

registerProcessor('flamox-pcm-capture', FlamoxPcmCaptureProcessor);
registerProcessor('flamox-pcm-playback', FlamoxPcmPlaybackProcessor);
`
});
