class VoiceInput {
    constructor() {
        this.socket = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.processor = null;
        this.enabled = false;
        this.commandDuration = 250;

        this.playerKeys = {
            1: { up: 'w', down: 's' },
            2: { up: 'ArrowUp', down: 'ArrowDown' }
        };

        this.activeTimers = {};
        this.commandTimers = {};
    }

    async initialize() {
        console.log('[Voice] initialize() called');
        this.enabled = true;
        this.connectWebSocket();
        this.fetchPlayerAssignments();
        try {
            console.log('[Voice] requesting mic access...');
            await this.startAudioCapture();
            console.log('[Voice] mic access granted, audio capture running');
        } catch (e) {
            console.error('[Voice] mic access failed:', e);
            this.updateStatus('no-mic');
        }
    }

    async fetchPlayerAssignments() {
        try {
            const host = location.host || 'localhost:8000';
            
            // Fetch enrolled speakers
            const speakersRes = await fetch(`${location.protocol}//${host}/api/speakers`);
            const speakersData = await speakersRes.json();
            const speakers = speakersData.speakers || [];
            
            // Fetch current assignments
            const configRes = await fetch(`${location.protocol}//${host}/api/config`);
            const configData = await configRes.json();
            const assignments = configData.player_assignments || {};

            // Populate dropdowns
            this.populatePlayerDropdowns(speakers, assignments);
            
            // Update player names display
            for (const [name, playerNum] of Object.entries(assignments)) {
                const el = document.getElementById(`player${playerNum}Name`);
                if (el) {
                    const displayName = name.charAt(0).toUpperCase() + name.slice(1);
                    el.textContent = displayName;
                }
            }
            console.log('[Voice] player assignments loaded:', assignments);
        } catch (e) {
            console.error('[Voice] failed to fetch player assignments:', e);
        }
    }

    populatePlayerDropdowns(speakers, assignments) {
        const select1 = document.getElementById('player1Select');
        const select2 = document.getElementById('player2Select');
        
        if (!select1 || !select2) return;

        // Find current assignments
        let player1Speaker = '';
        let player2Speaker = '';
        for (const [name, playerNum] of Object.entries(assignments)) {
            if (playerNum === 1) player1Speaker = name;
            if (playerNum === 2) player2Speaker = name;
        }

        // Populate options
        [select1, select2].forEach(select => {
            select.innerHTML = '<option value="">-- Select Speaker --</option>';
            speakers.forEach(name => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name.charAt(0).toUpperCase() + name.slice(1);
                select.appendChild(option);
            });
        });

        // Set current values
        select1.value = player1Speaker;
        select2.value = player2Speaker;

