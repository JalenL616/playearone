import os
from dotenv import load_dotenv

load_dotenv()

# OpenRouter API (or OpenAI API)
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", os.getenv("OPENAI_API_KEY", ""))
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
LLM_MODEL = os.getenv("LLM_MODEL", "openai/gpt-4o-mini")

# Vosk (local speech recognition) - NO CLOUD
USE_VOSK = True  # Always use local Vosk
VOSK_MODEL_PATH = os.path.join(os.path.dirname(__file__), "models", "vosk-model-small-en-us-0.15")

# Audio settings
SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_DURATION_MS = 500

# Speaker identification (using Resemblyzer - fast local)
SPEAKER_SIMILARITY_THRESHOLD = 0.40  # Threshold for speaker matching
SPEAKER_GAME_THRESHOLD = 0.40  # Lower threshold for active game players
ENROLLMENT_DURATION_SECONDS = 5

# Paths
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
SPEAKERS_FILE = os.path.join(DATA_DIR, "speakers.json")

# Valid commands (superset for all games)
VALID_COMMANDS = [
    # Pong
    "up", "down",
    # Boxing
    "jab", "cross", "hook", "uppercut", "upper",
    "block", "guard", "dodge", "duck",
    "forward", "back", "advance", "retreat", "left", "right",
    # Soccer
    "jump", "kick", "shoot", "power",
    # Shared
    "start", "serve", "resume", "pause", "fight",
]

# Player assignments: speaker name → player number (1 = left, 2 = right)
PLAYER_ASSIGNMENTS = {
}
