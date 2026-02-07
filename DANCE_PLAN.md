# Dance Command Game - Implementation Plan

## 🎯 End Goal

### User Experience Flow

1. **Start:** User clicks "🎭 Create Dance" button
2. **Record:** 30-second timer starts with prompt: *"Describe any dance you want!"*
3. **User speaks freely:** 
   - "Wave your arms like a tube man, then spin on one foot, kick high, and bow dramatically!"
   - "Do jumping jacks, then moonwalk left, strike a pose, and finish with jazz hands!"
4. **Processing:** 3–6 second loading with status updates:
   - "Transcribing your dance..." (2–4s)
   - "Choreographing moves..." (1–2s)
5. **Performance:** Stick figure performs the described dance for 12 seconds on canvas at 60fps
6. **Scoring:** Display creativity metrics:
   - Creativity: 8/10 (unique moves)
   - Energy: 9/10 (transition speed)
   - Style: "Robot Disco" (AI-generated genre)

### Technical Success Criteria

- ✅ Full transcript (30s speech) → structured JSON dance plan → smooth 60fps animation
- ✅ Zero changes to core audio/WebSocket pipeline
- ✅ Total time: <40s from button press to dance completion
- ✅ Works with existing Vosk + GPT-4o-mini stack

---

## 🏗️ Architecture Integration

### How It Fits Your Existing Pipeline

Your voice command pipeline is **already 90% ready** for dance mode. Here's what we reuse:

```
┌─────────────────────────────────────────────────────┐
│         EXISTING VOICE PIPELINE (No Changes)        │
│                                                     │
│  Microphone → AudioContext → WebSocket → Buffer    │
│       ↓                                             │
│  Already handles: 16kHz mono, 500ms chunks         │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│              NEW: Dance Mode Branch                 │
│                                                     │
│  If dance_recording == True:                       │
│    → Accumulate 30s of chunks (60 chunks × 500ms)  │
│    → Run Vosk on full audio (2–4s)                 │
│    → LLM generates dance JSON (1–2s)               │
│    → Send {type: "dance_plan"} via existing WS     │
└─────────────────────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────┐
│         NEW: Frontend Dance Canvas Renderer         │
│                                                     │
│  Parse JSON → Interpolate poses → Draw stick figure│
└─────────────────────────────────────────────────────┘
```

### Integration Points (Existing Files)

| File | Changes | Effort |
|------|---------|--------|
| `backend/ws/handler.py` | Add dance recording state + 30s buffer logic | 45 min |
| `frontend/index.html` | Add dance button + canvas element | 10 min |
| `frontend/js/websocket.js` | Add `dance_plan` message handler | 5 min |
| **NEW:** `frontend/js/dance.js` | Dance renderer + pose interpolation | 60 min |

**Total backend changes:** ~80 lines  
**Total frontend changes:** ~150 lines

---

## 📋 Implementation Phases

### Phase 1: Backend Dance Handler (45 min)

**File:** `backend/ws/handler.py`

**Goal:** 30s audio accumulation → Vosk transcription → LLM dance plan

#### 1.1 Add Dance State Tracking

Add to `WebSocketHandler.__init__()`:

```python
class WebSocketHandler:
    def __init__(self):
        # ... existing code ...
        
        # Dance mode state (per connection)
        self.dance_recording: Dict[int, bool] = {}
        self.dance_buffers: Dict[int, List[np.ndarray]] = {}
        self.dance_start_time: Dict[int, float] = {}
        self.dance_expected_duration = 30.0  # seconds
```

#### 1.2 Add Start Dance Message Handler

Add to `_handle_control()` method:

```python
async def _handle_control(self, websocket: WebSocket, message: Dict[str, Any]) -> None:
    msg_type = message.get("type")
    conn_id = id(websocket)
    
    # ... existing handlers ...
    
    if msg_type == "start_dance":
        # Initialize dance recording
        self.dance_recording[conn_id] = True
        self.dance_buffers[conn_id] = []
        self.dance_start_time[conn_id] = time.time()
        
        await self._send_message(websocket, {
            "type": "dance_recording_started",
            "duration": self.dance_expected_duration
        })
        
        # Schedule dance processing after 30s
        loop = asyncio.get_event_loop()
        loop.call_later(
            self.dance_expected_duration,
            lambda: asyncio.create_task(self._process_dance(websocket, conn_id))
        )
    
    elif msg_type == "cancel_dance":
        # Allow user to cancel early
        self._cleanup_dance_state(conn_id)
        await self._send_message(websocket, {"type": "dance_cancelled"})
```

