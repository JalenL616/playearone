import numpy as np
from collections import deque
from typing import Optional
import config


class AudioBuffer:
    """Manages incoming audio chunks and assembles them for processing."""

    def __init__(self, sample_rate: int = config.SAMPLE_RATE):
        self.sample_rate = sample_rate
        self.buffer = deque()
        self.total_samples = 0

    def add_chunk(self, audio_data: bytes) -> None:
        """Add a chunk of audio data (16-bit PCM) to the buffer."""
        audio_array = np.frombuffer(audio_data, dtype=np.int16).astype(np.float32)
        # Normalize to [-1, 1]
        audio_array = audio_array / 32768.0
        self.buffer.append(audio_array)
        self.total_samples += len(audio_array)

    def get_audio(self, duration_seconds: float) -> Optional[np.ndarray]:
        """
        Get audio of specified duration from buffer.
        Returns None if not enough audio available.
        """
        required_samples = int(duration_seconds * self.sample_rate)

        if self.total_samples < required_samples:
            return None

        # Concatenate chunks
        all_audio = np.concatenate(list(self.buffer))

        # Return requested duration
        return all_audio[:required_samples]

    def consume(self, duration_seconds: float) -> Optional[np.ndarray]:
        """
        Get and remove audio of specified duration from buffer.
        Returns None if not enough audio available.
        """
        audio = self.get_audio(duration_seconds)
        if audio is None:
            return None

        samples_to_remove = len(audio)

        # Remove consumed samples from buffer
        while samples_to_remove > 0 and self.buffer:
            chunk = self.buffer[0]
            if len(chunk) <= samples_to_remove:
                self.buffer.popleft()
                samples_to_remove -= len(chunk)
                self.total_samples -= len(chunk)
            else:
                # Partial consumption
                self.buffer[0] = chunk[samples_to_remove:]
                self.total_samples -= samples_to_remove
                samples_to_remove = 0

        return audio

    def clear(self) -> None:
        """Clear the buffer."""
        self.buffer.clear()
        self.total_samples = 0

    def duration_seconds(self) -> float:
        """Get current buffer duration in seconds."""
        return self.total_samples / self.sample_rate
