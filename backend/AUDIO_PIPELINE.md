# PlayEarOne Audio Processing Pipeline

## Overview

**100% Local Processing - No Cloud Services**

```
┌─────────────┐     WebSocket      ┌─────────────┐
│   Browser   │ ◄──────────────────► │   Backend   │
│  (Frontend) │    Binary Audio     │  (FastAPI)  │
└─────────────┘                     └─────────────┘
```

## Pipeline Flow

```
┌──────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                     │
├──────────────────────────────────────────────────────────────────────────┤
│  1. Microphone Access (getUserMedia)                                      │
│           ↓                                                               │
│  2. AudioContext (16kHz sample rate)                                      │
│           ↓                                                               │
│  3. ScriptProcessorNode (4096 buffer)                                     │
│           ↓                                                               │
│  4. Float32 → 16-bit PCM conversion                                       │
│           ↓                                                               │
│  5. Send via WebSocket (binary)                                           │
└──────────────────────────────────────────────────────────────────────────┘
                                    ↓
                            WebSocket Binary
                                    ↓
┌──────────────────────────────────────────────────────────────────────────┐
│                         BACKEND (100% LOCAL)                              │
├──────────────────────────────────────────────────────────────────────────┤
│  6. WebSocketHandler receives audio chunks                                │
│           ↓                                                               │
│  7. AudioBuffer accumulates chunks                                        │
│     - Triggers at 0.5s of audio                                           │
│     - Processes 0.75s chunks                                              │
│           ↓                                                               │
│  8. PARALLEL PROCESSING (ThreadPoolExecutor)                              │
│     ┌─────────────────────┬─────────────────────┐                        │
│     │   Speaker ID        │   Transcription     │                        │
│     │   (Resemblyzer)     │   (Vosk)            │                        │
│     │   ~50ms             │   ~100-300ms        │                        │
│     │   LOCAL             │   LOCAL             │                        │
│     └─────────────────────┴─────────────────────┘                        │
│           ↓                         ↓                                     │
│  9. Speaker matching against enrolled profiles                            │
│           ↓                                                               │
│  10. Command parsing (direct match + phonetic matching)                   │
│           ↓                                                               │
│  11. Build CommandResult with:                                            │
│      - speaker, speaker_confidence                                        │
│      - command, command_confidence                                        │
│      - volume, speech_duration                                            │
│      - raw_text, timestamp                                                │
│           ↓                                                               │
│  12. Send JSON response via WebSocket                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### Frontend (`frontend/js/`)

| File               | Purpose                                          |
| ------------------ | ------------------------------------------------ |
| `audio-capture.js` | Microphone access, audio context, PCM conversion |
| `websocket.js`     | WebSocket connection management                  |
| `display.js`       | UI updates, command display                      |
| `enrollment.js`    | Speaker enrollment UI                            |

### Backend (`backend/`)

| File                     | Purpose                                                 |
| ------------------------ | ------------------------------------------------------- |
| `ws/handler.py`          | WebSocket handler, audio buffering, parallel processing |
| `audio/__init__.py`      | AudioBuffer, AudioProcessor classes                     |
| `commands/parser.py`     | Vosk transcription, command extraction                  |
| `speakers/enrollment.py` | Resemblyzer speaker embedding extraction                |
| `speakers/identifier.py` | Speaker matching via cosine similarity                  |
| `speakers/storage.py`    | Speaker profiles JSON storage                           |
| `config.py`              | All configuration settings                              |

## Technology Stack

| Component            | Technology        | Type  | Speed      |
| -------------------- | ----------------- | ----- | ---------- |
| **Speech-to-Text**   | Vosk              | Local | ~100-300ms |
| **Speaker ID**       | Resemblyzer       | Local | ~50ms      |
| **Command Matching** | Direct + Phonetic | Local | <1ms       |

**No cloud services are used.** Everything runs locally.

## Timing Breakdown

| Stage                    | Time           | Notes                 |
| ------------------------ | -------------- | --------------------- |
| Audio buffering          | 500-750ms      | Wait for enough audio |
| Speaker ID (Resemblyzer) | ~50ms          | Fast local embedding  |
| Transcription (Vosk)     | ~100-300ms     | Local processing      |
| Command matching         | <1ms           | Direct + phonetic     |
| **Total Latency**        | **~400-600ms** | All local             |

## Configuration (`config.py`)

```python
# Audio
SAMPLE_RATE = 16000       # 16kHz
CHUNK_DURATION_MS = 500   # Buffer trigger threshold

# Vosk (local speech recognition)
USE_VOSK = True           # Always local
VOSK_MODEL_PATH = "models/vosk-model-small-en-us-0.15"

# Speaker ID (Resemblyzer)
SPEAKER_SIMILARITY_THRESHOLD = 0.75   # Cosine similarity for matching
SPEAKER_GAME_THRESHOLD = 0.6          # Lower threshold during game

# Commands
VALID_COMMANDS = ["up", "down", "jab", "cross", "hook", ...]
```

## Data Flow Formats

### Audio Data

```
Frontend → Backend: 16-bit PCM, mono, 16kHz (binary WebSocket)
Backend internal: float32 numpy array, normalized [-1, 1]
Resemblyzer input: float32 numpy array, resampled to 16kHz
Vosk input: 16-bit PCM bytes
```

### WebSocket Messages

**Frontend → Backend:**

```json
{"type": "start_listening"}
{"type": "stop_listening"}
{"type": "start_enrollment", "name": "PlayerName"}
{"type": "complete_enrollment", "name": "PlayerName"}
{"type": "list_speakers"}
{"type": "set_mode", "mode": "game"}
```

**Backend → Frontend:**

```json
{
  "type": "command",
  "player": 1,
  "speaker": "PlayerName",
  "speaker_confidence": 0.85,
  "command": "up",
  "command_confidence": 0.95,
  "raw_text": "up",
  "volume": 0.6,
  "speech_duration": 0.5,
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## Speaker Identification (Resemblyzer)

```
1. Extract 256-dim embedding using Resemblyzer VoiceEncoder
2. Normalize embedding to unit vector
3. Compare against all enrolled speaker embeddings
4. Use cosine similarity for matching
5. If similarity > threshold → return matched speaker
6. If in "game" mode → only check PLAYER_ASSIGNMENTS speakers
```

## Command Detection (Vosk + Phonetic Matching)

```
1. Transcribe audio with Vosk (local) → raw text
2. Check for direct command match (e.g., "up" == "up")
3. Check phonetic matches (e.g., "yup" → "up", "dawn" → "down")
4. Return all commands found (supports "up down" → ["up", "down"])
```

## Phonetic Mappings

Common misrecognitions are automatically corrected:

| Heard             | Mapped To |
| ----------------- | --------- |
| yup, yep, uh, app | up        |
| dawn, town, darn  | down      |
| job, ja, jabs     | jab       |
| blog, box, bloc   | block     |
| doge, dogs, dok   | dodge     |
| duck, ducked      | duck      |

## Requirements

```
# Core
fastapi, uvicorn, websockets

# ML/Audio
numpy, torch, torchaudio, scipy

# Speaker ID (local)
resemblyzer>=0.1.3

# Speech-to-text (local)
vosk>=0.3.44
```

## Setup

1. Download Vosk model:

   ```bash
   cd backend/models
   wget https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
   unzip vosk-model-small-en-us-0.15.zip
   ```

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Run backend:
   ```bash
   uvicorn main:app --reload
   ```
