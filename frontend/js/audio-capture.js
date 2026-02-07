/**
 * Audio Capture Module
 * Handles microphone access and audio streaming
 */

class AudioCapture {
    constructor() {
        this.stream = null;
        this.audioContext = null;
        this.processor = null;
        this.source = null;
        this.isCapturing = false;
        this.onAudioData = null;

        // Audio settings (must match backend)
        this.sampleRate = 16000;
        this.bufferSize = 4096;
    }

    async initialize() {
        try {
            // Request microphone access
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: this.sampleRate,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            // Create audio context with target sample rate
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate
            });

            // Create media stream source
            this.source = this.audioContext.createMediaStreamSource(this.stream);

            // Create script processor for audio data access
            this.processor = this.audioContext.createScriptProcessor(
                this.bufferSize,
                1,  // input channels
                1   // output channels
            );

            this.processor.onaudioprocess = (event) => {
                if (this.isCapturing && this.onAudioData) {
                    const inputData = event.inputBuffer.getChannelData(0);
                    const pcmData = this._floatTo16BitPCM(inputData);
                    this.onAudioData(pcmData);
                }
            };

            console.log('Audio capture initialized');
            return true;

        } catch (error) {
            console.error('Failed to initialize audio capture:', error);
            return false;
        }
    }

    start(callback) {
        if (!this.audioContext || !this.processor) {
            console.error('Audio capture not initialized');
            return false;
        }

        this.onAudioData = callback;
        this.source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
        this.isCapturing = true;

        console.log('Audio capture started');
        return true;
    }

    stop() {
        if (this.processor) {
            this.processor.disconnect();
        }
        if (this.source) {
            this.source.disconnect();
        }
        this.isCapturing = false;
        this.onAudioData = null;

        console.log('Audio capture stopped');
    }

    destroy() {
        this.stop();

        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
        }

        if (this.audioContext) {
            this.audioContext.close();
        }

        this.stream = null;
        this.audioContext = null;
        this.processor = null;
        this.source = null;

        console.log('Audio capture destroyed');
    }

    _floatTo16BitPCM(floatArray) {
        const buffer = new ArrayBuffer(floatArray.length * 2);
        const view = new DataView(buffer);

        for (let i = 0; i < floatArray.length; i++) {
            // Clamp value to [-1, 1]
            let val = Math.max(-1, Math.min(1, floatArray[i]));
            // Convert to 16-bit integer
            val = val < 0 ? val * 0x8000 : val * 0x7FFF;
            view.setInt16(i * 2, val, true); // little-endian
        }

        return buffer;
    }

    isActive() {
        return this.isCapturing;
    }

    async resume() {
        if (this.audioContext && this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }
}

// Export singleton
window.audioCapture = new AudioCapture();
