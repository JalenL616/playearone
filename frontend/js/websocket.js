/**
 * WebSocket Client Module
 * Handles connection and messaging with the backend
 */

class WebSocketClient {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 2000;

        // Event handlers
        this.onConnect = null;
        this.onDisconnect = null;
        this.onMessage = null;
        this.onError = null;

        // Determine WebSocket URL based on current location
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.hostname || 'localhost';
        const port = window.location.port || '8000';
        this.url = `${protocol}//${host}:${port}/ws`;
    }

    connect() {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            console.log('Already connected');
            return;
        }

        console.log('Connecting to:', this.url);

        try {
            this.socket = new WebSocket(this.url);
            this.socket.binaryType = 'arraybuffer';

            this.socket.onopen = () => {
                console.log('WebSocket connected');
                this.isConnected = true;
                this.reconnectAttempts = 0;
                if (this.onConnect) this.onConnect();
            };

            this.socket.onclose = (event) => {
                console.log('WebSocket disconnected:', event.code, event.reason);
                this.isConnected = false;
                if (this.onDisconnect) this.onDisconnect();
                this._scheduleReconnect();
            };

            this.socket.onerror = (error) => {
                console.error('WebSocket error:', error);
                if (this.onError) this.onError(error);
            };

            this.socket.onmessage = (event) => {
                if (typeof event.data === 'string') {
                    try {
                        const message = JSON.parse(event.data);
                        if (this.onMessage) this.onMessage(message);
                    } catch (e) {
                        console.error('Failed to parse message:', e);
                    }
                }
            };

        } catch (error) {
            console.error('Failed to create WebSocket:', error);
            this._scheduleReconnect();
        }
    }

    disconnect() {
        this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
        if (this.socket) {
            this.socket.close();
            this.socket = null;
        }
        this.isConnected = false;
    }

    sendAudio(audioBuffer) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(audioBuffer);
        }
    }

    sendMessage(message) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(message));
        }
    }

    // Convenience methods for specific messages
    startListening() {
        this.sendMessage({ type: 'start_listening' });
    }

    stopListening() {
        this.sendMessage({ type: 'stop_listening' });
    }

    startEnrollment(name) {
        this.sendMessage({ type: 'start_enrollment', name });
    }

    completeEnrollment(name) {
        this.sendMessage({ type: 'complete_enrollment', name });
    }

    cancelEnrollment() {
        this.sendMessage({ type: 'cancel_enrollment' });
    }

    listSpeakers() {
        this.sendMessage({ type: 'list_speakers' });
    }

    removeSpeaker(name) {
        this.sendMessage({ type: 'remove_speaker', name });
    }

    ping() {
        this.sendMessage({ type: 'ping' });
    }

    _scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log('Max reconnect attempts reached');
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay * this.reconnectAttempts;
        console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

        setTimeout(() => {
            if (!this.isConnected) {
                this.connect();
            }
        }, delay);
    }
}

// Export singleton
window.wsClient = new WebSocketClient();
