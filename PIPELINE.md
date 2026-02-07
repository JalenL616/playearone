# PlayEarOne Audio Processing Pipeline

## Overview

PlayEarOne is a real-time voice command system. Audio flows from the browser microphone, through a WebSocket to a Python backend, where it is processed to identify **who** is speaking and **what** command they said.

```
Microphone → Browser → WebSocket → Backend → Speaker ID + Command Parse → WebSocket → Browser UI
```

---

## Step-by-Step Flow

### 1. Audio Capture (Frontend)

**File:** `frontend/js/audio-capture.js`

- The browser requests microphone access via `getUserMedia`
- An `AudioWorklet` or `ScriptProcessorNode` captures raw audio from the mic
- Audio arrives as float32 samples, which are converted to **16-bit PCM** (the format the backend expects)
- PCM chunks are sent to the WebSocket client at regular intervals

### 2. WebSocket Transport (Frontend → Backend)

**Frontend file:** `frontend/js/websocket.js`
**Backend file:** `backend/ws/` (WebSocket handler)

- The frontend connects to `ws://localhost:8000/ws`
- **Binary messages** carry raw PCM audio data
- **JSON messages** carry control signals:
  - `start_listening` / `stop_listening` — toggle live command mode
  - `start_enrollment` / `complete_enrollment` — speaker enrollment flow
  - `list_speakers` / `remove_speaker` — manage enrolled speakers
- The WebSocket auto-reconnects with exponential backoff (up to 5 attempts)

### 3. Audio Buffering (Backend)

**File:** `backend/audio/buffer.py`

- Incoming PCM chunks are appended to an `AudioBuffer`
- The buffer tracks how much audio has accumulated (in seconds)
- When enough audio is available, the backend consumes a chunk for processing
- This smooths out network jitter and ensures consistent-length audio segments

### 4. Audio Preprocessing (Backend)

**File:** `backend/audio/processor.py`

- Raw PCM bytes are converted and normalized:
  - **Resample** to 16kHz (the sample rate expected by the models)
  - **Convert to mono** if needed
  - **Normalize** amplitude to the [-1, 1] range
- Two output formats are prepared:
  - `prepare_for_pyannote()` — PyTorch tensor for speaker identification
  - WAV bytes for Deepgram transcription

### 5. Speaker Identification (Backend)

**File:** `backend/speakers/identifier.py`
**Model:** Pyannote `wespeaker-voxceleb-resnet34-LM`

- The preprocessed audio tensor is fed into the Pyannote embedding model
- This produces a **256-dimensional voice embedding** (a numerical fingerprint of the speaker's voice)
- The embedding is compared against all enrolled speakers using **cosine similarity**
- If the similarity exceeds the threshold (0.3), the speaker is identified by name
- If no match passes the threshold, the speaker is labeled as "unknown"

### 6. Command Recognition (Backend)

**File:** `backend/commands/parser.py`
**Models:** Deepgram Nova-2 (cloud) + OpenRouter LLM (fallback)

Speaker identification and command recognition run **in parallel** via a `ThreadPoolExecutor`.

**Stage A — Transcription (Deepgram)**
- Audio is converted to WAV bytes and sent to the **Deepgram Nova-2** API for transcription
- Returns a text transcript of the speech

**Stage B — Command Extraction (fast path or LLM)**
- **Fast path:** If the transcript exactly matches a valid command ("up", "down"), it returns immediately with 0.95 confidence — the LLM is skipped entirely
- **Slow path:** If the transcript is more complex (e.g. "move the paddle up"), it's sent to an LLM via the OpenRouter API for command extraction
- Valid commands are defined in `config.py`: `["up", "down"]`

**Silence filtering:** The handler checks RMS energy before processing and filters known hallucination phrases ("thank you", "subscribe", etc.)

### 7. Response (Backend → Frontend)

**File:** `backend/ws/` (WebSocket handler)

- The backend sends a JSON message back through the WebSocket containing:
  - **speaker** — who said it (or "unknown")
  - **command** — what they said ("up", "down", or none)
  - **confidence** — how confident the identification is

### 8. Display (Frontend)

**File:** `frontend/js/display.js`

- The `DisplayManager` receives the JSON response
- Commands appear in the live command log with:
  - Speaker name
  - Detected command
  - Confidence score
- Stats update (command count, active speakers)

---

## Speaker Enrollment Flow

Enrollment is a separate flow that registers a new voice:

```
User enters name → Clicks "Start Recording" → Speaks for 5 seconds → Backend extracts embedding → Stored to speakers.json
```

**Frontend:** `frontend/js/enrollment.js`
- Captures 5 seconds of voice audio
- Shows a progress bar during recording
- Sends audio + name to backend via WebSocket

**Backend:** `backend/speakers/enrollment.py`
- Extracts a voice embedding from the 5-second sample using Pyannote
- Stores the embedding with the speaker's name

**Backend:** `backend/speakers/storage.py`
- Persists speaker profiles (name + embedding) to `backend/data/speakers.json`
- Supports add, remove, update, and list operations

---

## Architecture Diagram

```
┌─────────────────────────────────────────────┐
│                  BROWSER                     │
│                                              │
│  ┌──────────┐  ┌───────────┐  ┌──────────┐ │
│  │  Audio   │→ │ WebSocket │→ │ Display  │ │
│  │ Capture  │  │  Client   │← │ Manager  │ │
│  └──────────┘  └─────┬─────┘  └──────────┘ │
│                       │ PCM audio (binary)   │
│                       │ Control msgs (JSON)  │
└───────────────────────┼──────────────────────┘
                        │ ws://localhost:8000/ws
┌───────────────────────┼──────────────────────┐
│                  BACKEND                      │
│                       │                       │
│               ┌───────▼───────┐               │
│               │   WebSocket   │               │
│               │   Handler     │               │
│               └───────┬───────┘               │
│                       │                       │
│               ┌───────▼───────┐               │
│               │  Audio Buffer │               │
│               │  + Processor  │               │
│               └───┬───────┬───┘               │
│                   │       │                   │
│          ┌────────▼──┐ ┌──▼─────────┐         │
│          │  Pyannote │ │ Deepgram  │         │
│          │ Speaker   │ │ Nova-2    │         │
│          │ Embedding │ │Transcribe │         │
│          └─────┬─────┘ └──────┬───┘          │
│                │              │               │
│          ┌─────▼─────┐  ┌────▼──────┐        │
│          │  Compare   │  │ Direct    │        │
│          │  vs Enrolled│ │ match or  │        │
│          │  Speakers  │  │ LLM parse │        │
│          └─────┬──────┘  └────┬─────┘         │
│                │              │                │
│                └──────┬───────┘                │
│                       │                       │
│               { speaker, command, confidence } │
└───────────────────────┼──────────────────────┘
                        │
                   Back to browser
```

---

## Key Configuration

| Setting | Value | File |
|---------|-------|------|
| Sample rate | 16,000 Hz | `config.py` |
| Audio format | 16-bit PCM, mono | `config.py` |
| Chunk duration | 500ms | `config.py` |
| Enrollment duration | 5 seconds | `config.py` |
| Speaker similarity threshold | 0.3 | `config.py` |
| Valid commands | "up", "down" | `config.py` |
| Speaker embedding model | Pyannote wespeaker-voxceleb-resnet34-LM | `enrollment.py` |
| Transcription model | Deepgram Nova-2 (cloud) | `parser.py` |
| Command extraction | Direct match, or OpenRouter LLM fallback | `parser.py` |
| LLM model | openai/gpt-4o-mini via OpenRouter | `config.py` |