#### 1.3 Accumulate Audio Chunks

Modify `_handle_audio()` to save chunks during dance recording:

```python
async def _handle_audio(self, websocket: WebSocket, audio_bytes: bytes) -> None:
    conn_id = id(websocket)
    
    # ... existing buffering code ...
    
    # If dance recording active, save chunks
    if self.dance_recording.get(conn_id, False):
        # Convert bytes to numpy array
        audio_array = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        self.dance_buffers[conn_id].append(audio_array)
        
        # Send progress update every 5 seconds
        elapsed = time.time() - self.dance_start_time[conn_id]
        if int(elapsed) % 5 == 0 and elapsed > 0:
            await self._send_message(websocket, {
                "type": "dance_recording_progress",
                "elapsed": elapsed,
                "remaining": self.dance_expected_duration - elapsed
            })
```

#### 1.4 Process Dance Audio

Add new method to generate dance plan:

```python
async def _process_dance(self, websocket: WebSocket, conn_id: int) -> None:
    """Process accumulated audio and generate dance plan."""
    try:
        if not self.dance_buffers.get(conn_id):
            return
        
        # Send status update
        await self._send_message(websocket, {
            "type": "dance_status",
            "message": "Transcribing your dance..."
        })
        
        # Concatenate all audio chunks
        full_audio = np.concatenate(self.dance_buffers[conn_id])
        
        # Transcribe using existing Vosk/Deepgram
        print(f"[Dance] Transcribing {len(full_audio)/config.SAMPLE_RATE:.1f}s of audio")
        transcript_start = time.time()
        transcript = self.command_parser._transcribe(full_audio, config.SAMPLE_RATE)
        transcript_time = time.time() - transcript_start
        print(f"[Dance] Transcription complete: {transcript_time:.1f}s → '{transcript[:100]}...'")
        
        if not transcript or len(transcript.strip()) < 10:
            await self._send_message(websocket, {
                "type": "dance_error",
                "message": "Could not understand the description. Please try again with clearer speech."
            })
            self._cleanup_dance_state(conn_id)
            return
        
        # Generate dance plan with LLM
        await self._send_message(websocket, {
            "type": "dance_status",
            "message": "Choreographing your moves..."
        })
        
        dance_plan = await self._generate_dance_plan(transcript)
        
        # Send dance plan to frontend
        await self._send_message(websocket, {
            "type": "dance_plan",
            "plan": dance_plan,
            "transcript": transcript
        })
        
        print(f"[Dance] Plan sent: {len(dance_plan['keyframes'])} keyframes over {dance_plan['duration']}s")
        
    except Exception as e:
        print(f"[Dance] Error processing: {e}")
        import traceback
        traceback.print_exc()
        await self._send_message(websocket, {
            "type": "dance_error",
            "message": f"Processing error: {str(e)}"
        })
    finally:
        self._cleanup_dance_state(conn_id)

async def _generate_dance_plan(self, transcript: str) -> Dict[str, Any]:
    """Use LLM to convert transcript to structured dance plan."""
    
    prompt = f"""You are a creative dance choreographer. Convert the user's description into a structured dance sequence for a stick figure character.

Available poses (angles in degrees):
- IDLE: Standing neutral
- ARMS_UP: Both arms raised overhead (90°)
- ARMS_WAVE_LEFT: Left arm up (90°), right arm down (0°)
- ARMS_WAVE_RIGHT: Right arm up (90°), left arm down (0°)
- SPIN_LEFT: Body rotates left (-45°)
- SPIN_RIGHT: Body rotates right (45°)
- KICK_LEFT: Left leg extended (90°)
- KICK_RIGHT: Right leg extended (90°)
- JUMP: Both legs bent, body elevated
- BOW: Body bent forward (-45°)

User description: "{transcript}"

Create a 12-second dance sequence with 8-15 keyframes. Be creative and match the user's description closely.

Return ONLY valid JSON (no markdown, no explanation):
{{
  "duration": 12.0,
  "keyframes": [
    {{"time": 0.0, "pose": "IDLE"}},
    {{"time": 2.0, "pose": "ARMS_UP"}},
    {{"time": 4.0, "pose": "SPIN_LEFT"}},
    ...
  ]
}}"""

    try:
        response = self.command_parser.client.chat.completions.create(
            model=self.command_parser.model,
            messages=[
                {"role": "system", "content": "You are a dance choreographer. Output only valid JSON."},
                {"role": "user", "content": prompt}
            ],
            max_tokens=500,
            temperature=0.8,  # More creative
            response_format={"type": "json_object"}
        )
        
        result = json.loads(response.choices[0].message.content)
        
        # Validate structure
        if "duration" not in result or "keyframes" not in result:
            raise ValueError("Invalid JSON structure")
        
        if len(result["keyframes"]) < 3:
            raise ValueError("Too few keyframes")
        
        return result
        
    except Exception as e:
        print(f"[Dance] LLM generation failed: {e}")
        # Fallback: simple dance
        return {
            "duration": 12.0,
            "keyframes": [
                {"time": 0.0, "pose": "IDLE"},
                {"time": 2.0, "pose": "ARMS_UP"},
                {"time": 4.0, "pose": "ARMS_WAVE_LEFT"},
                {"time": 6.0, "pose": "ARMS_WAVE_RIGHT"},
                {"time": 8.0, "pose": "SPIN_LEFT"},
                {"time": 10.0, "pose": "BOW"},
                {"time": 12.0, "pose": "IDLE"}
            ]
        }

def _cleanup_dance_state(self, conn_id: int) -> None:
    """Clean up dance recording state."""
    self.dance_recording.pop(conn_id, None)
    self.dance_buffers.pop(conn_id, None)
    self.dance_start_time.pop(conn_id, None)
```