        // Add change handlers
        select1.onchange = () => this.updatePlayerAssignment(1, select1.value);
        select2.onchange = () => this.updatePlayerAssignment(2, select2.value);
    }

    async updatePlayerAssignment(playerNum, speakerName) {
        try {
            const host = location.host || 'localhost:8000';
            
            // Get current assignments
            const configRes = await fetch(`${location.protocol}//${host}/api/config`);
            const configData = await configRes.json();
            const assignments = { ...configData.player_assignments };

            // Remove any existing assignment for this player
            for (const [name, num] of Object.entries(assignments)) {
                if (num === playerNum) {
                    delete assignments[name];
                }
            }

            // Add new assignment if speaker selected
            if (speakerName) {
                // Remove speaker from other player if assigned
                for (const [name, num] of Object.entries(assignments)) {
                    if (name === speakerName) {
                        delete assignments[name];
                    }
                }
                assignments[speakerName] = playerNum;
            }

            // Update server
            await fetch(`${location.protocol}//${host}/api/player-assignments`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(assignments)
            });

            // Refresh UI
            this.fetchPlayerAssignments();
            console.log('[Voice] player assignments updated:', assignments);
        } catch (e) {
            console.error('[Voice] failed to update player assignment:', e);
        }
    }

    connectWebSocket() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = location.host || 'localhost:8000';
        const url = `${protocol}//${host}/ws`;
        console.log('[Voice] connecting WebSocket to', url);
        this.socket = new WebSocket(url);

        this.socket.onopen = () => {
            console.log('[Voice] WebSocket opened');
            this.socket.send(JSON.stringify({ type: 'start_listening' }));
            this.updateStatus('connected');
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log('[Voice] message received:', data);
            if (data.type === 'command') {
                if (!data.player) {
                    console.log('[Voice] no player assignment for speaker:', data.speaker);
                } else if (!data.command) {
                    console.log('[Voice] no command found in speech:', data.raw_text);
                } else {
                    this.handleVoiceCommand(data.player, data.command, data.command_confidence);
                }
            }
        };

        this.socket.onclose = (event) => {
            console.log('[Voice] WebSocket closed, code:', event.code, 'reason:', event.reason);
            this.updateStatus('disconnected');
            if (this.enabled) {
                console.log('[Voice] reconnecting in 2s...');
                setTimeout(() => this.connectWebSocket(), 2000);
            }
        };

        this.socket.onerror = (event) => {
            console.error('[Voice] WebSocket error:', event);
            this.updateStatus('error');
        };
    }

    handleVoiceCommand(player, command, confidence) {
        console.log('[Voice] command:', command, 'player:', player, 'confidence:', confidence);
        if (confidence < 0.5) return;

        // Handle game control commands (start/serve/resume/pause)
        if (command === 'start' || command === 'serve' || command === 'resume') {
            console.log('[Voice] start/serve/resume command, gameState:', window.game?.gameState);
            if (window.game) {
                window.game.startGame();
                this.showCommand(player, command);
                console.log('[Voice] after start/serve/resume, gameState:', window.game.gameState);
            } else {
                console.error('[Voice] window.game not available!');
            }
            return;
        }
        
        if (command === 'pause') {
            console.log('[Voice] pause command, gameState:', window.game?.gameState);
            if (window.game) {
                window.game.pauseGame();
                this.showCommand(player, command);
                console.log('[Voice] after pause, gameState:', window.game.gameState);
            } else {
                console.error('[Voice] window.game not available!');
            }
            return;
        }

        // Handle paddle movement commands
        const mapping = this.playerKeys[player];
        if (!mapping) return;

        const key = mapping[command];
        if (!key) return;

        this.simulateKeyPress(key);
        this.showCommand(player, command);
    }

    showCommand(player, command) {
        const el = document.getElementById(`player${player}Cmd`);
        if (!el) return;

        el.textContent = command.toUpperCase();
        el.classList.add('active');

        if (this.commandTimers[player]) {
            clearTimeout(this.commandTimers[player]);
        }

        this.commandTimers[player] = setTimeout(() => {
            el.classList.remove('active');
            delete this.commandTimers[player];
        }, 500);
    }

    simulateKeyPress(key) {
        if (this.activeTimers[key]) {
            clearTimeout(this.activeTimers[key]);
        }

        keys[key] = true;

        this.activeTimers[key] = setTimeout(() => {
            keys[key] = false;
            delete this.activeTimers[key];
        }, this.commandDuration);
    }

    async startAudioCapture() {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: { sampleRate: 16000, channelCount: 1 }
        });

        this.audioContext = new AudioContext({ sampleRate: 16000 });
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);

        this.processor.onaudioprocess = (event) => {
            if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                const float32 = event.inputBuffer.getChannelData(0);
                const pcm16 = this.float32ToPCM16(float32);
                this.socket.send(pcm16.buffer);
            }
        };

        source.connect(this.processor);
        this.processor.connect(this.audioContext.destination);
    }

    float32ToPCM16(float32Array) {
        const pcm16 = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const clamped = Math.max(-1, Math.min(1, float32Array[i]));
            pcm16[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7FFF;
        }
        return pcm16;
    }

    updateStatus(state) {
        console.log('[Voice] status:', state);
        const el = document.getElementById('voiceStatus');
        if (!el) return;

        const labels = {
            connected: 'Voice: Connected',
            disconnected: 'Voice: Disconnected',
            error: 'Voice: Error',
            'no-mic': 'Voice: No Microphone'
        };
        el.textContent = labels[state] || 'Voice: Unknown';
        el.style.color = state === 'connected' ? '#4a4' : '#666';
    }

    destroy() {
        this.enabled = false;
        if (this.processor) this.processor.disconnect();
        if (this.audioContext) this.audioContext.close();
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(t => t.stop());
        }
        if (this.socket) this.socket.close();

        for (const key in this.activeTimers) {
            clearTimeout(this.activeTimers[key]);
            keys[key] = false;
        }
        for (const player in this.commandTimers) {
            clearTimeout(this.commandTimers[player]);
        }
    }
}
