import json
import asyncio
import time
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
    volume: float  # 0.0 to 1.0
    speech_duration: float  # How long they've been speaking (seconds)

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
        
        # Track speech duration per speaker per connection
        self.speech_start_time: Dict[tuple, Optional[float]] = {}  # (conn_id, speaker) -> start_time
        self.last_speech_time: Dict[tuple, float] = {}  # (conn_id, speaker) -> timestamp
        
        # Dance mode state (per connection)
        self.dance_recording: Dict[int, bool] = {}
        self.dance_buffers: Dict[int, list] = {}
        self.dance_start_time: Dict[int, float] = {}
        self.dance_expected_duration = 30.0  # seconds

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

        elif msg_type == "start_dance":
            # Initialize dance recording
            conn_id = id(websocket)
            self.dance_recording[conn_id] = True
            self.dance_buffers[conn_id] = []
            self.dance_start_time[conn_id] = time.time()
            
            await self._send_message(websocket, {
                "type": "dance_recording_started",
                "duration": self.dance_expected_duration
            })
            
            # Schedule dance processing after 30s
            loop = asyncio.get_event_loop()
            loop.call_later(
                self.dance_expected_duration,
                lambda: asyncio.create_task(self._process_dance(websocket, conn_id))
            )
        
        elif msg_type == "cancel_dance":
            # Allow user to cancel early
            conn_id = id(websocket)
            self._cleanup_dance_state(conn_id)
            await self._send_message(websocket, {"type": "dance_cancelled"})

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
        
        # If dance recording active, save chunks
        if self.dance_recording.get(conn_id, False):
            # Convert bytes to numpy array
            audio_array = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
            self.dance_buffers[conn_id].append(audio_array)
            
            # Send progress update every 5 seconds
            elapsed = time.time() - self.dance_start_time[conn_id]
            if int(elapsed) % 5 == 0 and elapsed > 0 and int(elapsed * 10) % 10 == 0:  # Once per 5s
                await self._send_message(websocket, {
                    "type": "dance_recording_progress",
                    "elapsed": elapsed,
                    "remaining": self.dance_expected_duration - elapsed
                })

        # Process live audio when we have enough
        buffer = self.buffers.get(conn_id)
        if buffer and buffer.duration_seconds() >= 1.5:
            await self._process_audio_chunk(websocket, buffer)

    async def _process_audio_chunk(self, websocket: WebSocket, buffer: AudioBuffer) -> None:
        """Process accumulated audio for command detection."""
        # Get audio from buffer (1.5 second chunks for better speaker ID)
        audio = buffer.consume(1.5)
        if audio is None:
            return

        # Run processing in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        conn_id = id(websocket)
        result = await loop.run_in_executor(
            None,
            self._process_audio_sync,
            audio,
            conn_id
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

    def _calculate_volume(self, audio: np.ndarray) -> float:
        """Calculate normalized volume level (0.0 to 1.0) using RMS."""
        rms = np.sqrt(np.mean(audio ** 2))
        
        # Adjusted thresholds for easier reach of high volumes
        # Soft speech: 0.005-0.02, Normal: 0.02-0.06, Loud: 0.06+
        min_threshold = 0.005  # Below this is silence
        low_threshold = 0.02   # Soft speech
        mid_threshold = 0.06   # Normal speech
        high_threshold = 0.10  # Loud speech (reduced from 0.15)
        
        print(f"[Volume] RMS: {rms:.4f}", end="")
        
        if rms < min_threshold:
            volume = 0.0
        elif rms < low_threshold:
            # 0.005-0.02 -> 0.0-0.33
            volume = (rms - min_threshold) / (low_threshold - min_threshold) * 0.33
        elif rms < mid_threshold:
            # 0.02-0.06 -> 0.33-0.66
            volume = 0.33 + (rms - low_threshold) / (mid_threshold - low_threshold) * 0.33
        elif rms < high_threshold:
            # 0.06-0.10 -> 0.66-1.0
            volume = 0.66 + (rms - mid_threshold) / (high_threshold - mid_threshold) * 0.34
        else:
            volume = 1.0
        
        print(f" -> volume: {volume:.2f}")
        return float(min(1.0, max(0.0, volume)))

    def _get_speech_duration(self, conn_id: int, speaker: str, is_speaking: bool) -> float:
        """Calculate how long a speaker has been continuously speaking."""
        import time
        current_time = time.time()
        key = (conn_id, speaker)
        
        if is_speaking:
            if key not in self.speech_start_time or self.speech_start_time[key] is None:
                # Start new speech session
                self.speech_start_time[key] = current_time
                self.last_speech_time[key] = current_time
                duration = 0.1
                print(f" [Duration] NEW session, duration: {duration:.2f}s")
                return duration
            else:
                # Continue existing session
                self.last_speech_time[key] = current_time
                duration = current_time - self.speech_start_time[key]
                # Cap at 1.5 seconds for tighter range
                capped = min(duration, 1.5)
                print(f" [Duration] CONTINUE session, duration: {capped:.2f}s (raw: {duration:.2f}s)")
                return capped
        else:
            # Not speaking - reset IMMEDIATELY, no grace period
            if key in self.speech_start_time and self.speech_start_time[key] is not None:
                print(f" [Duration] RESET session (not speaking)")
                self.speech_start_time[key] = None
            return 0.0

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
        # Get active players from config
        allowed_speakers = list(config.PLAYER_ASSIGNMENTS.keys()) if config.PLAYER_ASSIGNMENTS else None
        return self.identifier.identify(audio_tensor, sample_rate, allowed_speakers=allowed_speakers)

    def _parse_command(self, audio: np.ndarray, sample_rate: int):
        """Run command parsing (for parallel execution)."""
        return self.command_parser.parse(audio, sample_rate)

    def _process_audio_sync(self, audio: np.ndarray, conn_id: int) -> Optional[CommandResult]:
        """Synchronous audio processing with parallel speaker ID and transcription."""
        try:
            # Calculate volume first
            volume = self._calculate_volume(audio)
            # Consider any non-silent audio as speaking
            is_speaking = volume > 0.0
            
            # Skip very silent audio
            if self._is_audio_silent(audio):
                return None

            start_time = time.perf_counter()

            # Prepare audio for Pyannote
            audio_tensor, sample_rate = self.audio_processor.prepare_for_pyannote(audio)

            # Run speaker ID and command parsing in parallel
            speaker_future = self.executor.submit(
                self._identify_speaker, audio_tensor, sample_rate
            )
            command_future = self.executor.submit(
                self._parse_command, audio, sample_rate
            )

            # Wait for both results and measure timing
            speaker_match = speaker_future.result()
            speaker_time = time.perf_counter() - start_time

            parsed = command_future.result()
            total_time = time.perf_counter() - start_time

            # Log timing
            print(f"[Timing] Speaker ID: {speaker_time*1000:.0f}ms | "
                  f"Total (parallel): {total_time*1000:.0f}ms | "
                  f"Text: '{parsed.raw_text}'")

            # Calculate speech duration for this speaker
            speech_duration = self._get_speech_duration(conn_id, speaker_match.name, is_speaking)

            # Filter only silence hallucinations
            if self._is_silence_hallucination(parsed.raw_text):
                return None

            # Return result for any detected speech (with or without command)
            if parsed.raw_text:
                return CommandResult(
                    timestamp=datetime.utcnow().isoformat() + "Z",
                    speaker=speaker_match.name,
                    speaker_confidence=float(speaker_match.confidence),
                    command=parsed.command,
                    raw_text=parsed.raw_text,
                    command_confidence=float(parsed.confidence),
                    volume=volume,
                    speech_duration=float(speech_duration)
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
    
    async def _process_dance(self, websocket: WebSocket, conn_id: int) -> None:
        """Process accumulated audio and generate dance plan."""
        try:
            if not self.dance_buffers.get(conn_id):
                return
            
            # Send status update
            await self._send_message(websocket, {
                "type": "dance_status",
                "message": "Transcribing your dance..."
            })
            
            # Concatenate all audio chunks
            full_audio = np.concatenate(self.dance_buffers[conn_id])
            
            # Transcribe using existing Vosk/Deepgram
            print(f"[Dance] Transcribing {len(full_audio)/config.SAMPLE_RATE:.1f}s of audio")
            transcript_start = time.time()
            transcript = self.command_parser._transcribe(full_audio, config.SAMPLE_RATE)
            transcript_time = time.time() - transcript_start
            print(f"[Dance] Transcription complete: {transcript_time:.1f}s → '{transcript[:100]}...'")
            
            if not transcript or len(transcript.strip()) < 10:
                await self._send_message(websocket, {
                    "type": "dance_error",
                    "message": "Could not understand the description. Please try again with clearer speech."
                })
                self._cleanup_dance_state(conn_id)
                return
            
            # Generate dance plan with LLM
            await self._send_message(websocket, {
                "type": "dance_status",
                "message": "Choreographing your moves..."
            })
            
            dance_plan = await self._generate_dance_plan(transcript)
            
            # Send dance plan to frontend
            await self._send_message(websocket, {
                "type": "dance_plan",
                "plan": dance_plan,
                "transcript": transcript
            })
            
            print(f"[Dance] Plan sent: {len(dance_plan['keyframes'])} keyframes over {dance_plan['duration']}s")
            
        except Exception as e:
            print(f"[Dance] Error processing: {e}")
            import traceback
            traceback.print_exc()
            await self._send_message(websocket, {
                "type": "dance_error",
                "message": f"Processing error: {str(e)}"
            })
        finally:
            self._cleanup_dance_state(conn_id)
    
    async def _generate_dance_plan(self, transcript: str) -> Dict[str, Any]:
        """Use LLM to convert transcript to structured dance plan."""
        
        prompt = f"""You are a creative dance choreographer. Convert the user's description into a structured dance sequence for a stick figure character.

Available poses (angles in degrees):
- IDLE: Standing neutral
- ARMS_UP: Both arms raised overhead (90°)
- ARMS_WAVE_LEFT: Left arm up (90°), right arm down (0°)
- ARMS_WAVE_RIGHT: Right arm up (90°), left arm down (0°)
- SPIN_LEFT: Body rotates left (-45°)
- SPIN_RIGHT: Body rotates right (45°)
- KICK_LEFT: Left leg extended (90°)
- KICK_RIGHT: Right leg extended (90°)
- JUMP: Both legs bent, body elevated
- BOW: Body bent forward (-45°)

User description: "{transcript}"

Create a 12-second dance sequence with 8-15 keyframes. Be creative and match the user's description closely.

Return ONLY valid JSON (no markdown, no explanation):
{{
  "duration": 12.0,
  "keyframes": [
    {{"time": 0.0, "pose": "IDLE"}},
    {{"time": 2.0, "pose": "ARMS_UP"}},
    {{"time": 4.0, "pose": "SPIN_LEFT"}},
    ...
  ]
}}"""

        try:
            response = self.command_parser.client.chat.completions.create(
                model=self.command_parser.model,
                messages=[
                    {"role": "system", "content": "You are a dance choreographer. Output only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=500,
                temperature=0.8,  # More creative
                response_format={"type": "json_object"}
            )
            
            result = json.loads(response.choices[0].message.content)
            
            # Validate structure
            if "duration" not in result or "keyframes" not in result:
                raise ValueError("Invalid JSON structure")
            
            if len(result["keyframes"]) < 3:
                raise ValueError("Too few keyframes")
            
            return result
            
        except Exception as e:
            print(f"[Dance] LLM generation failed: {e}")
            # Fallback: simple dance
            return {
                "duration": 12.0,
                "keyframes": [
                    {"time": 0.0, "pose": "IDLE"},
                    {"time": 2.0, "pose": "ARMS_UP"},
                    {"time": 4.0, "pose": "ARMS_WAVE_LEFT"},
                    {"time": 6.0, "pose": "ARMS_WAVE_RIGHT"},
                    {"time": 8.0, "pose": "SPIN_LEFT"},
                    {"time": 10.0, "pose": "BOW"},
                    {"time": 12.0, "pose": "IDLE"}
                ]
            }
    
    def _cleanup_dance_state(self, conn_id: int) -> None:
        """Clean up dance recording state."""
        self.dance_recording.pop(conn_id, None)
        self.dance_buffers.pop(conn_id, None)
        self.dance_start_time.pop(conn_id, None)