---

### Phase 2: Frontend Dance UI (30 min)

**Files:** `frontend/index.html`, `frontend/js/dance.js`

**Goal:** Button → recording UI → dance canvas

#### 2.1 Update HTML

Add to `frontend/index.html` (in games panel or new "Dance" tab):

```html
<!-- Dance Game Panel -->
<div class="panel" id="dancePanel">
    <div class="dance-header">
        <h2>🎭 AI Dance Choreographer</h2>
        <p>Describe any dance and watch a stick figure perform it!</p>
    </div>
    
    <div class="dance-controls">
        <button id="startDance" class="btn primary">
            <span class="btn-icon">🎤</span>
            Create Dance (30s)
        </button>
        <button id="cancelDance" class="btn secondary" disabled>
            Cancel
        </button>
    </div>
    
    <div class="dance-status" id="danceStatus">
        <div class="status-text">Ready to record</div>
        <div class="status-timer" id="danceTimer"></div>
        <div class="progress-bar">
            <div class="progress-fill" id="danceProgress"></div>
        </div>
    </div>
    
    <canvas id="danceCanvas" width="800" height="600"></canvas>
    
    <div class="dance-transcript" id="danceTranscript"></div>
    
    <div class="dance-score" id="danceScore" style="display: none;">
        <h3>Performance Score</h3>
        <div class="score-item">
            <span>Creativity:</span>
            <span id="scoreCreativity">-</span>
        </div>
        <div class="score-item">
            <span>Energy:</span>
            <span id="scoreEnergy">-</span>
        </div>
        <div class="score-item">
            <span>Style:</span>
            <span id="scoreStyle">-</span>
        </div>
    </div>
</div>
```

#### 2.2 Add Dance Styles

Add to `frontend/css/styles.css`:

