import json
import time
from typing import Optional, List
from dataclasses import dataclass
import numpy as np
import config


@dataclass
class ParsedCommand:
    """Result of command parsing."""
    command: Optional[str]
    raw_text: Optional[str]
    confidence: float


class VoskTranscriber:
    """Local speech recognition using Vosk (fast, no cloud)."""

    def __init__(self):
        from vosk import Model, KaldiRecognizer
        import os

        model_path = config.VOSK_MODEL_PATH
        if not os.path.exists(model_path):
            raise RuntimeError(
                f"Vosk model not found at {model_path}\n"
                f"Download from: https://alphacephei.com/vosk/models\n"
                f"Recommended: vosk-model-small-en-us-0.15 (~40MB)"
            )

        print("[Vosk] Loading model...")
        self._model = Model(model_path)
        self._sample_rate = config.SAMPLE_RATE
        print("[Vosk] Model loaded")

    def transcribe(self, audio: np.ndarray, sample_rate: int) -> str:
        """Transcribe audio using Vosk."""
        from vosk import KaldiRecognizer

        # Create recognizer for this audio
        rec = KaldiRecognizer(self._model, sample_rate)
        rec.SetWords(False)  # Don't need word-level timing

        # Convert float32 [-1, 1] to int16 PCM
        if audio.dtype == np.float32:
            audio_int16 = (audio * 32767).astype(np.int16)
        else:
            audio_int16 = audio.astype(np.int16)

        # Process audio
        rec.AcceptWaveform(audio_int16.tobytes())

        # Get final result
        result = json.loads(rec.FinalResult())
        return result.get("text", "").strip()


# Phonetic mappings for common misrecognitions
PHONETIC_MATCHES = {
    # "up" variations
    "yup": "up", "yep": "up", "uh": "up", "uhh": "up", "app": "up", "op": "up",
    # "down" variations
    "dawn": "down", "town": "down", "darn": "down",
    # "start" variations
    "star": "start", "stars": "start", "starts": "start", "starting": "start", "started": "start",
    "stark": "start", "store": "start", "story": "start", "stir": "start", "stuart": "start",
    # "pause" variations
    "paws": "pause", "paused": "pause", "pausing": "pause", "paus": "pause", "pos": "pause",
    # "serve" variations
    "serves": "serve", "serving": "serve", "served": "serve", "surf": "serve",
    # "resume" variations
    "resumes": "resume", "resuming": "resume", "resumed": "resume",
    # "jab" variations
    "job": "jab", "ja": "jab", "jap": "jab", "jabs": "jab", "jabbed": "jab",
    # "cross" variations
    "crawss": "cross", "craw": "cross", "crosses": "cross", "crossed": "cross",
    # "hook" variations
    "huk": "hook", "hooked": "hook", "hooking": "hook", "hulk": "hook",
    # "uppercut" variations
    "upper": "uppercut", "cut": "uppercut", "upperkat": "uppercut", "upcut": "uppercut", "uppercuts": "uppercut",
    # "block" variations
    "blog": "block", "blocked": "block", "blocking": "block", "box": "block", "bloc": "block",
    # "guard" variations
    "guarding": "guard", "guarded": "guard",
    # "dodge" variations
    "doge": "dodge", "dodged": "dodge", "dodging": "dodge", "dok": "dodge", "dogs": "dodge",
    # "duck" variations
    "ducked": "duck", "ducking": "duck", "ducks": "duck",
    # "forward" variations
    "for": "forward", "towards": "forward", "forwards": "forward", "forwarded": "forward",
    # "advance" variations
    "advancing": "advance", "advanced": "advance", "advances": "advance",
    # "back" variations
    "bak": "back", "backwards": "back", "backing": "back", "backed": "back",
    # "retreat" variations
    "retreating": "retreat", "retreated": "retreat", "retreats": "retreat",
    # "left" variations
    "lefty": "left", "lefts": "left",
    # "right" variations
    "righty": "right", "rights": "right",
    # "fight" variations
    "fights": "fight", "fighting": "fight", "fighter": "fight",
}


class CommandParser:
    """Parses voice commands using local Vosk transcription."""

    def __init__(self):
        self.valid_commands = set(config.VALID_COMMANDS)
        print("[CommandParser] Using Vosk (local) for transcription")
        self._transcriber = VoskTranscriber()

    def _transcribe(self, audio: np.ndarray, sample_rate: int) -> str:
        """Transcribe audio using Vosk."""
        return self._transcriber.transcribe(audio, sample_rate)

    def _match_command(self, word: str) -> Optional[str]:
        """Match a word to a command (direct or phonetic)."""
        word = word.lower().strip()

        # Direct match
        if word in self.valid_commands:
            return word

        # Phonetic match
        if word in PHONETIC_MATCHES:
            matched = PHONETIC_MATCHES[word]
            if matched in self.valid_commands:
                return matched

        return None

    def parse(self, audio: np.ndarray, sample_rate: int) -> ParsedCommand:
        """Parse audio to extract a single command."""
        try:
            t0 = time.perf_counter()
            raw_text = self._transcribe(audio, sample_rate)
            transcribe_time = (time.perf_counter() - t0) * 1000

            if not raw_text:
                print(f"[Transcribe] {transcribe_time:.0f}ms (empty)")
                return ParsedCommand(command=None, raw_text=None, confidence=0.0)

            # Try to match the whole text first
            cmd = self._match_command(raw_text)
            if cmd:
                print(f"[Transcribe] {transcribe_time:.0f}ms | Direct match: '{cmd}'")
                return ParsedCommand(command=cmd, raw_text=raw_text, confidence=0.95)

            # Try matching individual words
            for word in raw_text.lower().split():
                cmd = self._match_command(word)
                if cmd:
                    print(f"[Transcribe] {transcribe_time:.0f}ms | Word match: '{cmd}' from '{raw_text}'")
                    return ParsedCommand(command=cmd, raw_text=raw_text, confidence=0.85)

            print(f"[Transcribe] {transcribe_time:.0f}ms | No match: '{raw_text}'")
            return ParsedCommand(command=None, raw_text=raw_text, confidence=0.0)

        except Exception as e:
            print(f"Command parsing error: {e}")
            return ParsedCommand(command=None, raw_text=str(e), confidence=0.0)

    def parse_multiple(self, audio: np.ndarray, sample_rate: int) -> List[ParsedCommand]:
        """Parse audio and extract ALL commands found."""
        try:
            t0 = time.perf_counter()
            raw_text = self._transcribe(audio, sample_rate)
            transcribe_time = (time.perf_counter() - t0) * 1000

            if not raw_text:
                print(f"[Transcribe] {transcribe_time:.0f}ms (empty)")
                return []

            # Find all commands in the text
            commands_found = []
            for word in raw_text.lower().split():
                cmd = self._match_command(word)
                if cmd:
                    commands_found.append(cmd)

            if commands_found:
                print(f"[Transcribe] {transcribe_time:.0f}ms | Found {len(commands_found)} commands: {commands_found} from '{raw_text}'")
                return [
                    ParsedCommand(command=cmd, raw_text=raw_text, confidence=0.9)
                    for cmd in commands_found
                ]
            else:
                print(f"[Transcribe] {transcribe_time:.0f}ms | No commands in: '{raw_text}'")
                return [ParsedCommand(command=None, raw_text=raw_text, confidence=0.0)]

        except Exception as e:
            print(f"Command parsing error: {e}")
            return []
