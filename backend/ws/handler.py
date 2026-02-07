import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Dict, Any, Optional
from dataclasses import dataclass, asdict
from fastapi import WebSocket, WebSocketDisconnect
import numpy as np
import torch

from audio import AudioBuffer, AudioProcessor
from speakers import SpeakerEnrollment, SpeakerIdentifier, SpeakerStorage
from commands import CommandParser
import config


@dataclass
class CommandResult:
    """Result sent back to client."""
    timestamp: str
    speaker: str
    speaker_confidence: float
    command: Optional[str]
    raw_text: Optional[str]
    command_confidence: float

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)


class WebSocketHandler:
    """Handles WebSocket connections for audio streaming."""

    def __init__(self):
        self.storage = SpeakerStorage()
        self.enrollment = SpeakerEnrollment(self.storage)
        self.identifier = SpeakerIdentifier(self.storage)
        self.command_parser = CommandParser()
        self.audio_processor = AudioProcessor()

        # Thread pool for parallel processing
        self.executor = ThreadPoolExecutor(max_workers=2)

        # Per-connection state
        self.buffers: Dict[int, AudioBuffer] = {}
        self.enrollment_buffers: Dict[int, AudioBuffer] = {}

    async def handle_connection(self, websocket: WebSocket) -> None:
        """Main handler for a WebSocket connection."""
        await websocket.accept()
        conn_id = id(websocket)
        self.buffers[conn_id] = AudioBuffer()
        self.enrollment_buffers[conn_id] = AudioBuffer()

        try:
            while True:
                message = await websocket.receive()

                if "bytes" in message:
                    # Binary audio data
                    await self._handle_audio(websocket, message["bytes"])

                elif "text" in message:
                    # JSON control message
                    await self._handle_control(websocket, json.loads(message["text"]))

        except (WebSocketDisconnect, RuntimeError):
            pass
        finally:
            # Cleanup
            self.buffers.pop(conn_id, None)
            self.enrollment_buffers.pop(conn_id, None)

    async def _handle_control(self, websocket: WebSocket, message: Dict[str, Any]) -> None:
        """Handle control messages from client."""
        msg_type = message.get("type")

        if msg_type == "start_enrollment":
            name = message.get("name", "").strip()
            if not name:
                await self._send_error(websocket, "Name is required for enrollment")
                return

            conn_id = id(websocket)
            self.enrollment_buffers[conn_id] = AudioBuffer()

            await self._send_message(websocket, {
                "type": "enrollment_started",
                "name": name,
                "duration_seconds": config.ENROLLMENT_DURATION_SECONDS
            })

        elif msg_type == "complete_enrollment":
            name = message.get("name", "").strip()
            await self._complete_enrollment(websocket, name)

        elif msg_type == "cancel_enrollment":
            conn_id = id(websocket)
            self.enrollment_buffers[conn_id] = AudioBuffer()
            await self._send_message(websocket, {"type": "enrollment_cancelled"})

        elif msg_type == "list_speakers":
            speakers = self.storage.list_speaker_names()
            await self._send_message(websocket, {
                "type": "speakers_list",
                "speakers": speakers
            })

        elif msg_type == "remove_speaker":
            name = message.get("name", "")
            success = self.storage.remove_speaker(name)
            await self._send_message(websocket, {
                "type": "speaker_removed",
                "name": name,
                "success": success
            })

        elif msg_type == "start_listening":
            conn_id = id(websocket)
            self.buffers[conn_id] = AudioBuffer()
            await self._send_message(websocket, {"type": "listening_started"})

        elif msg_type == "stop_listening":
            conn_id = id(websocket)
            self.buffers[conn_id] = AudioBuffer()
            await self._send_message(websocket, {"type": "listening_stopped"})

        elif msg_type == "ping":
            await self._send_message(websocket, {"type": "pong"})

    async def _handle_audio(self, websocket: WebSocket, audio_bytes: bytes) -> None:
        """Handle incoming audio data."""
        conn_id = id(websocket)

        # Add to both buffers (enrollment and live)
        if conn_id in self.buffers:
            self.buffers[conn_id].add_chunk(audio_bytes)

        if conn_id in self.enrollment_buffers:
            self.enrollment_buffers[conn_id].add_chunk(audio_bytes)

        # Process live audio when we have enough
        buffer = self.buffers.get(conn_id)
        if buffer and buffer.duration_seconds() >= 1.0:
            await self._process_audio_chunk(websocket, buffer)

    async def _process_audio_chunk(self, websocket: WebSocket, buffer: AudioBuffer) -> None:
        """Process accumulated audio for command detection."""
        # Get audio from buffer (1 second chunks)
        audio = buffer.consume(1.0)
        if audio is None:
            return

        # Run processing in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            self._process_audio_sync,
            audio
        )

        if result:
            player = config.PLAYER_ASSIGNMENTS.get(result.speaker, None)
            await self._send_message(websocket, {
                "type": "command",
                "player": player,
                **result.to_dict()
            })

    # Common Whisper hallucinations on silence (filter these only)
    SILENCE_HALLUCINATIONS = [
        "thank you", "thanks for watching", "subscribe",
        "like and subscribe", "thanks for listening",
        "please subscribe", "thank you for watching"
    ]

    def _is_audio_silent(self, audio: np.ndarray, threshold: float = 0.01) -> bool:
        """Check if audio is mostly silent based on RMS energy."""
        rms = np.sqrt(np.mean(audio ** 2))
        return rms < threshold

    def _is_silence_hallucination(self, text: str) -> bool:
        """Check if transcription is a known Whisper silence hallucination."""
        if not text:
            return True
        text_lower = text.lower().strip().rstrip(".")
        for phrase in self.SILENCE_HALLUCINATIONS:
            if text_lower == phrase:
                return True
        return False

    def _identify_speaker(self, audio_tensor: torch.Tensor, sample_rate: int):
        """Run speaker identification (for parallel execution)."""
        return self.identifier.identify(audio_tensor, sample_rate)

    def _parse_command(self, audio: np.ndarray, sample_rate: int):
        """Run command parsing (for parallel execution)."""
        return self.command_parser.parse(audio, sample_rate)

    def _process_audio_sync(self, audio: np.ndarray) -> Optional[CommandResult]:
        """Synchronous audio processing with parallel speaker ID and transcription."""
        try:
            # Skip very silent audio
            if self._is_audio_silent(audio):
                return None

            # Prepare audio for Pyannote
            audio_tensor, sample_rate = self.audio_processor.prepare_for_pyannote(audio)

            # Run speaker ID and command parsing in parallel
            speaker_future = self.executor.submit(
                self._identify_speaker, audio_tensor, sample_rate
            )
            command_future = self.executor.submit(
                self._parse_command, audio, sample_rate
            )

            # Wait for both results
            speaker_match = speaker_future.result()
            parsed = command_future.result()

            # Filter only silence hallucinations
            if self._is_silence_hallucination(parsed.raw_text):
                return None

            # Return result for any detected speech (with or without command)
            if parsed.raw_text:
                return CommandResult(
                    timestamp=datetime.utcnow().isoformat() + "Z",
                    speaker=speaker_match.name,
                    speaker_confidence=speaker_match.confidence,
                    command=parsed.command,
                    raw_text=parsed.raw_text,
                    command_confidence=parsed.confidence
                )

            return None

        except Exception as e:
            print(f"Processing error: {e}")
            return None

    async def _complete_enrollment(self, websocket: WebSocket, name: str) -> None:
        """Complete speaker enrollment with collected audio."""
        conn_id = id(websocket)
        buffer = self.enrollment_buffers.get(conn_id)

        if not buffer:
            await self._send_error(websocket, "No enrollment in progress")
            return

        if buffer.duration_seconds() < 2.0:
            await self._send_error(websocket, "Not enough audio collected")
            return

        # Get all collected audio
        audio = buffer.get_audio(buffer.duration_seconds())
        if audio is None:
            await self._send_error(websocket, "Failed to get audio")
            return

        try:
            # Prepare for Pyannote
            audio_tensor, sample_rate = self.audio_processor.prepare_for_pyannote(audio)

            # Run enrollment in thread pool
            loop = asyncio.get_event_loop()
            success, message = await loop.run_in_executor(
                None,
                self.enrollment.enroll,
                name,
                audio_tensor,
                sample_rate
            )
        except Exception as e:
            print(f"Enrollment error: {e}")
            import traceback
            traceback.print_exc()
            await self._send_error(websocket, f"Enrollment failed: {e}")
            self.enrollment_buffers[conn_id] = AudioBuffer()
            return

        # Clear enrollment buffer
        self.enrollment_buffers[conn_id] = AudioBuffer()

        await self._send_message(websocket, {
            "type": "enrollment_complete",
            "success": success,
            "message": message,
            "name": name if success else None
        })

    async def _send_message(self, websocket: WebSocket, message: Dict[str, Any]) -> None:
        """Send JSON message to client."""
        await websocket.send_text(json.dumps(message))

    async def _send_error(self, websocket: WebSocket, error: str) -> None:
        """Send error message to client."""
        await self._send_message(websocket, {
            "type": "error",
            "message": error
        })
