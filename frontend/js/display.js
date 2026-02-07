/**
 * Display Module
 * Main application controller and UI updates
 */

class DisplayManager {
    constructor() {
        this.commandCount = 0;
        this.activeSpeakers = new Set();
        this.isListening = false;
    }

    initialize() {
        // Initialize tabs
        this.initializeTabs();

        // Initialize buttons
        document.getElementById('startListening').addEventListener('click', () => this.startListening());
        document.getElementById('stopListening').addEventListener('click', () => this.stopListening());
        document.getElementById('refreshSpeakers').addEventListener('click', () => this.refreshSpeakers());

        // Initialize WebSocket handlers
        window.wsClient.onConnect = () => this.handleConnect();
        window.wsClient.onDisconnect = () => this.handleDisconnect();
        window.wsClient.onMessage = (msg) => this.handleMessage(msg);
        window.wsClient.onError = (err) => this.handleError(err);

        // Initialize enrollment manager
        window.enrollmentManager.initialize();

        // Connect to backend
        window.wsClient.connect();
    }

    initializeTabs() {
        const tabs = document.querySelectorAll('.tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                // Update active tab
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                // Update active panel
                const panelId = tab.dataset.tab + 'Panel';
                document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
                document.getElementById(panelId).classList.add('active');

                // Load data for panel
                if (tab.dataset.tab === 'speakers') {
                    this.refreshSpeakers();
                }
            });
        });
    }

    async startListening() {
        // Initialize audio if needed
        if (!window.audioCapture.audioContext) {
            const success = await window.audioCapture.initialize();
            if (!success) {
                this.showError('Failed to access microphone');
                return;
            }
        }

        await window.audioCapture.resume();

        // Tell backend we're starting
        window.wsClient.startListening();

        // Start audio capture
        window.audioCapture.start((audioData) => {
            if (this.isListening) {
                window.wsClient.sendAudio(audioData);
            }
        });

        this.isListening = true;
        this.updateListeningUI(true);
    }

    stopListening() {
        window.audioCapture.stop();
        window.wsClient.stopListening();
        this.isListening = false;
        this.updateListeningUI(false);
    }

    updateListeningUI(listening) {
        document.getElementById('startListening').disabled = listening;
        document.getElementById('stopListening').disabled = !listening;

        const micStatus = document.getElementById('micStatus');
        const micIcon = micStatus.querySelector('.mic-icon');
        const micText = micStatus.querySelector('span:last-child');

        if (listening) {
            micIcon.classList.add('active');
            micText.textContent = 'Listening...';
        } else {
            micIcon.classList.remove('active');
            micText.textContent = 'Mic Off';
        }
    }

    handleConnect() {
        const status = document.getElementById('connectionStatus');
        status.innerHTML = '<span class="status-dot connected"></span><span>Connected</span>';

        document.getElementById('startListening').disabled = false;

        // Request speakers list
        window.wsClient.listSpeakers();
    }

    handleDisconnect() {
        const status = document.getElementById('connectionStatus');
        status.innerHTML = '<span class="status-dot disconnected"></span><span>Disconnected</span>';

        document.getElementById('startListening').disabled = true;
        document.getElementById('stopListening').disabled = true;

        if (this.isListening) {
            this.stopListening();
        }
    }

    handleMessage(message) {
        switch (message.type) {
            case 'command':
                this.displayCommand(message);
                break;

            case 'listening_started':
                console.log('Backend confirmed listening started');
                break;

            case 'listening_stopped':
                console.log('Backend confirmed listening stopped');
                break;

            case 'enrollment_started':
                window.enrollmentManager.handleEnrollmentStarted(message);
                break;

            case 'enrollment_complete':
                window.enrollmentManager.handleEnrollmentComplete(message);
                break;

            case 'enrollment_cancelled':
                console.log('Enrollment cancelled');
                break;

            case 'speakers_list':
                this.displaySpeakers(message.speakers);
                break;

            case 'speaker_removed':
                if (message.success) {
                    this.refreshSpeakers();
                }
                break;

            case 'error':
                this.showError(message.message);
                break;

            case 'pong':
                console.log('Pong received');
                break;
        }
    }

    handleError(error) {
        console.error('WebSocket error:', error);
    }

    displayCommand(data) {
        const log = document.getElementById('commandLog');

        // Remove placeholder if present
        const placeholder = log.querySelector('.log-placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        // Create command entry
        const entry = document.createElement('div');
        entry.className = 'command-entry';

        const timestamp = new Date(data.timestamp).toLocaleTimeString();
        const commandClass = data.command ? data.command.toLowerCase() : '';

        entry.innerHTML = `
            <div class="header">
                <span class="speaker">${this.escapeHtml(data.speaker)}</span>
                <span class="timestamp">${timestamp}</span>
            </div>
            ${data.command ? `<div class="command ${commandClass}">${this.escapeHtml(data.command)}</div>` : ''}
            ${data.raw_text ? `<div class="raw-text">"${this.escapeHtml(data.raw_text)}"</div>` : ''}
            <div class="confidence">
                Speaker: ${(data.speaker_confidence * 100).toFixed(0)}% |
                Command: ${(data.command_confidence * 100).toFixed(0)}%
            </div>
        `;

        // Add to top of log
        log.insertBefore(entry, log.firstChild);

        // Update stats
        if (data.command) {
            this.commandCount++;
            document.getElementById('commandCount').textContent = this.commandCount;
        }

        if (data.speaker && data.speaker !== 'Unknown') {
            this.activeSpeakers.add(data.speaker);
            document.getElementById('activeSpeakers').textContent = this.activeSpeakers.size;
        }

        // Keep log size manageable
        while (log.children.length > 50) {
            log.removeChild(log.lastChild);
        }
    }

    displaySpeakers(speakers) {
        const list = document.getElementById('speakersList');

        if (!speakers || speakers.length === 0) {
            list.innerHTML = '<div class="log-placeholder">No speakers enrolled yet</div>';
            return;
        }

        list.innerHTML = speakers.map(name => `
            <div class="speaker-item">
                <div>
                    <div class="name">${this.escapeHtml(name)}</div>
                </div>
                <button class="btn btn-remove" onclick="displayManager.removeSpeaker('${this.escapeHtml(name)}')">Remove</button>
            </div>
        `).join('');
    }

    refreshSpeakers() {
        window.wsClient.listSpeakers();
    }

    removeSpeaker(name) {
        if (confirm(`Remove speaker "${name}"?`)) {
            window.wsClient.removeSpeaker(name);
        }
    }

    showError(message) {
        console.error('Error:', message);
        // Could add a toast notification here
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Helper function for switching tabs (exposed globally for game cards)
window.switchToTab = function(tabName) {
    const tabs = document.querySelectorAll('.tab');
    const targetTab = Array.from(tabs).find(t => t.dataset.tab === tabName);
    
    if (targetTab) {
        // Update active tab
        tabs.forEach(t => t.classList.remove('active'));
        targetTab.classList.add('active');
        
        // Update active panel
        const panelId = tabName + 'Panel';
        document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
        const targetPanel = document.getElementById(panelId);
        if (targetPanel) {
            targetPanel.classList.add('active');
        }
    }
};

// Create singleton and initialize on DOM ready
window.displayManager = new DisplayManager();

document.addEventListener('DOMContentLoaded', () => {
    window.displayManager.initialize();
});
