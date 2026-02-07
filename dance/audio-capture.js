class AudioCapture {
    constructor() {
        this.stream = null;
        this.audioContext = null;
        this.audioWorkletNode = null; // Replaces this.processor
        this.source = null;
        this.isCapturing = false;
        this.onAudioData = null;

        this.sampleRate = 16000;
        this.bufferSize = 4096;
    }

    async initialize() {
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    sampleRate: this.sampleRate,
                    echoCancellation: true,
                    noiseSuppression: true
                }
            });

            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: this.sampleRate
            });

            // Load the worklet module
            const basePath = window.__basePath || '';
            await this.audioContext.audioWorklet.addModule(basePath + "audio-processor-worklet.js");

            this.source = this.audioContext.createMediaStreamSource(this.stream);

            // Create the worklet node
            this.audioWorkletNode = new AudioWorkletNode(this.audioContext, "audio-capture-processor", {
                // Pass bufferSize to the processor if needed, 
                // though we've hardcoded 4096 in the worklet for now
                processorOptions: { bufferSize: this.bufferSize }
            });

            // Handle data coming from the Worklet
            this.audioWorkletNode.port.onmessage = (event) => {
                if (this.isCapturing && this.onAudioData) {
                    const float32Data = event.data;
                    const pcmData = this._floatTo16BitPCM(float32Data);
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
        if (!this.audioContext || !this.audioWorkletNode) {
            console.error('Audio capture not initialized');
            return false;
        }

        this.onAudioData = callback;
        
        // Connect the graph
        this.source.connect(this.audioWorkletNode);
        this.audioWorkletNode.connect(this.audioContext.destination);
        
        this.isCapturing = true;
        console.log('Audio capture started');
        return true;
    }

    stop() {
        if (this.audioWorkletNode) {
            this.audioWorkletNode.disconnect();
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
        this.audioWorkletNode = null;
        this.source = null;
        console.log('Audio capture destroyed');
    }

    _floatTo16BitPCM(floatArray) {
        const buffer = new ArrayBuffer(floatArray.length * 2);
        const view = new DataView(buffer);
        for (let i = 0; i < floatArray.length; i++) {
            let val = Math.max(-1, Math.min(1, floatArray[i]));
            val = val < 0 ? val * 0x8000 : val * 0x7FFF;
            view.setInt16(i * 2, val, true);
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

window.audioCapture = new AudioCapture();
