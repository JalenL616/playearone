# PlayEarOne - Voice Command System

A real-time voice command system that identifies speakers and extracts game commands from audio. Control games like Pong and Boxing using only your voice with sub-500ms latency.

## Features

- **Speaker Enrollment**: Register voices with names for identification (5-second sample)
- **Real-time Speaker ID**: Uses Pyannote.audio to identify who is speaking (cosine similarity matching)
- **Fast Transcription**: Vosk (local, 50-100ms) or Deepgram (cloud, 150-300ms)
- **Smart Command Extraction**: 3-stage fallback system (direct match → phonetic variants → LLM)
- **Parallel Processing**: Speaker ID and transcription run simultaneously
- **WebSocket Streaming**: Low-latency audio processing with 500ms buffering
- **Multi-Game Support**: Voice-controlled Pong and Boxing games
- **2-Player Support**: Speaker assignment system for multiplayer games

## Setup

### Prerequisites

- Python 3.10+
- A Hugging Face account with accepted model terms
- OpenRouter API key (or OpenAI API key)
- Optional: Deepgram API key (if not using Vosk)

### 1. Accept Hugging Face Model Terms

Go to the following page and accept the terms:

- https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM

### 2. Get API Keys

- **Hugging Face Token**: https://huggingface.co/settings/tokens
- **OpenRouter API Key**: https://openrouter.ai/keys (or OpenAI: https://platform.openai.com/api-keys)
- **Deepgram API Key** (optional): https://deepgram.com/

### 3. Create Environment File

```bash
cd backend
cp .env.example .env
# Edit .env with your API keys
```

### 4. Install Python Dependencies

```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```

**Note:** The Vosk model (`vosk-model-small-en-us-0.15`, ~40MB) should already be included in `backend/models/`. If not, download from https://alphacephei.com/vosk/models

### 5. Run the Server

```bash
cd backend
python main.py
```

The server will start at http://localhost:8000

### 6. Open the Browser

Navigate to http://localhost:8000 in your browser.

## Usage

### Enroll a Speaker

1. Go to the "Speaker Enrollment" tab
2. Enter a name
3. Click "Start Recording"
4. Speak clearly for 5 seconds (any content - your natural voice)
5. Wait for confirmation

**Note:** Enrolled speakers are stored in `backend/data/speakers.json` as 256-dimensional voice embeddings.

### Test Commands (Live Commands Tab)

1. Go to the "Live Commands" tab
2. Click "Start Listening"
3. Speak commands from the list below
4. See commands appear with speaker identification and confidence scores

### Play Games

**Pong:**
- Navigate to http://localhost:8000/pong
- Assign speakers to Player 1 and Player 2 using dropdowns
- Commands: "up", "down", "start", "pause", "serve"

**Boxing:**
- Navigate to http://localhost:8000/boxing
- Assign speakers to Player 1 and Player 2 using dropdowns
- Attack commands: "jab", "cross", "hook", "uppercut"
- Defense commands: "block", "guard", "dodge", "duck"
- Movement: "forward", "back", "left", "right"
- Control: "start", "pause", "fight"

## Project Structure

```
PlayEarOne/
├── backend/
│   ├── main.py              # FastAPI entry point
│   ├── config.py            # Configuration & valid commands
│   ├── audio/               # Audio buffering & preprocessing
│   │   ├── buffer.py        # Circular audio buffer
│   │   └── processor.py     # 16kHz resampling & normalization
│   ├── speakers/            # Speaker enrollment & identification
│   │   ├── enrollment.py    # Pyannote embedding extraction
│   │   ├── identifier.py    # Cosine similarity matching
│   │   └── storage.py       # JSON persistence
│   ├── commands/            # Command transcription & parsing
│   │   └── parser.py        # Vosk/Deepgram + phonetic + LLM
│   ├── ws/                  # WebSocket handling
│   │   └── handler.py       # Parallel processing coordinator
│   ├── data/                # Speaker storage
│   │   └── speakers.json    # Enrolled speaker embeddings
│   └── models/              # Vosk model
│       └── vosk-model-small-en-us-0.15/
│
├── frontend/
│   ├── index.html           # Main page (home/enrollment/live commands)
│   ├── css/styles.css       # Styling
│   └── js/                  # JavaScript modules
│       ├── audio-capture.js # Microphone → PCM conversion
│       ├── websocket.js     # WebSocket client
│       ├── display.js       # Command log & UI
│       └── enrollment.js    # Speaker enrollment flow
│
├── pong/                    # Voice-controlled Pong game
│   ├── index.html
│   └── js/
│       ├── VoiceInput.js    # Voice command handler
│       └── Game.js          # Game logic
│
├── boxing/                  # Voice-controlled Boxing game
│   ├── index.html
│   └── js/
│       ├── BoxingVoiceInput.js  # Voice command handler
│       ├── Fighter.js           # Fighter entity
│       └── Game.js              # Game logic
│
├── VOICE_COMMAND_PIPELINE.md  # Complete technical documentation
├── PIPELINE.md                 # Architecture overview
└── README.md                   # This file
```

