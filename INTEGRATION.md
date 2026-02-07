# Pong Voice Control Integration Plan

## Goal

Enable two enrolled speakers to control Pong paddles with voice commands ("up", "down") while preserving keyboard controls as a fallback.

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                  PONG PAGE                        │
│                                                   │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐ │
│  │  Audio     │  │  WebSocket │  │   Voice    │  │
│  │  Capture   │→ │  Client    │→ │  Input     │  │
│  │ (mic PCM)  │  │ (send/recv)│  │  Bridge    │  │
│  └────────────┘  └──────┬─────┘  └─────┬──────┘ │
│                          │              │         │
│                          │         ┌────▼──────┐  │
│                          │         │  keys {}  │  │
│                          │         │  (shared) │  │
│                          │         └────┬──────┘  │
│                          │              │         │
│  ┌────────────┐    ┌────▼──────────────▼──────┐  │
│  │  Keyboard  │──→ │        Game Loop         │  │
│  │  Listener  │    │  Paddles / Ball / Render  │  │
│  └────────────┘    └─────────────────────────┘   │
└──────────────────────────────────────────────────┘
                         │
                    WebSocket
                         │
┌────────────────────────▼─────────────────────────┐
│                   BACKEND                         │
│                                                   │
│  Audio Buffer → Speaker ID ──┐ (parallel)         │
│                  Deepgram ───┤                     │
│                              ↓                    │
│       { speaker, command, confidence }            │
└──────────────────────────────────────────────────┘
```

Voice commands and keyboard input both write to the same global `keys` object. The game loop doesn't need to know where input came from.

---

## Current Backend Pipeline (Post-Deepgram Update)

The backend processes audio in two parallel tracks using a `ThreadPoolExecutor`:

**Track 1 — Speaker Identification**
- Pyannote extracts a voice embedding from the audio chunk
- Compared against enrolled speakers via cosine similarity

**Track 2 — Command Recognition (Deepgram + LLM)**
- Audio is converted to WAV bytes and sent to **Deepgram Nova-2** for transcription
- **Fast path:** If the transcript exactly matches a valid command ("up", "down"), it returns immediately with 0.95 confidence — skipping the LLM entirely
- **Slow path:** If the transcript is more complex (e.g. "move the paddle up"), it's sent to the LLM via OpenRouter for command extraction

Both tracks run concurrently and their results are combined into a `CommandResult`:

```json
{
    "type": "command",
    "timestamp": "2026-02-06T12:34:56.789Z",
    "speaker": "maya",
    "speaker_confidence": 0.92,
    "command": "up",
    "raw_text": "up",
    "command_confidence": 0.95
}
```

**Silence filtering:** The handler checks RMS energy and filters known hallucination phrases ("thank you", "subscribe", etc.) before sending results.

---

## Required Environment Variables

```bash
DEEPGRAM_API_KEY=...       # Deepgram API key (for transcription)
OPENROUTER_API_KEY=...     # OpenRouter API key (for LLM command extraction)
HF_TOKEN=...               # Hugging Face token (for Pyannote speaker model)
```

---

## Implementation Steps

### Step 1: Add Player Assignment to Backend Config

**File:** `backend/config.py`

Add a player assignment mapping. Speaker names must match enrolled names in `speakers.json`.

```python
# Player assignments: speaker name → player number (1 = left, 2 = right)
PLAYER_ASSIGNMENTS = {
    "maya": 1,
    "inaara": 2,
}
```

---

### Step 2: Include Player Number in Command Response

**File:** `backend/ws/handler.py`

In `_process_audio_chunk`, add the player lookup before sending:

```python
if result:
    player = config.PLAYER_ASSIGNMENTS.get(result.speaker, None)
    await self._send_message(websocket, {
        "type": "command",
        "player": player,       # 1, 2, or None
        **result.to_dict()
    })
