import os
from dotenv import load_dotenv

load_dotenv()

# OpenRouter API (or OpenAI API)
OPENROUTER_API_KEY = os.getenv("OPENROUTER_API_KEY", os.getenv("OPENAI_API_KEY", ""))
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
LLM_MODEL = os.getenv("LLM_MODEL", "openai/gpt-4o-mini")

# Deepgram API
DEEPGRAM_API_KEY = os.getenv("DEEPGRAM_API_KEY", "")

# Hugging Face token (required for Pyannote)
HF_TOKEN = os.getenv("HF_TOKEN", "")

# Audio settings
SAMPLE_RATE = 16000
CHANNELS = 1
CHUNK_DURATION_MS = 500

# Speaker identification
SPEAKER_SIMILARITY_THRESHOLD = 0.3  # Cosine similarity threshold for speaker matching
ENROLLMENT_DURATION_SECONDS = 5

# Paths
DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
SPEAKERS_FILE = os.path.join(DATA_DIR, "speakers.json")

# Valid commands (extensible)
VALID_COMMANDS = ["up", "down"]

# Player assignments: speaker name → player number (1 = left, 2 = right)
PLAYER_ASSIGNMENTS = {
    "maya": 1,
    "inaara": 2,
}
