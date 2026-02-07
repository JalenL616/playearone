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
        this.volumeDecayTimers = {};
        
        // Track last direction for continuous control
        this.lastDirection = { 1: null, 2: null };
        this.continuousActive = { 1: false, 2: false };
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
            this.socket.send(JSON.stringify({ type: 'set_mode', mode: 'game' }));
            this.socket.send(JSON.stringify({ type: 'start_listening' }));
            this.updateStatus('connected');
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            console.log('[Voice] message received:', data);
            if (data.type === 'command') {
                if (!data.player) {
                    console.log('[Voice] no player assignment for speaker:', data.speaker);
                    // Still update volume meter if we can identify the speaker
                    this.updateVolumeMeter(data.speaker, data.volume || 0);
                } else if (!data.command) {
                    console.log('[Voice] no command found in speech:', data.raw_text);
                    // Update volume meter even without command
                    this.updateVolumeMeter(data.player, data.volume || 0);
                } else {
                    this.handleVoiceCommand(data.player, data.command, data.command_confidence, data.volume || 0);
                }
            } else if (data.type === 'volume') {
                // Continuous volume updates without commands
                if (data.player) {
                    this.updateVolumeMeter(data.player, data.volume || 0);
                    this.handleContinuousControl(data.player, data.volume || 0);
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

    handleVoiceCommand(player, command, confidence, volume = 0) {
        console.log('[Voice] command:', command, 'player:', player, 'confidence:', confidence, 'volume:', volume.toFixed(2));
        if (confidence < 0.5) return;

        // Update volume meter
        this.updateVolumeMeter(player, volume);

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

        // Store last direction for continuous control
        this.lastDirection[player] = command;
        this.continuousActive[player] = true;

        this.simulateKeyPress(key, volume, command);
        this.showCommand(player, command);
    }

    showCommand(player, command) {
        const el = document.getElementById(`player${player}Cmd`);
        if (!el) return;

        // Show command text only (no volume bars)
        el.textContent = command.toUpperCase();
        el.classList.add('active');

        if (this.commandTimers[player]) {
            clearTimeout(this.commandTimers[player]);
        }

        this.commandTimers[player] = setTimeout(() => {
            el.classList.remove('active');
            delete this.commandTimers[player];
        }, 1000);
    }

    updateVolumeMeter(player, volume) {
        const el = document.getElementById(`player${player}Volume`);
        if (!el) return;

        // Map volume (0-1) directly to percentage (0-100%)
        const percentage = Math.round(volume * 100);
        el.style.bottom = `${percentage}%`;

        // Auto-decay after 300ms if no new updates
        if (this.volumeDecayTimers[player]) {
            clearTimeout(this.volumeDecayTimers[player]);
        }

        this.volumeDecayTimers[player] = setTimeout(() => {
            el.style.bottom = '0%';
            this.continuousActive[player] = false;
            delete this.volumeDecayTimers[player];
        }, 300);
    }

    handleContinuousControl(player, volume) {
        // If player is actively speaking and has a last direction, apply continuous movement
        if (!this.lastDirection[player] || volume < 0.1) {
            return;
        }

        const mapping = this.playerKeys[player];
        if (!mapping) return;

        const direction = this.lastDirection[player];
        const key = mapping[direction];
        if (!key) return;

        // Apply continuous key press with volume-based intensity
        this.simulateKeyPress(key, volume, direction);
    }

    simulateKeyPress(key, volume = 0.5, command = null) {
        // Don't clear existing timer - allow rapid fire commands to stack
        // Each command adds its own movement
        
        // Normalize volume based on command word
        // "up" and "down" naturally produce different volumes
        let normalizedVolume = volume;
        if (command === 'up') {
            // "up" might be quieter, scale it up slightly
            normalizedVolume = volume * 1.2;
        } else if (command === 'down') {
            // "down" might be louder, scale it down to match
            normalizedVolume = volume * 0.9;
        }
        
        // Clamp to 0-1 range
        normalizedVolume = Math.min(1.0, Math.max(0.0, normalizedVolume));
        
        // Scale so 25% volume = full base movement, then exponential growth beyond
        // 0.25 volume → 1.0 scaled, 0.5 volume → 2.0 scaled, etc.
        const scaledVolume = normalizedVolume * 2.0;
        
        // Apply exponential scaling for dramatic differences at high volumes
        const exponentialVolume = scaledVolume * scaledVolume;
        
        keys[key] = true;

        // Map to key press duration: 25% volume gives 240ms, higher volumes give much more
        const minDuration = 60;
        const baseDuration = 240;  // What 25% volume should give
        const pressDuration = minDuration + (exponentialVolume * (baseDuration - minDuration));
        
        // Allow exceeding base for very loud utterances
        const finalDuration = Math.min(pressDuration, 800);  // Cap at 800ms max

        // Create new timer that won't interfere with others
        const timerId = setTimeout(() => {
            keys[key] = false;
            // Clean up this specific timer
            if (this.activeTimers[key] === timerId) {
                delete this.activeTimers[key];
            }
        }, finalDuration);
        
        // Store the timer
        this.activeTimers[key] = timerId;
    }

    async startAudioCapture() {
        this.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: 16000,
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true
            }
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