```

---

### Step 3: Create Voice Input Bridge for Pong

**New file:** `pong/js/VoiceInput.js`

This module connects to the backend WebSocket, captures mic audio, and translates voice commands into key presses on the shared `keys` object.

```javascript
class VoiceInput {
    constructor() {
        this.socket = null;
        this.audioContext = null;
        this.mediaStream = null;
        this.processor = null;
        this.enabled = false;
        this.commandDuration = 250; // ms to hold key

        // Speaker → key mapping
        this.playerKeys = {
            1: { up: 'w', down: 's' },
            2: { up: 'ArrowUp', down: 'ArrowDown' }
        };

        // Track active timers to prevent stacking
        this.activeTimers = {};
    }

    async initialize() {
        this.connectWebSocket();
        await this.startAudioCapture();
        this.enabled = true;
    }

    connectWebSocket() {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = location.host || 'localhost:8000';
        this.socket = new WebSocket(`${protocol}//${host}/ws`);

        this.socket.onopen = () => {
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
        // Ignore low-confidence commands
        if (confidence < 0.5) return;

        const mapping = this.playerKeys[player];
        if (!mapping) return;

        const key = mapping[command]; // 'up' → 'w' or 'ArrowUp', etc.
        if (!key) return;

        this.simulateKeyPress(key);
    }

    simulateKeyPress(key) {
        // Clear existing timer for this key to prevent stacking
        if (this.activeTimers[key]) {
            clearTimeout(this.activeTimers[key]);
        }

        // Press key
        keys[key] = true;

        // Release after duration
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
        const el = document.getElementById('voiceStatus');
        if (!el) return;

        const labels = {
            connected: 'Voice: Connected',
            disconnected: 'Voice: Disconnected',
            error: 'Voice: Error'
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

        // Release all held keys
        for (const key in this.activeTimers) {
            clearTimeout(this.activeTimers[key]);
            keys[key] = false;
        }
    }
}
```

---

### Step 4: Add VoiceInput to Pong Page

**File:** `pong/index.html`

Add the script tag before `Game.js` and a status element:

```html
<div id="voiceStatus">Voice: Connecting...</div>
<canvas id="gameCanvas"></canvas>

<!-- ... existing scripts ... -->
<script src="js/VoiceInput.js"></script>
<script src="js/Game.js"></script>
```

**File:** `pong/styles.css`

```css
#voiceStatus {
    color: #666;
    font-family: monospace;
    font-size: 14px;
    margin-bottom: 8px;
    text-align: center;
}
```

---

### Step 5: Initialize Voice Input in Game

**File:** `pong/js/Game.js`

Add voice initialization in the `DOMContentLoaded` listener:

```javascript
document.addEventListener('DOMContentLoaded', () => {
    const game = new Game();
    game.start();

    // Initialize voice control (requires backend running)
    const voice = new VoiceInput();
    voice.initialize().catch(() => {
        console.log('Voice control unavailable — using keyboard only');
    });
});
```

Voice input is optional. If the backend isn't running or mic access is denied, the game still works with keyboard controls.

---

### Step 6: Serve Pong from Backend

**File:** `backend/main.py`

Add a route to serve the Pong game so it shares the same WebSocket origin:

```python
pong_path = os.path.join(os.path.dirname(__file__), "..", "pong")

@app.get("/pong")
async def pong():
    index_path = os.path.join(pong_path, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"error": "Pong not found"}

# Mount after all route definitions
app.mount("/pong-static", StaticFiles(directory=pong_path), name="pong")
```

Update Pong's `index.html` asset paths to work under `/pong-static/` or use a relative base.

---

## Command Flow (End to End)

```
1.  Maya says "up" into microphone
2.  Browser captures audio → sends PCM over WebSocket
3.  Backend buffers audio (1 second chunk)
4.  Backend checks RMS energy — skips if silent
5.  Two parallel tracks start:
      Track A: Pyannote extracts embedding → matches "maya" (confidence: 0.92)
      Track B: Deepgram Nova-2 transcribes → "up"
               Direct match found → returns immediately (confidence: 0.95)
               (LLM skipped — exact command match)
6.  Backend looks up maya → Player 1
7.  Backend sends: { type: "command", player: 1, speaker: "maya", command: "up", ... }
8.  VoiceInput receives message → maps Player 1 + "up" → key 'w'
9.  Sets keys['w'] = true for 250ms
10. Game loop reads keys['w'] → left paddle accelerates upward
11. After 250ms, keys['w'] = false → paddle decelerates via friction
```

---

## Latency Budget

| Stage | Estimated Time |
|-------|---------------|
| Audio capture + send | ~50ms |
| Backend buffering | ~1000ms (1 second chunk) |
| Speaker ID (Pyannote) | ~100ms |
| Deepgram transcription | ~100-200ms |
| LLM command extraction | ~300ms (skipped on direct match) |
| WebSocket response | ~10ms |
| Key simulation + render | ~16ms (1 frame) |
| **Total (direct match)** | **~1.3 seconds** |
| **Total (LLM fallback)** | **~1.6 seconds** |

The Deepgram update significantly improves latency over Whisper: transcription is faster (~100ms vs ~200ms), and exact command matches ("up", "down") bypass the LLM entirely, saving ~300ms.

The 1-second audio buffer remains the biggest contributor. This can be reduced to 500ms for faster response at the cost of less reliable recognition.

---

## Tuning Parameters

| Parameter | Location | Default | Notes |
|-----------|----------|---------|-------|
| Command hold duration | `VoiceInput.commandDuration` | 250ms | How long a voice command holds the key. Tune to feel right with paddle acceleration (1.2) and friction (0.8). |
| Confidence threshold | `VoiceInput.handleVoiceCommand` | 0.5 | Reject unreliable commands. Lower = more responsive but more false positives. |
| Audio chunk size | `backend/ws/handler.py` | 1 second | Latency floor. Shorter = faster but less accurate. |
| Speaker similarity | `backend/config.py` | 0.3 | Cosine similarity threshold for speaker matching. |
| Silence RMS threshold | `backend/ws/handler.py` | 0.01 | Audio below this energy level is skipped. |
| Deepgram model | `backend/commands/parser.py` | nova-2 | Deepgram transcription model. |
| LLM model | `backend/config.py` | openai/gpt-4o-mini | Used only when direct match fails. |
| Paddle acceleration | `pong/js/Paddle.js` | 1.2 | Higher = more paddle movement per voice command. |
| Paddle friction | `pong/js/Paddle.js` | 0.8 | Lower = quicker stop after command ends. |

---

## File Changes Summary

| File | Action | What |
|------|--------|------|
| `backend/config.py` | Edit | Add `PLAYER_ASSIGNMENTS` dict |
| `backend/ws/handler.py` | Edit | Include `player` number in command response |
| `backend/main.py` | Edit | Add route to serve Pong page |
| `pong/js/VoiceInput.js` | **New** | WebSocket client + audio capture + key simulation |
| `pong/index.html` | Edit | Add `VoiceInput.js` script tag, voice status div |
| `pong/styles.css` | Edit | Style voice status indicator |
| `pong/js/Game.js` | Edit | Initialize VoiceInput on load |

---

## Dependencies

```
# Backend (already installed)
deepgram-sdk>=3.0,<4.0    # Deepgram Nova-2 transcription
pyannote.audio==3.1.1      # Speaker identification
openai>=1.30.0             # OpenRouter LLM (fallback command parsing)
torch==2.1.2               # Pyannote dependency
```

No new frontend dependencies. VoiceInput uses native browser APIs (WebSocket, getUserMedia, AudioContext).

---

## Fallback Behavior

- **No backend running** — VoiceInput fails silently, keyboard controls work normally
- **No microphone access** — VoiceInput logs a warning, keyboard controls work normally
- **Unknown speaker** — Backend sends `player: null`, VoiceInput ignores the command
- **Low confidence** — VoiceInput drops commands below the threshold
- **Silent audio** — Backend skips processing (RMS check), no command sent
- **Deepgram error** — Returns empty transcript, no command sent
- **WebSocket disconnect** — Auto-reconnects every 2 seconds, keyboard still works

The game is always playable with keyboard. Voice is an additive layer.