```css
.dance-header {
    text-align: center;
    margin-bottom: 2rem;
}

.dance-controls {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-bottom: 2rem;
}

.dance-status {
    margin-bottom: 2rem;
    text-align: center;
}

.status-text {
    font-size: 1.2rem;
    margin-bottom: 0.5rem;
}

.status-timer {
    font-size: 2rem;
    font-weight: bold;
    color: #4CAF50;
    margin-bottom: 1rem;
}

.progress-bar {
    width: 100%;
    height: 8px;
    background: #333;
    border-radius: 4px;
    overflow: hidden;
}

.progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #4CAF50, #8BC34A);
    width: 0%;
    transition: width 0.3s ease;
}

#danceCanvas {
    display: block;
    margin: 2rem auto;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    border: 2px solid #4CAF50;
    border-radius: 8px;
    box-shadow: 0 4px 20px rgba(76, 175, 80, 0.3);
}

.dance-transcript {
    background: #2a2a3e;
    padding: 1rem;
    border-radius: 8px;
    margin-top: 1rem;
    font-style: italic;
    color: #aaa;
}

.dance-score {
    background: #2a2a3e;
    padding: 1.5rem;
    border-radius: 8px;
    margin-top: 1rem;
}

.score-item {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid #333;
}

.score-item:last-child {
    border-bottom: none;
}
```

#### 2.3 Create Dance Manager

Create `frontend/js/dance.js`:

