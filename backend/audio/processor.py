import numpy as np
import torch
from scipy import signal
from typing import Tuple
import config


class AudioProcessor:
    """Handles audio preprocessing and format conversion."""

    def __init__(self, target_sample_rate: int = config.SAMPLE_RATE):
        self.target_sample_rate = target_sample_rate

    def resample(self, audio: np.ndarray, original_sr: int) -> np.ndarray:
        """Resample audio to target sample rate."""
        if original_sr == self.target_sample_rate:
            return audio

        # Calculate resampling ratio
        ratio = self.target_sample_rate / original_sr
        new_length = int(len(audio) * ratio)

        resampled = signal.resample(audio, new_length)
        return resampled.astype(np.float32)

    def to_mono(self, audio: np.ndarray) -> np.ndarray:
        """Convert stereo audio to mono."""
        if audio.ndim == 1:
            return audio
        return np.mean(audio, axis=1).astype(np.float32)

    def normalize(self, audio: np.ndarray) -> np.ndarray:
        """Normalize audio to [-1, 1] range."""
        max_val = np.max(np.abs(audio))
        if max_val > 0:
            return audio / max_val
        return audio

    def to_torch(self, audio: np.ndarray) -> torch.Tensor:
        """Convert numpy array to torch tensor for Pyannote."""
        # Pyannote expects (channel, samples) format
        tensor = torch.from_numpy(audio).float()
        if tensor.ndim == 1:
            tensor = tensor.unsqueeze(0)
        return tensor

    def prepare_for_pyannote(self, audio: np.ndarray) -> Tuple[torch.Tensor, int]:
        """
        Prepare audio for Pyannote processing.
        Returns (tensor, sample_rate) tuple.
        """
        audio = self.to_mono(audio)
        audio = self.normalize(audio)
        tensor = self.to_torch(audio)
        return tensor, self.target_sample_rate

    def prepare_for_openai(self, audio: np.ndarray) -> bytes:
        """
        Prepare audio for OpenAI API.
        Returns 16-bit PCM bytes.
        """
        audio = self.to_mono(audio)
        audio = self.normalize(audio)
        # Convert to 16-bit PCM
        audio_int16 = (audio * 32767).astype(np.int16)
        return audio_int16.tobytes()