## Extending Commands

Edit `backend/config.py` to add new commands:

```python
VALID_COMMANDS = [
    "up", "down",                           # Pong
    "jab", "cross", "hook", "uppercut",     # Boxing attacks
    "block", "guard", "dodge", "duck",      # Boxing defense
    "forward", "back", "left", "right",     # Movement
    "start", "pause", "serve", "resume"     # Control
]
```

### Adding Phonetic Variants

If a command is frequently misrecognized, add phonetic mappings in `backend/commands/parser.py`:

```python
phonetic_to_command = {
    "yup": "up",      # "up" often heard as "yup"
    "dawn": "down",   # "down" often heard as "dawn"
    "blog": "block",  # "block" often heard as "blog"
    # ... add more
}
```

This fast-path matching avoids expensive LLM calls for 90%+ of commands.

## Configuration

### Transcription Engine

Choose between local (Vosk) or cloud (Deepgram) transcription in `backend/config.py`:

```python
USE_VOSK = True   # True = Local (faster, free), False = Cloud (API cost)
```

**Vosk (Local):**
- Speed: 50-100ms
- Cost: Free
- Requirements: ~40MB model, ~20-40% CPU
- Offline capable

**Deepgram (Cloud):**
- Speed: 150-300ms (network + server)
- Cost: ~$0.0043/minute
- Requirements: API key, internet
- Lower CPU usage

### Speaker Identification Thresholds

Adjust similarity thresholds in `backend/config.py`:

```python
SPEAKER_SIMILARITY_THRESHOLD = 0.3   # General identification
SPEAKER_GAME_THRESHOLD = 0.15        # Active game players (more lenient)
```

Lower values = more lenient matching (may increase false positives)

### Player Assignments

Assign speakers to players in `backend/config.py` or via game UI:

```python
PLAYER_ASSIGNMENTS = {
    "Jalen": 1,  # Player 1 (left)
    "UP": 2,     # Player 2 (right)
}
```

## Performance

**Average Latency:** ~500ms (capture → processing → game)
- Audio capture: 256ms (browser buffer)
- Transcription (Vosk): 50-100ms
- Speaker ID: 30-50ms (parallel)
- Command match: <5ms (phonetic lookup)
- Network: ~40ms

**Optimization:**
- 90% of commands use fast phonetic matching (avoid LLM)
- Speaker ID and transcription run in parallel
- Vosk local processing eliminates cloud API latency

See [VOICE_COMMAND_PIPELINE.md](VOICE_COMMAND_PIPELINE.md) for detailed technical documentation.

## Troubleshooting

### Commands Not Recognized
- Check transcript in logs (`[Transcribe]`)
- Verify command in `VALID_COMMANDS`
- Add phonetic variant if misrecognized
- Lower confidence threshold (default: 0.65)

### Speaker Not Identified
- Re-enroll with clearer audio (5 seconds)
- Lower similarity threshold (0.3 → 0.15)
- Check `HF_TOKEN` in `.env`
- Verify enrolled in "Enrolled Speakers" tab

### High Latency
- Switch from Deepgram to Vosk (`USE_VOSK = True`)
- Check CPU usage (should be <40%)
- Verify not hitting LLM for most commands (check logs)

### Wrong Player
- Check speaker assignments in game UI dropdowns
- Verify `PLAYER_ASSIGNMENTS` in config
- Check speaker confidence in logs

## Documentation

- **[VOICE_COMMAND_PIPELINE.md](VOICE_COMMAND_PIPELINE.md)** - Complete technical documentation with architecture diagrams and performance analysis
- **[PIPELINE.md](PIPELINE.md)** - High-level architecture overview
- **[pong/ARCHITECTURE.md](pong/ARCHITECTURE.md)** - Pong game architecture

## License

MIT
