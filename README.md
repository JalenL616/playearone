# PlayEarOne - Voice Command System

A real-time voice command system that identifies speakers and extracts game commands from audio.

## Features

- **Speaker Enrollment**: Register voices with names for identification
- **Real-time Speaker ID**: Uses Pyannote.audio to identify who is speaking
- **Command Recognition**: Uses GPT-4o audio to extract commands ("up", "down")
- **WebSocket Streaming**: Low-latency audio processing

## Setup

### Prerequisites

- Python 3.10+
- A Hugging Face account with accepted model terms
- OpenAI API key

### 1. Accept Hugging Face Model Terms

Go to the following page and accept the terms:

- https://huggingface.co/pyannote/wespeaker-voxceleb-resnet34-LM

### 2. Get API Keys

- **Hugging Face Token**: https://huggingface.co/settings/tokens
- **OpenAI API Key**: https://platform.openai.com/api-keys

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
4. Speak clearly for 5 seconds
5. Wait for confirmation

### Listen for Commands

1. Go to the "Live Commands" tab
2. Click "Start Listening"
3. Speak commands: "up" or "down"
4. See commands appear with speaker identification

## Project Structure

```
PlayEarOne/
├── backend/
│   ├── main.py              # FastAPI entry point
│   ├── config.py            # Configuration
│   ├── audio/               # Audio processing
│   ├── speakers/            # Speaker enrollment & ID
│   ├── commands/            # GPT-4o command parsing
│   ├── ws/                  # WebSocket handling
│   └── data/                # Speaker storage
│
└── frontend/
    ├── index.html           # Main page
    ├── css/styles.css       # Styling
    └── js/                  # JavaScript modules
```

## Extending Commands

Edit `backend/config.py` to add new commands:

```python
VALID_COMMANDS = ["up", "down", "left", "right", "fire"]
```

The GPT-4o prompt will automatically include new commands.
