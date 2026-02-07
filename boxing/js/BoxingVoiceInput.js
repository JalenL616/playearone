class BoxingVoiceInput {
  constructor(game) {
    this.game = game;
    this.socket = null;
    this.audioContext = null;
    this.mediaStream = null;
    this.processor = null;
    this.enabled = false;
    this.commandTimers = {};

    this.commandMap = {
      'jab': 'jab', 'left': 'jab',
      'cross': 'cross', 'right': 'cross',
      'hook': 'hook',
      'uppercut': 'uppercut', 'upper': 'uppercut',
      'block': 'block', 'guard': 'block',
      'dodge': 'dodge', 'duck': 'dodge',
      'forward': 'forward', 'advance': 'forward',
      'back': 'back', 'retreat': 'back',
      'start': 'start', 'fight': 'start',
      'pause': 'pause'
    };

    // Debounce
    this.lastCommand = { 1: null, 2: null };
    this.lastCommandTime = { 1: 0, 2: 0 };
    this.debounceTime = 100;
    
    // Voice-triggered hold timers for block/dodge
    this.voiceHoldTimers = { 1: {}, 2: {} };
    this.voiceHoldDuration = 1000; // ms to hold block/dodge from voice command
  }

  isVoiceHoldActive(player, action) {
    return !!this.voiceHoldTimers[player][action];
  }

  async initialize() {
    console.log('[BoxingVoice] initialize');
    this.enabled = true;
    this.connectWebSocket();
    this.fetchPlayerAssignments();
    try {
      await this.startAudioCapture();
      console.log('[BoxingVoice] mic active');
    } catch (e) {
      console.error('[BoxingVoice] mic failed:', e);
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
      const res = await fetch(`${location.protocol}//${host}/api/config`);
      const data = await res.json();
      const assignments = data.player_assignments || {};

      // Populate dropdowns
      this.populatePlayerDropdowns(speakers, assignments);

      // Update player names display
      for (const [name, playerNum] of Object.entries(assignments)) {
        const el = document.getElementById(`player${playerNum}Name`);
        if (el) {
          el.textContent = name.charAt(0).toUpperCase() + name.slice(1);
        }
      }
      console.log('[BoxingVoice] assignments:', assignments);
    } catch (e) {
      console.error('[BoxingVoice] failed to fetch assignments:', e);
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
      console.log('[BoxingVoice] player assignments updated:', assignments);
    } catch (e) {
      console.error('[BoxingVoice] failed to update player assignment:', e);
    }
  }

  connectWebSocket() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = location.host || 'localhost:8000';
    const url = `${protocol}//${host}/ws`;
    console.log('[BoxingVoice] connecting to', url);
    this.socket = new WebSocket(url);

    this.socket.onopen = () => {
      console.log('[BoxingVoice] connected');
      this.socket.send(JSON.stringify({ type: 'set_mode', mode: 'game' }));
      this.socket.send(JSON.stringify({ type: 'start_listening' }));
      this.updateStatus('connected');
    };

    this.socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'command' && data.player && data.command) {
        this.handleVoiceCommand(data.player, data.command, data.command_confidence);
      }
    };

    this.socket.onclose = () => {
      this.updateStatus('disconnected');
      if (this.enabled) {
        setTimeout(() => this.connectWebSocket(), 2000);
      }
    };

    this.socket.onerror = () => {
      this.updateStatus('error');
    };
  }

  handleVoiceCommand(player, command, confidence) {
    if (confidence < 0.65) return;

    const action = this.commandMap[command];
    if (!action) return;

    // Debounce
    const now = performance.now();
    if (this.lastCommand[player] === action &&
        now - this.lastCommandTime[player] < this.debounceTime) {
      return;
    }
    this.lastCommand[player] = action;
    this.lastCommandTime[player] = now;

    // Route to game
    if (action === 'start') {
      this.game.startMatch();
    } else if (action === 'pause') {
      this.game.togglePause();
    } else if (action === 'block' || action === 'dodge') {
      this.activateVoiceHold(player, action);
    } else {
      this.game.handleCommand(player, action);
    }

    this.showCommand(player, action);
  }
  
  activateVoiceHold(player, action) {
    // If already holding this action, don't reset the timer
    if (this.voiceHoldTimers[player][action]) {
      return;
    }
    
    // Start holding
    this.game.handleCommand(player, action, true);
    
    // Set timer to release after duration
    const startTime = performance.now();
    const interval = setInterval(() => {
      const elapsed = performance.now() - startTime;
      if (elapsed >= this.voiceHoldDuration) {
        // Release
        this.game.handleCommand(player, action, false);
        clearInterval(interval);
        delete this.voiceHoldTimers[player][action];
      } else {
        // Continue holding
        this.game.handleCommand(player, action, true);
      }
    }, 50); // Update every 50ms
    
    this.voiceHoldTimers[player][action] = interval;
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
    }, 600);
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
  }
}
