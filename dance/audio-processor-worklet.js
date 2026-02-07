/**
 * AudioWorklet Processor
 */
class AudioCaptureProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        // Use the bufferSize passed from the main thread or default to 4096
        this.bufferSize = (options.processorOptions && options.processorOptions.bufferSize) || 4096;
        this.buffer = new Float32Array(this.bufferSize);
        this.bufferIndex = 0;
    }

    process(inputs, outputs, parameters) {
        const input = inputs[0]; // First input
        if (!input || input.length === 0) return true;

        const channelData = input[0]; // First channel (mono)

        // Process each sample in the current block (usually 128 samples)
        for (let i = 0; i < channelData.length; i++) {
            this.buffer[this.bufferIndex] = channelData[i];
            this.bufferIndex++;

            // If we've reached our target buffer size, send it to the main thread
            if (this.bufferIndex >= this.bufferSize) {
                // We send a copy of the buffer (slice) to avoid shared memory issues
                this.port.postMessage(this.buffer.slice());
                this.bufferIndex = 0;
            }
        }

        return true; // Keep the processor alive
    }
}

registerProcessor('audio-capture-processor', AudioCaptureProcessor);
