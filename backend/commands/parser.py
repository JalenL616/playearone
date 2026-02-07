import json
from typing import Optional
from dataclasses import dataclass
import numpy as np
from deepgram import DeepgramClient, PrerecordedOptions
from openai import OpenAI
import config
import io
import wave


@dataclass
class ParsedCommand:
    """Result of command parsing."""
    command: Optional[str]
    raw_text: Optional[str]
    confidence: float


class CommandParser:
    """Uses Deepgram for transcription and OpenRouter for command extraction."""

    def __init__(self):
        # OpenRouter client
        self.client = OpenAI(
            api_key=config.OPENROUTER_API_KEY,
            base_url=config.OPENROUTER_BASE_URL
        )
        self.model = config.LLM_MODEL
        self.valid_commands = config.VALID_COMMANDS

        # Deepgram client
        self.deepgram = DeepgramClient(config.DEEPGRAM_API_KEY)

    def _audio_to_wav_bytes(self, audio: np.ndarray, sample_rate: int) -> bytes:
        """Convert numpy audio array to WAV bytes for Deepgram."""
        # Ensure float32 normalized to [-1, 1]
        if audio.dtype != np.float32:
            audio = audio.astype(np.float32)

        max_val = np.max(np.abs(audio))
        if max_val > 1.0:
            audio = audio / max_val

        # Convert to 16-bit PCM
        audio_int16 = (audio * 32767).astype(np.int16)

        # Create WAV in memory
        buffer = io.BytesIO()
        with wave.open(buffer, 'wb') as wav_file:
            wav_file.setnchannels(1)
            wav_file.setsampwidth(2)  # 16-bit
            wav_file.setframerate(sample_rate)
            wav_file.writeframes(audio_int16.tobytes())

        return buffer.getvalue()

    def _transcribe(self, audio: np.ndarray, sample_rate: int) -> str:
        """Transcribe audio using Deepgram."""
        try:
            # Convert to WAV bytes
            audio_bytes = self._audio_to_wav_bytes(audio, sample_rate)

            # Deepgram options optimized for speed
            options = PrerecordedOptions(
                model="nova-2",
                language="en",
                smart_format=False,
                punctuate=False,
            )

            # Transcribe
            response = self.deepgram.listen.prerecorded.v("1").transcribe_file(
                {"buffer": audio_bytes, "mimetype": "audio/wav"},
                options
            )

            # Extract transcript
            transcript = response.results.channels[0].alternatives[0].transcript
            return transcript.strip()

        except Exception as e:
            print(f"Deepgram transcription error: {e}")
            return ""

    def _build_system_prompt(self) -> str:
        """Build the system prompt for command extraction."""
        commands_list = ", ".join(f'"{cmd}"' for cmd in self.valid_commands)

        return f"""You are a voice command parser for a game. Extract game commands from transcribed speech.

Valid commands: {commands_list}

Rules:
1. Only extract commands from the list above
2. Ignore filler words, partial words, or unclear speech
3. If multiple commands are mentioned, return only the FIRST clear command
4. If no valid command is detected, return null

Respond with JSON only, no other text:
{{"command": "<command>" | null, "confidence": <0.0-1.0>}}

Examples:
- Input "up": {{"command": "up", "confidence": 0.95}}
- Input "go down now": {{"command": "down", "confidence": 0.90}}
- Input "um uh": {{"command": null, "confidence": 0.0}}
- Input "jump": {{"command": null, "confidence": 0.0}}"""

    def parse(self, audio: np.ndarray, sample_rate: int) -> ParsedCommand:
        """
        Parse audio to extract command.
        Uses Deepgram for transcription, then OpenRouter for command parsing.

        Args:
            audio: Audio as numpy array (float32, normalized to [-1, 1])
            sample_rate: Audio sample rate

        Returns:
            ParsedCommand with extracted command details
        """
        try:
            # Step 1: Transcribe with Deepgram
            raw_text = self._transcribe(audio, sample_rate)

            if not raw_text:
                return ParsedCommand(
                    command=None,
                    raw_text=None,
                    confidence=0.0
                )

            # Step 2: Quick check - if transcription directly matches a command
            # or is phonetically similar
            text_lower = raw_text.lower().strip()
            
            # Direct match
            for cmd in self.valid_commands:
                if text_lower == cmd:
                    return ParsedCommand(
                        command=cmd,
                        raw_text=raw_text,
                        confidence=0.95
                    )
            
            # Phonetic/similar matches for common misrecognitions
            # "up" often heard as "yup", "yep", "uh", "app", etc.
            if text_lower in ["yup", "yep", "uh", "uhh", "app", "op"]:
                return ParsedCommand(
                    command="up",
                    raw_text=raw_text,
                    confidence=0.85
                )
            
            # "down" often heard as "dawn", "town", etc.
            if text_lower in ["dawn", "town", "darn"]:
                return ParsedCommand(
                    command="down",
                    raw_text=raw_text,
                    confidence=0.85
                )

            # Step 3: Use LLM to parse more complex utterances
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {
                        "role": "system",
                        "content": self._build_system_prompt()
                    },
                    {
                        "role": "user",
                        "content": f"Transcribed speech: \"{raw_text}\""
                    }
                ],
                max_tokens=50,
                temperature=0
            )

            # Parse response
            result_text = response.choices[0].message.content.strip()

            # Clean up potential markdown formatting
            if result_text.startswith("```"):
                result_text = result_text.split("```")[1]
                if result_text.startswith("json"):
                    result_text = result_text[4:]
                result_text = result_text.strip()

            result = json.loads(result_text)

            return ParsedCommand(
                command=result.get("command"),
                raw_text=raw_text,
                confidence=float(result.get("confidence", 0.0))
            )

        except json.JSONDecodeError:
            return ParsedCommand(
                command=None,
                raw_text=raw_text if 'raw_text' in dir() else None,
                confidence=0.0
            )
        except Exception as e:
            print(f"Command parsing error: {e}")
            return ParsedCommand(
                command=None,
                raw_text=str(e),
                confidence=0.0
            )

    def parse_text_fallback(self, text: str) -> ParsedCommand:
        """
        Fallback parser for when we already have transcribed text.
        Useful for testing without audio.
        """
        text_lower = text.lower().strip()

        for cmd in self.valid_commands:
            if cmd in text_lower:
                return ParsedCommand(
                    command=cmd,
                    raw_text=text,
                    confidence=0.9
                )

        return ParsedCommand(
            command=None,
            raw_text=text,
            confidence=0.0
        )
