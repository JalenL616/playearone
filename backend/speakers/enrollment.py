import numpy as np
import torch
from typing import Optional, Tuple
from resemblyzer import VoiceEncoder, preprocess_wav
import config
from .storage import SpeakerStorage


class SpeakerEnrollment:
    """Handles voice enrollment for new speakers using Resemblyzer (fast, local)."""

    def __init__(self, storage: Optional[SpeakerStorage] = None):
        self.storage = storage or SpeakerStorage()
        self._encoder = None

    def _load_model(self) -> None:
        """Lazy load the Resemblyzer encoder."""
        if self._encoder is None:
            print("[Speaker] Loading Resemblyzer encoder...")
            self._encoder = VoiceEncoder()
            print("[Speaker] Resemblyzer encoder loaded")

    def extract_embedding(self, audio: torch.Tensor, sample_rate: int) -> np.ndarray:
        """
        Extract speaker embedding from audio using Resemblyzer.

        Args:
            audio: Torch tensor of shape (channels, samples) or (samples,)
            sample_rate: Audio sample rate

        Returns:
            Speaker embedding as numpy array (256-dim)
        """
        self._load_model()

        # Convert torch tensor to numpy
        if isinstance(audio, torch.Tensor):
            audio_np = audio.numpy()
        else:
            audio_np = audio

        # Handle multi-channel audio - take first channel or squeeze
        if audio_np.ndim == 2:
            audio_np = audio_np[0]  # Take first channel

        audio_np = audio_np.astype(np.float32)

        # Preprocess for Resemblyzer (resamples to 16kHz if needed)
        wav = preprocess_wav(audio_np, source_sr=sample_rate)

        # Extract embedding
        embedding = self._encoder.embed_utterance(wav)
        return embedding

    def enroll(self, name: str, audio: torch.Tensor, sample_rate: int) -> Tuple[bool, str]:
        """
        Enroll a new speaker with their voice sample.

        Args:
            name: Speaker's name
            audio: Audio tensor (channels, samples)
            sample_rate: Audio sample rate

        Returns:
            Tuple of (success, message)
        """
        if not name or not name.strip():
            return False, "Name cannot be empty"

        name = name.strip()

        # Check if speaker already exists
        if self.storage.get_speaker(name) is not None:
            return False, f"Speaker '{name}' already enrolled"

        # Check audio duration
        if audio.ndim == 2:
            duration = audio.shape[1] / sample_rate
        else:
            duration = len(audio) / sample_rate

        if duration < 2.0:
            return False, "Audio too short. Need at least 2 seconds."

        try:
            embedding = self.extract_embedding(audio, sample_rate)

            # Debug: check embedding quality
            embedding_norm = np.linalg.norm(embedding)
            print(f"[Enrollment] Speaker: {name}, embedding norm: {embedding_norm:.3f}, shape: {embedding.shape}")

            # Normalize the embedding
            if embedding_norm > 0:
                embedding = embedding / embedding_norm

            success = self.storage.add_speaker(name, embedding)

            if success:
                return True, f"Successfully enrolled '{name}'"
            else:
                return False, f"Failed to save speaker '{name}'"

        except Exception as e:
            import traceback
            traceback.print_exc()
            return False, f"Enrollment failed: {str(e)}"

    def re_enroll(self, name: str, audio: torch.Tensor, sample_rate: int) -> Tuple[bool, str]:
        """
        Re-enroll an existing speaker with new voice sample.

        Args:
            name: Speaker's name
            audio: Audio tensor (channels, samples)
            sample_rate: Audio sample rate

        Returns:
            Tuple of (success, message)
        """
        if self.storage.get_speaker(name) is None:
            return False, f"Speaker '{name}' not found"

        try:
            embedding = self.extract_embedding(audio, sample_rate)

            # Normalize
            embedding_norm = np.linalg.norm(embedding)
            if embedding_norm > 0:
                embedding = embedding / embedding_norm

            success = self.storage.update_speaker(name, embedding)

            if success:
                return True, f"Successfully re-enrolled '{name}'"
            else:
                return False, f"Failed to update speaker '{name}'"

        except Exception as e:
            return False, f"Re-enrollment failed: {str(e)}"