```javascript
class DanceManager {
    constructor(wsClient) {
        this.wsClient = wsClient;
        this.isRecording = false;
        this.recordingStartTime = null;
        this.recordingDuration = 30; // seconds
        this.timerInterval = null;
        
        this.dancePlan = null;
        this.danceStartTime = null;
        this.animationFrame = null;
        
        this.initializeUI();
        this.setupWebSocketHandlers();
    }
    
    initializeUI() {
        this.startBtn = document.getElementById('startDance');
        this.cancelBtn = document.getElementById('cancelDance');
        this.statusText = document.querySelector('.status-text');
        this.timerDisplay = document.getElementById('danceTimer');
        this.progressBar = document.getElementById('danceProgress');
        this.canvas = document.getElementById('danceCanvas');
        this.ctx = this.canvas.getContext('2d');
        this.transcriptDiv = document.getElementById('danceTranscript');
        this.scoreDiv = document.getElementById('danceScore');
        
        this.startBtn.addEventListener('click', () => this.startRecording());
        this.cancelBtn.addEventListener('click', () => this.cancelRecording());
    }
    
    setupWebSocketHandlers() {
        const originalOnMessage = this.wsClient.onMessage;
        this.wsClient.onMessage = (msg) => {
            // Call original handler first
            if (originalOnMessage) originalOnMessage(msg);
            
            // Handle dance messages
            this.handleDanceMessage(msg);
        };
    }
    
    startRecording() {
        if (!this.wsClient.socket || this.wsClient.socket.readyState !== WebSocket.OPEN) {
            alert('Not connected to server. Please wait...');
            return;
        }
        
        this.isRecording = true;
        this.recordingStartTime = Date.now();
        this.startBtn.disabled = true;
        this.cancelBtn.disabled = false;
        this.scoreDiv.style.display = 'none';
        this.transcriptDiv.textContent = '';
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Send start message
        this.wsClient.socket.send(JSON.stringify({
            type: 'start_dance'
        }));
        
        this.updateStatus('🎤 Describe your dance... Speak clearly!');
        this.startTimer();
    }
    
    cancelRecording() {
        if (!this.isRecording) return;
        
        this.wsClient.socket.send(JSON.stringify({
            type: 'cancel_dance'
        }));
        
        this.stopRecording();
        this.updateStatus('Cancelled. Ready to record.');
    }
    
    stopRecording() {
        this.isRecording = false;
        this.startBtn.disabled = false;
        this.cancelBtn.disabled = true;
        
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        
        this.timerDisplay.textContent = '';
        this.progressBar.style.width = '0%';
    }
    
    startTimer() {
        this.timerInterval = setInterval(() => {
            const elapsed = (Date.now() - this.recordingStartTime) / 1000;
            const remaining = Math.max(0, this.recordingDuration - elapsed);
            
            this.timerDisplay.textContent = `${remaining.toFixed(1)}s`;
            this.progressBar.style.width = `${(elapsed / this.recordingDuration) * 100}%`;
            
            if (remaining <= 0) {
                clearInterval(this.timerInterval);
                this.timerInterval = null;
            }
        }, 100);
    }
    
    updateStatus(message) {
        this.statusText.textContent = message;
    }
    
    handleDanceMessage(msg) {
        switch (msg.type) {
            case 'dance_recording_started':
                console.log('[Dance] Recording started');
                break;
                
            case 'dance_recording_progress':
                console.log(`[Dance] Progress: ${msg.elapsed.toFixed(1)}s / ${this.recordingDuration}s`);
                break;
                
            case 'dance_status':
                this.updateStatus(msg.message);
                break;
                
            case 'dance_plan':
                this.stopRecording();
                this.receiveDancePlan(msg.plan, msg.transcript);
                break;
                
            case 'dance_error':
                this.stopRecording();
                this.updateStatus(`❌ Error: ${msg.message}`);
                alert(msg.message);
                break;
                
            case 'dance_cancelled':
                this.stopRecording();
                console.log('[Dance] Cancelled');
                break;
        }
    }
    
    receiveDancePlan(plan, transcript) {
        console.log('[Dance] Received plan:', plan);
        
        this.dancePlan = plan;
        this.transcriptDiv.textContent = `"${transcript}"`;
        
        this.updateStatus('🎭 Dancing!');
        
        // Start animation
        this.danceStartTime = performance.now() / 1000;
        this.animateDance();
    }
    
    animateDance() {
        if (!this.dancePlan) return;
        
        const currentTime = (performance.now() / 1000) - this.danceStartTime;
        
        if (currentTime > this.dancePlan.duration) {
            // Dance complete
            this.updateStatus('✨ Dance complete!');
            this.showScore();
            return;
        }
        
        // Clear canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Get current pose
        const pose = this.getPoseAtTime(currentTime);
        
        // Draw stick figure
        this.drawStickFigure(pose);
        
        // Continue animation
        this.animationFrame = requestAnimationFrame(() => this.animateDance());
    }
    
    getPoseAtTime(time) {
        const keyframes = this.dancePlan.keyframes;
        
        // Find surrounding keyframes
        let prevFrame = keyframes[0];
        let nextFrame = keyframes[keyframes.length - 1];
        
        for (let i = 0; i < keyframes.length - 1; i++) {
            if (time >= keyframes[i].time && time <= keyframes[i + 1].time) {
                prevFrame = keyframes[i];
                nextFrame = keyframes[i + 1];
                break;
            }
        }
        
        // Interpolate between poses
        if (prevFrame === nextFrame) {
            return this.getPoseAngles(prevFrame.pose);
        }
        
        const frameDuration = nextFrame.time - prevFrame.time;
        const t = (time - prevFrame.time) / frameDuration;
        const easedT = this.easeInOutCubic(t);
        
        const prevAngles = this.getPoseAngles(prevFrame.pose);
        const nextAngles = this.getPoseAngles(nextFrame.pose);
        
        return this.interpolatePoses(prevAngles, nextAngles, easedT);
    }
    
    getPoseAngles(poseName) {
        const POSE_LIBRARY = {
            IDLE: { body: 0, lArm: 0, rArm: 0, lLeg: 0, rLeg: 0, rotation: 0 },
            ARMS_UP: { body: 0, lArm: 90, rArm: 90, lLeg: 0, rLeg: 0, rotation: 0 },
            ARMS_WAVE_LEFT: { body: 0, lArm: 90, rArm: -20, lLeg: 0, rLeg: 0, rotation: 0 },
            ARMS_WAVE_RIGHT: { body: 0, lArm: -20, rArm: 90, lLeg: 0, rLeg: 0, rotation: 0 },
            SPIN_LEFT: { body: 0, lArm: 45, rArm: 45, lLeg: 0, rLeg: 0, rotation: -180 },
            SPIN_RIGHT: { body: 0, lArm: 45, rArm: 45, lLeg: 0, rLeg: 0, rotation: 180 },
            KICK_LEFT: { body: 10, lArm: -30, rArm: -30, lLeg: 90, rLeg: 0, rotation: 0 },
            KICK_RIGHT: { body: 10, lArm: -30, rArm: -30, lLeg: 0, rLeg: 90, rotation: 0 },
            JUMP: { body: 0, lArm: 45, rArm: 45, lLeg: 45, rLeg: 45, rotation: 0, jumpOffset: -50 },
            BOW: { body: -45, lArm: -20, rArm: -20, lLeg: 0, rLeg: 0, rotation: 0 }
        };
        
        return POSE_LIBRARY[poseName] || POSE_LIBRARY.IDLE;
    }
    
    interpolatePoses(pose1, pose2, t) {
        const lerp = (a, b, t) => a + (b - a) * t;
        
        return {
            body: lerp(pose1.body, pose2.body, t),
            lArm: lerp(pose1.lArm, pose2.lArm, t),
            rArm: lerp(pose1.rArm, pose2.rArm, t),
            lLeg: lerp(pose1.lLeg, pose2.lLeg, t),
            rLeg: lerp(pose1.rLeg, pose2.rLeg, t),
            rotation: lerp(pose1.rotation || 0, pose2.rotation || 0, t),
            jumpOffset: lerp(pose1.jumpOffset || 0, pose2.jumpOffset || 0, t)
        };
    }
    
    easeInOutCubic(t) {
        return t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }
    
    drawStickFigure(pose) {
        const ctx = this.ctx;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2 + (pose.jumpOffset || 0);
        
        const headRadius = 30;
        const bodyLength = 100;
        const armLength = 60;
        const legLength = 80;
        
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(pose.rotation * Math.PI / 180);
        
        // Draw style
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#4CAF50';
        ctx.fillStyle = '#4CAF50';
        
        // Head
        ctx.beginPath();
        ctx.arc(0, -bodyLength - headRadius, headRadius, 0, Math.PI * 2);
        ctx.fill();
        
        // Body
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(0, -bodyLength);
        ctx.stroke();
        
        // Left arm
        const lArmRad = pose.lArm * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(0, -bodyLength + 20);
        ctx.lineTo(
            -armLength * Math.sin(lArmRad),
            -bodyLength + 20 - armLength * Math.cos(lArmRad)
        );
        ctx.stroke();
        
        // Right arm
        const rArmRad = pose.rArm * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(0, -bodyLength + 20);
        ctx.lineTo(
            armLength * Math.sin(rArmRad),
            -bodyLength + 20 - armLength * Math.cos(rArmRad)
        );
        ctx.stroke();
        
        // Left leg
        const lLegRad = pose.lLeg * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(
            -legLength * Math.sin(lLegRad),
            legLength * Math.cos(lLegRad)
        );
        ctx.stroke();
        
        // Right leg
        const rLegRad = pose.rLeg * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(
            legLength * Math.sin(rLegRad),
            legLength * Math.cos(rLegRad)
        );
        ctx.stroke();
        
        ctx.restore();
    }
    
    showScore() {
        // Calculate score based on dance plan
        const uniquePoses = new Set(this.dancePlan.keyframes.map(kf => kf.pose)).size;
        const creativity = Math.min(10, Math.round((uniquePoses / 10) * 10));
        
        const avgTime = this.dancePlan.duration / this.dancePlan.keyframes.length;
        const energy = Math.min(10, Math.round(10 - (avgTime - 0.5) * 2));
        
        const styles = ['Robot Disco', 'Jazz Funk', 'Hip Hop Flow', 'Ballet Grace', 'Breakdance Energy'];
        const style = styles[Math.floor(Math.random() * styles.length)];
        
        document.getElementById('scoreCreativity').textContent = `${creativity}/10`;
        document.getElementById('scoreEnergy').textContent = `${energy}/10`;
        document.getElementById('scoreStyle').textContent = style;
        
        this.scoreDiv.style.display = 'block';
    }
}

// Initialize when page loads
window.addEventListener('DOMContentLoaded', () => {
    if (window.wsClient && document.getElementById('danceCanvas')) {
        window.danceManager = new DanceManager(window.wsClient);
        console.log('[Dance] Manager initialized');
    }
});
```

