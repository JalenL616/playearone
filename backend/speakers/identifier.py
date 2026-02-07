import numpy as np
import torch
from typing import Optional, Tuple, List
from dataclasses import dataclass
import config
from .enrollment import SpeakerEnrollment
from .storage import SpeakerStorage


@dataclass
class SpeakerMatch:
    """Result of speaker identification."""
    name: str
    confidence: float
    is_known: bool


class SpeakerIdentifier:
    """Identifies speakers by comparing embeddings against enrolled profiles."""

    def __init__(
        self,
        storage: Optional[SpeakerStorage] = None,
        threshold: float = config.SPEAKER_SIMILARITY_THRESHOLD
    ):
        self.storage = storage or SpeakerStorage()
        self.threshold = threshold
        self._enrollment = SpeakerEnrollment(self.storage)

    def _cosine_similarity(self, a: np.ndarray, b: np.ndarray) -> float:
        """Compute cosine similarity between two vectors."""
        norm_a = np.linalg.norm(a)
        norm_b = np.linalg.norm(b)

        if norm_a == 0 or norm_b == 0:
            return 0.0

        return float(np.dot(a, b) / (norm_a * norm_b))

    def identify(self, audio: torch.Tensor, sample_rate: int, allowed_speakers: Optional[List[str]] = None) -> SpeakerMatch:
        """
        Identify a speaker from audio.

        Args:
            audio: Audio tensor (channels, samples)
            sample_rate: Audio sample rate
            allowed_speakers: Optional list of speaker names to restrict identification to

        Returns:
            SpeakerMatch with name, confidence, and whether speaker is known
        """
        # Extract embedding from input audio
        try:
            input_embedding = self._enrollment.extract_embedding(audio, sample_rate)
            # Normalize the embedding
            embedding_norm = np.linalg.norm(input_embedding)
            if embedding_norm > 0:
                input_embedding = input_embedding / embedding_norm
            print(f"[Speaker ID] Input embedding norm after normalization: {np.linalg.norm(input_embedding):.3f}")
        except Exception as e:
            return SpeakerMatch(
                name="Unknown",
                confidence=0.0,
                is_known=False
            )

        # Get all enrolled speakers
        speakers = self.storage.get_all_speakers()

        if not speakers:
            return SpeakerMatch(
                name="Unknown",
                confidence=0.0,
                is_known=False
            )

        # Filter to allowed speakers if specified
        if allowed_speakers:
            speakers = [s for s in speakers if s["name"] in allowed_speakers]
            if not speakers:
                return SpeakerMatch(
                    name="Unknown",
                    confidence=0.0,
                    is_known=False
                )

        # Find best match
        best_match: Optional[str] = None
        best_similarity: float = -1.0

        for speaker in speakers:
            # Ensure stored embedding is normalized
            stored_embedding = np.array(speaker["embedding"])
            stored_norm = np.linalg.norm(stored_embedding)
            if stored_norm > 0:
                stored_embedding = stored_embedding / stored_norm
            
            similarity = self._cosine_similarity(
                input_embedding,
                stored_embedding
            )

            if similarity > best_similarity:
                best_similarity = similarity
                best_match = speaker["name"]

        # Debug logging
        print(f"[Speaker ID] Best match: {best_match}, similarity: {best_similarity:.3f}, allowed: {allowed_speakers}")

        # Use lower threshold when restricted to game players
        threshold = config.SPEAKER_GAME_THRESHOLD if allowed_speakers else self.threshold

        # Check if above threshold
        if best_similarity >= threshold and best_match:
            return SpeakerMatch(
                name=best_match,
                confidence=best_similarity,
                is_known=True
            )
        else:
            return SpeakerMatch(
                name="Unknown",
                confidence=best_similarity if best_similarity > 0 else 0.0,
                is_known=False
            )

    def identify_with_alternatives(
        self,
        audio: torch.Tensor,
        sample_rate: int,
        top_k: int = 3
    ) -> List[SpeakerMatch]:
        """
        Identify speaker with top-k alternatives.

        Returns list of potential matches sorted by confidence.
        """
        try:
            input_embedding = self._enrollment.extract_embedding(audio, sample_rate)
        except Exception:
            return [SpeakerMatch(name="Unknown", confidence=0.0, is_known=False)]

        speakers = self.storage.get_all_speakers()

        if not speakers:
            return [SpeakerMatch(name="Unknown", confidence=0.0, is_known=False)]

        # Calculate similarities for all speakers
        matches = []
        for speaker in speakers:
            similarity = self._cosine_similarity(
                input_embedding,
                speaker["embedding"]
            )
            matches.append(SpeakerMatch(
                name=speaker["name"],
                confidence=similarity,
                is_known=similarity >= self.threshold
            ))

        # Sort by confidence and return top-k
        matches.sort(key=lambda x: x.confidence, reverse=True)
        return matches[:top_k]
