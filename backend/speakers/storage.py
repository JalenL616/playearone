import json
import os
from datetime import datetime
from typing import Dict, List, Optional
import numpy as np
import config


class SpeakerStorage:
    """Handles persistence of speaker profiles and embeddings."""

    def __init__(self, filepath: str = config.SPEAKERS_FILE):
        self.filepath = filepath
        self._ensure_file_exists()

    def _ensure_file_exists(self) -> None:
        """Create speakers file if it doesn't exist."""
        os.makedirs(os.path.dirname(self.filepath), exist_ok=True)
        if not os.path.exists(self.filepath):
            self._save_data({"speakers": []})

    def _load_data(self) -> Dict:
        """Load speakers data from file."""
        with open(self.filepath, "r") as f:
            return json.load(f)

    def _save_data(self, data: Dict) -> None:
        """Save speakers data to file."""
        with open(self.filepath, "w") as f:
            json.dump(data, f, indent=2)

    def add_speaker(self, name: str, embedding: np.ndarray) -> bool:
        """
        Add a new speaker profile.
        Returns False if speaker with same name already exists.
        """
        data = self._load_data()

        # Check for duplicate name
        for speaker in data["speakers"]:
            if speaker["name"].lower() == name.lower():
                return False

        speaker_profile = {
            "name": name,
            "enrolled_at": datetime.utcnow().isoformat() + "Z",
            "embedding": embedding.tolist()
        }

        data["speakers"].append(speaker_profile)
        self._save_data(data)
        return True

    def get_speaker(self, name: str) -> Optional[Dict]:
        """Get a speaker profile by name."""
        data = self._load_data()
        for speaker in data["speakers"]:
            if speaker["name"].lower() == name.lower():
                return {
                    "name": speaker["name"],
                    "enrolled_at": speaker["enrolled_at"],
                    "embedding": np.array(speaker["embedding"], dtype=np.float32)
                }
        return None

    def get_all_speakers(self) -> List[Dict]:
        """Get all speaker profiles with embeddings as numpy arrays."""
        data = self._load_data()
        speakers = []
        for speaker in data["speakers"]:
            speakers.append({
                "name": speaker["name"],
                "enrolled_at": speaker["enrolled_at"],
                "embedding": np.array(speaker["embedding"], dtype=np.float32)
            })
        return speakers

    def list_speaker_names(self) -> List[str]:
        """Get list of all enrolled speaker names."""
        data = self._load_data()
        return [speaker["name"] for speaker in data["speakers"]]

    def remove_speaker(self, name: str) -> bool:
        """Remove a speaker by name. Returns True if found and removed."""
        data = self._load_data()
        original_count = len(data["speakers"])
        data["speakers"] = [
            s for s in data["speakers"]
            if s["name"].lower() != name.lower()
        ]

        if len(data["speakers"]) < original_count:
            self._save_data(data)
            return True
        return False

    def update_speaker(self, name: str, new_embedding: np.ndarray) -> bool:
        """Update a speaker's embedding. Returns True if found and updated."""
        data = self._load_data()
        for speaker in data["speakers"]:
            if speaker["name"].lower() == name.lower():
                speaker["embedding"] = new_embedding.tolist()
                speaker["enrolled_at"] = datetime.utcnow().isoformat() + "Z"
                self._save_data(data)
                return True
        return False

    def clear_all(self) -> None:
        """Remove all speaker profiles."""
        self._save_data({"speakers": []})