---

### Phase 3: Testing & Validation (30 min)

#### Test Cases

**Test 1: Simple Commands**
```
User says: "Wave your arms then bow"
Expected: ARMS_WAVE_LEFT → ARMS_WAVE_RIGHT → BOW
```

**Test 2: Complex Sequence**
```
User says: "Jump up and down, spin around, kick high, and strike a pose"
Expected: JUMP → JUMP → SPIN_LEFT → KICK_RIGHT → ARMS_UP
```

**Test 3: Nonsense Handling**
```
User says: "Fly to the moon and do a backflip"
Expected: LLM interprets as: JUMP → SPIN_LEFT → BOW (reasonable sequence)
```

**Test 4: Edge Cases**
- Silent recording: Should show error
- Very short speech (<5s): Should still work
- Interrupted recording: Cancel should cleanup state

#### Integration Testing Script

Add to `frontend/index.html`:

```javascript
// Debug: Test with mock transcript
window.testDance = async (transcript) => {
    const mockPlan = {
        duration: 12.0,
        keyframes: [
            {time: 0.0, pose: "IDLE"},
            {time: 2.0, pose: "ARMS_UP"},
            {time: 4.0, pose: "ARMS_WAVE_LEFT"},
            {time: 6.0, pose: "SPIN_RIGHT"},
            {time: 8.0, pose: "KICK_RIGHT"},
            {time: 10.0, pose: "BOW"},
            {time: 12.0, pose: "IDLE"}
        ]
    };
    
    window.danceManager.receiveDancePlan(mockPlan, transcript || "Test dance");
};

// Run in console: testDance("wave spin bow")
```

