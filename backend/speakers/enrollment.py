import numpy as np
import torch
from typing import Optional, Tuple
from pyannote.audio import Model, Inference
import config
from .storage import SpeakerStorage


class SpeakerEnrollment:
    """Handles voice enrollment for new speakers."""

    def __init__(self, storage: Optional[SpeakerStorage] = None):
        self.storage = storage or SpeakerStorage()
        self._model = None
        self._inference = None

    def _load_model(self) -> None:
        """Lazy load the Pyannote embedding model."""
        if self._model is None:
            # Use the speaker embedding model
            self._model = Model.from_pretrained(
                "pyannote/wespeaker-voxceleb-resnet34-LM",
                use_auth_token=config.HF_TOKEN
            )
            self._inference = Inference(self._model, window="whole")

    def extract_embedding(self, audio: torch.Tensor, sample_rate: int) -> np.ndarray:
        """
        Extract speaker embedding from audio.

        Args:
            audio: Torch tensor of shape (channels, samples)
            sample_rate: Audio sample rate

        Returns:
            Speaker embedding as numpy array
        """
        self._load_model()

        # Pyannote inference expects a dict with waveform and sample_rate
        audio_dict = {
            "waveform": audio,
            "sample_rate": sample_rate
        }

        embedding = self._inference(audio_dict)
        return np.array(embedding)

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
        duration = audio.shape[1] / sample_rate
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
            success = self.storage.update_speaker(name, embedding)

            if success:
                return True, f"Successfully re-enrolled '{name}'"
            else:
                return False, f"Failed to update speaker '{name}'"

        except Exception as e:
            return False, f"Re-enrollment failed: {str(e)}"