---

### Phase 4: Polish & Enhancements (60 min)

#### 4.1 Smooth Easing

Already implemented with `easeInOutCubic()` in Phase 2.

#### 4.2 Visual Effects

Add glow effect to active joints:

```javascript
// In drawStickFigure(), add before drawing:
ctx.shadowColor = '#4CAF50';
ctx.shadowBlur = 20;

// Add after drawing:
ctx.shadowBlur = 0;
```

#### 4.3 Background Particles

Add to `dance.js`:

```javascript
class ParticleSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.particles = [];
    }
    
    update() {
        // Update and remove dead particles
        this.particles = this.particles.filter(p => {
            p.y += p.vy;
            p.x += p.vx;
            p.alpha -= 0.02;
            return p.alpha > 0;
        });
        
        // Add new particles randomly
        if (Math.random() < 0.1) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: this.canvas.height,
                vx: (Math.random() - 0.5) * 2,
                vy: -2 - Math.random() * 3,
                alpha: 1.0,
                size: 2 + Math.random() * 3
            });
        }
    }
    
    draw(ctx) {
        ctx.save();
        this.particles.forEach(p => {
            ctx.globalAlpha = p.alpha;
            ctx.fillStyle = '#4CAF50';
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
    }
}

// Add to DanceManager:
this.particles = new ParticleSystem(this.canvas);

// In animateDance(), before drawStickFigure:
this.particles.update();
this.particles.draw(this.ctx);
```

#### 4.4 AI Narrator (Optional)

Add voice commentary using Web Speech API:

```javascript
class DanceNarrator {
    constructor() {
        this.synth = window.speechSynthesis;
        this.voice = null;
        this.loadVoice();
    }
    
    loadVoice() {
        const voices = this.synth.getVoices();
        this.voice = voices.find(v => v.name.includes('Google')) || voices[0];
    }
    
    narrate(text) {
        if (!this.voice) this.loadVoice();
        
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.voice = this.voice;
        utterance.rate = 1.1;
        utterance.pitch = 1.2;
        this.synth.speak(utterance);
    }
}

// Use in DanceManager:
this.narrator = new DanceNarrator();

// At key moments:
this.narrator.narrate("And now for a spin!");
```

---

## 🚀 Quick Start Guide

### Step 1: Backend (15 min)

1. Copy Phase 1 code into `backend/ws/handler.py`
2. Restart backend: `python3 main.py`
3. Test with curl:
   ```bash
   curl -X POST http://localhost:8000/test-dance \
     -H "Content-Type: application/json" \
     -d '{"transcript": "wave arms then spin"}'
   ```

### Step 2: Frontend (15 min)

1. Add Phase 2 HTML to `frontend/index.html`
2. Create `frontend/js/dance.js` with Phase 2 code
3. Add CSS from Phase 2 to `frontend/css/styles.css`
4. Update `frontend/index.html` to load dance.js:
   ```html
   <script src="js/dance.js"></script>
   ```

### Step 3: Test End-to-End (10 min)

1. Open http://localhost:8000
2. Click "🎭 Create Dance"
3. Speak for 30 seconds: "Wave your arms up and down, then spin around and bow"
4. Watch processing (3–6s)
5. See stick figure dance!

---

## 📊 Performance Targets

| Metric | Target | Actual (Expected) |
|--------|--------|-------------------|
| Recording duration | 30s | 30s ✅ |
| Vosk transcription (30s audio) | <5s | 2–4s ✅ |
| LLM dance generation | <3s | 1–2s ✅ |
| Total processing time | <8s | 3–6s ✅ |
| Animation FPS | 60fps | 60fps ✅ |
| End-to-end (button → dance end) | <45s | 33–36s ✅ |

---

## 🎯 Success Criteria Checklist

### MVP (2 hours)
- [ ] Backend accepts `start_dance` message
- [ ] 30s audio accumulates correctly
- [ ] Vosk transcribes full audio
- [ ] LLM generates valid JSON dance plan
- [ ] Frontend receives dance plan via WebSocket
- [ ] Canvas renders stick figure with 6 poses
- [ ] Poses interpolate smoothly
- [ ] Dance plays for 12 seconds
- [ ] Score displays after dance

### Polish (1 hour)
- [ ] Progress bar during recording
- [ ] Status messages ("Transcribing...", "Choreographing...")
- [ ] Smooth easing between poses
- [ ] Visual effects (glow, particles)
- [ ] Error handling (no speech, failed LLM)
- [ ] Cancel button works

### Stretch Goals (+2 hours each)
- [ ] AI narrator with Web Speech API
- [ ] Share/download dance video
- [ ] Gallery of saved dances
- [ ] Multi-character dances (2+ figures)

---

## 🐛 Troubleshooting

### Issue: No transcript generated
**Cause:** Audio too quiet or Vosk model not loaded  
**Fix:** Check RMS volume in logs, ensure model at `models/vosk-model-small-en-us-0.15/`

### Issue: LLM returns invalid JSON
**Cause:** Model hallucinating or prompt unclear  
**Fix:** Add `response_format={"type": "json_object"}` in Phase 1.4, validate structure

### Issue: Animation jerky
**Cause:** Too few keyframes or missing easing  
**Fix:** Ensure 8+ keyframes, verify `easeInOutCubic()` is called

### Issue: Stick figure not visible
**Cause:** Canvas coordinate issues  
**Fix:** Check `centerX`, `centerY` calculations, verify `ctx.translate()`

---

## 📁 File Summary

### New Files
```
frontend/js/dance.js          (150 lines) - Dance manager + renderer
```

### Modified Files
```
backend/ws/handler.py         (+80 lines) - Dance recording + LLM
frontend/index.html           (+40 lines) - Dance UI elements
frontend/css/styles.css       (+60 lines) - Dance styles
```

### Total Code Added
- Backend: ~80 lines
- Frontend: ~250 lines
- **Total: ~330 lines**

---

## 🎓 Learning Resources

- **Canvas API:** https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API
- **Easing functions:** https://easings.net/
- **Web Speech API:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API
- **JSON Schema:** https://json-schema.org/

---

## 🚢 Deployment Considerations

### Backend Changes
- No new dependencies needed (Vosk + OpenAI already installed)
- Add dance state cleanup on disconnect
- Consider timeout for stuck recordings (35s max)

### Frontend Changes
- Canvas performance: 60fps should work on 5-year-old laptops
- Mobile: Scale canvas to screen width
- Accessibility: Add keyboard controls for playback

### Production Optimizations
- Cache LLM responses for common descriptions
- Preload pose library on page load
- Add analytics: track popular dance descriptions

---

## 🎉 Next Steps

1. **Implement MVP** (2 hours)
   - Copy Phase 1 + 2 code
   - Test with mock transcript first
   - Then test end-to-end with real recording

2. **Test with Users** (30 min)
   - Get 3–5 people to try different descriptions
   - Note which descriptions work best
   - Collect edge cases

3. **Polish** (1 hour)
   - Add visual effects
   - Improve error messages
   - Fine-tune easing curves

4. **Share** (optional)
   - Add video recording
   - Export as GIF
   - Social media integration

**Time to first working prototype: 2 hours**  
**Time to polished MVP: 4 hours**

Ready to dance? Start with Phase 1! 🎭
