import json
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Dict, Any, Optional, List
from dataclasses import dataclass, asdict
from fastapi import WebSocket, WebSocketDisconnect
import numpy as np
import torch

from audio import AudioBuffer, AudioProcessor
from speakers import SpeakerEnrollment, SpeakerIdentifier, SpeakerStorage
from commands import CommandParser
import config
from narrator import Narrator

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
        d = asdict(self)
        # Convert numpy floats to Python floats for JSON serialization
        for key, value in d.items():
            if isinstance(value, (np.floating, np.integer)):
                d[key] = float(value)
        return d


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
        
        # Per-connection mode: "game" or "frontend" (default)
        self.connection_modes: Dict[int, str] = {}
        self.narrators: Dict[int, Narrator] = {}
        self.game_types: Dict[int, str] = {}

        # Track speech duration per speaker per connection
        self.speech_start_time: Dict[tuple, Optional[float]] = {}
        self.last_speech_time: Dict[tuple, float] = {}
        
        # Dance mode state (per connection)
        self.dance_recording: Dict[int, bool] = {}
        self.dance_buffers: Dict[int, list] = {}
        self.dance_start_time: Dict[int, float] = {}
        self.dance_cooldown: Dict[int, float] = {}  # Ignore audio processing briefly after dance
        self.dance_expected_duration = 30.0  # seconds

    async def handle_connection(self, websocket: WebSocket) -> None:
        """Main handler for a WebSocket connection."""
        await websocket.accept()
        conn_id = id(websocket)
        self.buffers[conn_id] = AudioBuffer()
        self.enrollment_buffers[conn_id] = AudioBuffer()
        
        # Create default narrator (will be replaced if client specifies game type)
        self.narrators[conn_id] = Narrator(game_type="pong")
        self.game_types[conn_id] = "pong"

        try:
            while True:
                message = await websocket.receive()

                # Check for disconnect message
                if message.get("type") == "websocket.disconnect":
                    break

                if "bytes" in message:
                    await self._handle_audio(websocket, message["bytes"])

                elif "text" in message:
                    await self._handle_control(websocket, json.loads(message["text"]))

        except (WebSocketDisconnect, RuntimeError) as e:
            print(f"[WebSocket] Connection {conn_id} closed: {e}")
        except Exception as e:
            print(f"[WebSocket] Unexpected error for {conn_id}: {e}")
            import traceback
            traceback.print_exc()
        finally:
            # Cleanup
            self.buffers.pop(conn_id, None)
            self.enrollment_buffers.pop(conn_id, None)
            self.connection_modes.pop(conn_id, None)
            self.narrators.pop(conn_id, None)
            self.game_types.pop(conn_id, None)
            print(f"[WebSocket] Cleaned up connection {conn_id}")

    async def _handle_control(self, websocket: WebSocket, message: Dict[str, Any]) -> None:
        """Handle control messages from client."""
        msg_type = message.get("type")
        conn_id = id(websocket)

        if msg_type == "start_listening":
            # Get game type from message and update narrator if specified
            game_type = message.get("game")
            if game_type and game_type != self.game_types.get(conn_id):
                print(f"[WebSocket] Connection {conn_id} switching to {game_type}")
                self.game_types[conn_id] = game_type
                self.narrators[conn_id] = Narrator(game_type=game_type)
            
            self.buffers[conn_id] = AudioBuffer()
            await self._send_message(websocket, {"type": "listening_started"})

        elif msg_type == "start_enrollment":
            name = message.get("name", "").strip()
            if not name:
                await self._send_error(websocket, "Name is required for enrollment")
                return

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

        elif msg_type == "stop_listening":
            self.buffers[conn_id] = AudioBuffer()
            await self._send_message(websocket, {"type": "listening_stopped"})

        elif msg_type == "start_dance":
            # Initialize dance recording
            conn_id = id(websocket)
            
            # Clear cooldown and buffers to start fresh
            self.dance_cooldown.pop(conn_id, None)
            if conn_id in self.buffers:
                self.buffers[conn_id] = AudioBuffer()
            
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
        
        elif msg_type == "finish_dance":
            # Process dance immediately (user clicked "Done")
            conn_id = id(websocket)
            if self.dance_recording.get(conn_id, False):
                elapsed = time.time() - self.dance_start_time.get(conn_id, 0)
                print(f"[Dance] User finished early at {elapsed:.1f}s")
                
                # Minimum 3 seconds required
                if elapsed < 3.0:
                    await self._send_message(websocket, {
                        "type": "dance_error",
                        "message": "Please record at least 3 seconds of description."
                    })
                    self._cleanup_dance_state(conn_id)
                else:
                    # Process immediately
                    await self._process_dance(websocket, conn_id)

        elif msg_type == "set_mode":
            conn_id = id(websocket)
            mode = message.get("mode", "frontend")
            self.connection_modes[conn_id] = mode
            print(f"[Mode] Connection {conn_id} set to '{mode}'")

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
        if buffer and buffer.duration_seconds() >= 0.5:
            # Check if we're in cooldown period after dance generation
            cooldown_until = self.dance_cooldown.get(conn_id, 0)
            if time.time() < cooldown_until:
                # Clear buffer but don't process to avoid spurious errors/commands
                buffer.consume(1.5)
                return
            
            # Don't process if actively recording dance
            if self.dance_recording.get(conn_id, False):
                buffer.consume(1.5)
                return
                
            await self._process_audio_chunk(websocket, buffer)

    async def _process_audio_chunk(self, websocket: WebSocket, buffer: AudioBuffer) -> None:
        """Process accumulated audio for command detection."""
        # Get audio from buffer
        audio = buffer.consume(0.5)
        if audio is None:
            return

        # Run processing in thread pool to avoid blocking
        loop = asyncio.get_event_loop()
        conn_id = id(websocket)
        results = await loop.run_in_executor(
            None,
            self._process_audio_sync,
            audio,
            conn_id
        )

        # Send all detected commands
        for result in results:
            player = config.PLAYER_ASSIGNMENTS.get(result.speaker, None)
            await self._send_message(websocket, {
                "type": "command",
                "player": player,
                **result.to_dict()
            })

            if result.command:
                asyncio.create_task(self._trigger_narration(websocket, result.speaker, result.command))

    # Common Whisper hallucinations on silence (filter these only)
    SILENCE_HALLUCINATIONS = [
        "thank you", "thanks for watching", "subscribe",
        "like and subscribe", "thanks for listening",
        "please subscribe", "thank you for watching"
    ]

    async def _trigger_narration(self, websocket: WebSocket, speaker: str, command: str):
        """Generates AI audio and sends it to the frontend."""
        conn_id = id(websocket)
        narrator = self.narrators.get(conn_id)
        
        if not narrator:
            print(f"[Narrator] No narrator for connection {conn_id}")
            return
        
        try:
            audio_b64 = await narrator.get_narration(speaker, command)
            if audio_b64:
                await self._send_message(websocket, {
                    "type": "narrator_audio",
                    "audio": audio_b64
                })
        except Exception as e:
            print(f"[Narrator] Error generating narration: {e}")

    # ... rest of your methods stay exactly the same (no changes needed)
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

    def _identify_speaker(self, audio_tensor: torch.Tensor, sample_rate: int, conn_id: int = None):
        """Run speaker identification (for parallel execution)."""
        # Only restrict to assigned players when in game mode
        mode = self.connection_modes.get(conn_id, "frontend") if conn_id else "frontend"
        if mode == "game" and config.PLAYER_ASSIGNMENTS:
            allowed_speakers = list(config.PLAYER_ASSIGNMENTS.keys())
        else:
            allowed_speakers = None
        return self.identifier.identify(audio_tensor, sample_rate, allowed_speakers=allowed_speakers)

    def _parse_command(self, audio: np.ndarray, sample_rate: int):
        """Run command parsing (for parallel execution). Returns list of commands."""
        return self.command_parser.parse_multiple(audio, sample_rate)

    def _process_audio_sync(self, audio: np.ndarray, conn_id: int) -> List[CommandResult]:
        """Synchronous audio processing with parallel speaker ID and transcription.
        Returns list of CommandResults (may contain multiple if multiple commands detected)."""
        try:
            # Calculate volume first
            volume = self._calculate_volume(audio)
            # Consider any non-silent audio as speaking
            is_speaking = volume > 0.0

            # Skip very silent audio
            if self._is_audio_silent(audio):
                return []

            start_time = time.perf_counter()

            # Prepare audio for speaker embedding
            audio_tensor, sample_rate = self.audio_processor.prepare_for_pyannote(audio)

            # Run speaker ID and command parsing in parallel
            speaker_future = self.executor.submit(
                self._identify_speaker, audio_tensor, sample_rate, conn_id
            )
            command_future = self.executor.submit(
                self._parse_command, audio, sample_rate
            )

            # Wait for both results and measure timing
            speaker_match = speaker_future.result()
            speaker_time = time.perf_counter() - start_time

            parsed_list = command_future.result()  # Now returns a list
            total_time = time.perf_counter() - start_time

            # Get raw_text from first result if available
            raw_text = parsed_list[0].raw_text if parsed_list else None

            # Log timing
            print(f"[Timing] Speaker ID: {speaker_time*1000:.0f}ms | "
                  f"Total (parallel): {total_time*1000:.0f}ms | "
                  f"Text: '{raw_text}'")

            # Calculate speech duration for this speaker
            speech_duration = self._get_speech_duration(conn_id, speaker_match.name, is_speaking)

            # Filter only silence hallucinations
            if self._is_silence_hallucination(raw_text):
                return []

            # Build results for all detected commands
            results = []
            for parsed in parsed_list:
                if parsed.command:  # Only include actual commands
                    results.append(CommandResult(
                        timestamp=datetime.utcnow().isoformat() + "Z",
                        speaker=speaker_match.name,
                        speaker_confidence=speaker_match.confidence,
                        command=parsed.command,
                        raw_text=parsed.raw_text,
                        command_confidence=parsed.confidence,
                        volume=volume,
                        speech_duration=speech_duration
                    ))

            return results

        except Exception as e:
            print(f"Processing error: {e}")
            return []

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
            # Prepare audio for speaker embedding
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
        """Send JSON message to client while handling NumPy types."""
        def default_converter(obj):
            import numpy as np
            if isinstance(obj, (np.float32, np.float64)):
                return float(obj)
            if isinstance(obj, (np.int32, np.int64)):
                return int(obj)
            return str(obj)

        try:
            await websocket.send_text(json.dumps(message, default=self._json_default, default=default_converter))

    @staticmethod
    def _json_default(obj):
        """Handle numpy types for JSON serialization."""
        if isinstance(obj, (np.floating,)):
            return float(obj)
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")
        except Exception as e:
            print(f"Websocket Send Error: {e}")

            
    async def _send_error(self, websocket: WebSocket, error: str) -> None:
        """Send error message to client."""
        await self._send_message(websocket, {
            "type": "error",
            "message": error
        })
    
    async def _process_dance(self, websocket: WebSocket, conn_id: int) -> None:
        """Process accumulated audio and generate dance plan."""
        try:
            # Check if dance is still active (not already processed or cancelled)
            if not self.dance_recording.get(conn_id, False):
                return
            
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
            
            if not transcript or len(transcript.strip()) < 3:
                print(f"[Dance] ✗ Transcript too short or empty")
                await self._send_message(websocket, {
                    "type": "dance_error",
                    "message": "Could not understand the description. Please try again with clearer speech."
                })
                self._cleanup_dance_state(conn_id)
                return
            
            # Generate dance plan with LLM
            print(f"[Dance] Starting AI choreography generation...")
            await self._send_message(websocket, {
                "type": "dance_status",
                "message": "AI choreographing your dance..."
            })
            
            llm_start = time.time()
            dance_plan = await self._generate_dance_plan(transcript)
            llm_time = time.time() - llm_start
            print(f"[Dance] ✓ AI generation complete in {llm_time:.2f}s")
            print(f"[Dance] Generated {len(dance_plan['keyframes'])} keyframes")
            print(f"[Dance] Dance duration: {dance_plan['duration']}s")
            
            # Send dance plan to frontend
            print(f"[Dance] Sending dance plan to client...")
            await self._send_message(websocket, {
                "type": "dance_plan",
                "plan": dance_plan,
                "transcript": transcript
            })
            
            # Set cooldown to prevent processing spurious audio during animation
            # Cooldown = dance duration + 2 second buffer for UI interaction
            cooldown_duration = dance_plan.get('duration', 10.0) + 2.0
            self.dance_cooldown[conn_id] = time.time() + cooldown_duration
            print(f"[Dance] Set audio processing cooldown for {cooldown_duration:.1f}s")
            
            total_time = time.time() - transcript_start
            print(f"[Dance] ✓ Complete pipeline: {total_time:.2f}s (transcribe: {transcript_time:.2f}s, LLM: {llm_time:.2f}s)")
            print(f"[Dance] ========== DANCE PROCESSING COMPLETE ==========\n")
            
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
        
        print(f"\n[Dance LLM] ========== GENERATING CHOREOGRAPHY ==========\n")
        prompt = f"""You are a creative dance choreographer for a 2D stick figure. The dancer is FACING THE VIEWER/CAMERA at all times. NO full-body rotation/spins - use shoulder/hip offsets instead.

PERSPECTIVE: Dancer faces viewer, so:
- Left arm/leg = viewer's RIGHT side of screen
- Right arm/leg = viewer's LEFT side of screen
- Forward lean = toward viewer (waist/body negative angles)
- Backward lean = away from viewer (waist/body positive angles)
- Hip angles: positive = leg forward toward viewer, negative = leg back away from viewer

You can use predefined poses OR specify custom joint angles for any pose.

Predefined poses (all have leg movements built-in):
- IDLE, ARMS_UP, ARMS_WAVE_LEFT, ARMS_WAVE_RIGHT, SPIN_LEFT, SPIN_RIGHT, KICK_LEFT, KICK_RIGHT, JUMP, BOW, FLOSS_LEFT, FLOSS_RIGHT, DAB, TUBE_WAVE, HIGH_KNEE_LEFT, HIGH_KNEE_RIGHT

Custom angles (REQUIRED constraints in degrees):
- waist: -45 to 45 (torso tilt, limited for stability)
- body: -60 to 60 (upper body lean)
- lShoulder/rShoulder: -150 to 150 (arm angle)
- lElbow/rElbow: -150 to 150 (forearm angle)
- lHip/rHip: -60 to 120 (leg angle, no back-kicks)
- lKnee/rKnee: -150 to 0 (knee bend only)
- jumpOffset: -80 to 0 (vertical displacement)
- torsoScaleY: 0.85 to 1.15 (squash/stretch for impact, optional)
- footTargetY: -10 to 0 (IK grounding hint, optional)

DEFAULT STANDING POSITION (baseline for all movements):
- Arms: DOWN and OUT to sides so they're visible (lShoulder: 20-30°, rShoulder: -20 to -30°, elbows slightly bent -10 to -20°)
- Legs: STRAIGHT upside-down V from hips (lHip: 10-15°, rHip: -10 to -15°, knees straight 0° to -5° for natural look)
- Hip to foot should be STRAIGHT LINES - minimal knee bend in default stance
- NEVER use 0° for arms/hips - always offset from center for visible, natural standing pose
- All movements start from and return to this visible, spread-leg V-stance

Easing per keyframe (choose appropriate):
- "cubic" (default): Smooth, natural
- "linear": Sharp, robotic
- "bounce": Impact, landing feel

CRITICAL FULL-BODY MOVEMENT RULES:
1. EVERY custom pose MUST include ALL limb angles: lShoulder, rShoulder, lElbow, rElbow, lHip, rHip, lKnee, rKnee
2. START from default standing position (arms out 20-30°, legs in upside-down V with hips 10-15°, knees STRAIGHT 0° to -5°)
3. BOTH arms MUST move - never leave one arm static at 0° while other moves
4. BOTH legs MUST move - never leave hips at 0°, always spread in V-shape for standing
5. Arms and legs MUST change between keyframes - no static limbs
6. When one arm reaches, other arm balances (opposite angles or support position)
7. When arms move, legs compensate with weight shifts (bend knees for action, but default stance has straight legs)
8. Example GOOD standing pose (V-stance, straight legs): {{"lShoulder": 25, "rShoulder": -25, "lElbow": -15, "rElbow": -15, "lHip": 12, "lKnee": 0, "rHip": -12, "rKnee": 0}}
9. Example GOOD action pose (bent knees for movement): {{"lShoulder": 90, "rShoulder": -30, "lElbow": -45, "rElbow": 20, "lHip": 15, "lKnee": -20, "rHip": 25, "rKnee": -30}}
10. Example BAD pose (limbs at 0°): {{"lShoulder": 90, "rShoulder": 0, "lHip": 0, "rHip": 0}} ❌ INVALID - arms/legs not visible!
11. Example BAD pose (missing angles): {{"lShoulder": 90, "rShoulder": -30}} ❌ INVALID - WHERE ARE ELBOWS AND LEGS?

Famous Dance Mimicry (NO rotation parameter - use limb offsets):
When a well-known dance is mentioned, reproduce its signature moves precisely WITH FULL BODY COORDINATION (all 8 limb angles):
- "robot dance": 90° snaps with "linear" easing, stiff movements. BOTH arms at 90° angles alternating positions (lShoulder 90°/0°, rShoulder 0°/90°, elbows ±90°), BOTH legs with alternating stances (lHip/rHip ±10-20°, knees -20 to -40°)
- "chicken dance": exact sequence - (1) BOTH arms flap together 4x (shoulders ±45°, elbows bent -60°) WITH synchronized knee bounces (both knees -20 to -40°), (2) deep squats (knees -90°, arms at sides), (3) BOTH arms clap 4x (shoulders forward 30°, elbows -90°) WITH weight shifts, (4) spin via shoulder offsets WITH knee bends
- "matrix bullet dodge": lean via waist -45°, body -40°, BOTH arms extended backward symmetrically (shoulders -60°, elbows -20°), hold 3s, BOTH knees bent (-45°) for stability
- "moonwalk": hip slides (-10° to 20°) with footTargetY hints, body lean 15°, ALTERNATE leg lifts (one hip 60°, other 10°), BOTH arms swing naturally opposite to legs (shoulders ±20-40°, elbows -10 to -30°)
- "floss": hips ±30° FIRST (priority!), BOTH arms swing together ±90° with overlap, elbows slightly bent (-20°), 0.6s per swing, BOTH knees BEND with each swing (-30 to -50°)
- "dab": left arm bent up (lShoulder 120°, lElbow -90°), right arm extended down (rShoulder -45°, rElbow -10°), asymmetric leg stance (lHip 8°, lKnee -15°, rHip 5°, rKnee -12°)
- "disco": John Travolta - one arm points up-right/down-left (shoulder 120° or -45°, elbow varying), OTHER arm at hip for balance (shoulder 20°, elbow -60°), hip sways WITH LEG SHIFTS (standing leg knee -25°, other leg varies)
- "running man": alternating high knees (one hip 90°, knee 0° / other hip 10°, knee -40°), BOTH arms pump opposite to legs (forward arm shoulder 60°/elbow -30°, back arm shoulder -40°/elbow -20°), 0.4s per step
- "Carlton dance": BOTH shoulders shimmy together ±20°, BOTH elbows bent (-60° to -80°), arms swing side to side in sync, BOTH KNEE BOUNCES synchronized (-15° to -35° oscillating)

User description: "{transcript}"

IMPORTANT:
1. 8-15 keyframes, 0.8-2s spacing (vary timing)
2. Use appropriate easing for each keyframe
3. Apply anticipation before big moves
4. MANDATORY: ALL custom poses MUST specify ALL 8 limb angles (lShoulder, rShoulder, lElbow, rElbow, lHip, rHip, lKnee, rKnee)
5. START and END with visible V-stance (arms out, legs spread in upside-down V, knees STRAIGHT 0° to -5°)
6. BOTH arms must be active - if one arm is raised, other arm provides balance
7. NO rotation parameter - offset limbs for spins
8. Stay within joint constraints
9. For famous dances: INCLUDE the specific leg AND arm choreography described above
10. For original dances: Both arms move in coordination, knee bends during ACTION (-20° minimum), but return to straight-leg V-stance when idle

Explain your choreography choices in 1-2 sentences.

Return ONLY valid JSON (no markdown, no explanation):
{{
  "reasoning": "...",
  "duration": 10.0,
  "keyframes": [
    {{"time": 0.0, "pose": "IDLE", "easing": "cubic"}},
    {{"time": 0.8, "pose": {{"lShoulder": 45, "rShoulder": -20, "lElbow": -30, "rElbow": 15, "lHip": 20, "lKnee": -30, "rHip": 15, "rKnee": -25, "torsoScaleY": 0.95}}, "easing": "bounce"}},
    ...
  ]
}}"""

        # Log the full prompt
        print(f"[Dance LLM] 📝 FULL PROMPT TO AI:")
        print(f"[Dance LLM] {'='*60}")
        for line in prompt.split('\n'):
            print(f"[Dance LLM] {line}")
        print(f"[Dance LLM] {'='*60}\n")
        
        print(f"[Dance LLM] Preparing to call OpenRouter API...")
        print(f"[Dance LLM] Transcript: '{transcript[:100]}..." if len(transcript) > 100 else transcript + "'")
        
        try:
            llm_start = time.time()
            print(f"[Dance LLM] Sending request to {self.command_parser.model}...")
            response = self.command_parser.client.chat.completions.create(
                model=self.command_parser.model,
                messages=[
                    {"role": "system", "content": "You are a dance choreographer. Output only valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=4000,
                temperature=0.8,  # More creative
                response_format={"type": "json_object"},
                timeout=15.0  # 15 second timeout
            )
            llm_time = time.time() - llm_start
            print(f"[Dance LLM] ✓ Response received in {llm_time:.2f}s")
            
            response_content = response.choices[0].message.content
            print(f"[Dance LLM] Response length: {len(response_content)} characters")
            print(f"[Dance LLM] Parsing JSON response...")
            
            result = json.loads(response_content)
            print(f"[Dance LLM] ✓ JSON parsed successfully")
            
            # Validate structure
            print(f"[Dance LLM] Validating response structure...")
            if "duration" not in result or "keyframes" not in result:
                print(f"[Dance LLM] ✗ Missing required fields (duration or keyframes)")
                raise ValueError("Invalid JSON structure - missing duration or keyframes")
            
            if not isinstance(result["keyframes"], list):
                print(f"[Dance LLM] ✗ Keyframes is not a list")
                raise ValueError("Keyframes must be a list")
            
            print(f"[Dance LLM] Found {len(result['keyframes'])} keyframes")
            
            if len(result["keyframes"]) < 3:
                print(f"[Dance LLM] ✗ Too few keyframes: {len(result['keyframes'])}")
                raise ValueError(f"Too few keyframes: {len(result['keyframes'])} (need at least 3)")
            
            if len(result["keyframes"]) > 20:
                # Trim to 20 keyframes max
                print(f"[Dance LLM] ⚠ Too many keyframes ({len(result['keyframes'])}), trimming to 20")
                result["keyframes"] = result["keyframes"][:20]
            
            # Validate each keyframe
            print(f"[Dance LLM] Validating individual keyframes...")
            valid_poses = {'IDLE', 'ARMS_UP', 'ARMS_WAVE_LEFT', 'ARMS_WAVE_RIGHT', 
                          'SPIN_LEFT', 'SPIN_RIGHT', 'KICK_LEFT', 'KICK_RIGHT', 'JUMP', 'BOW'}
            valid_angle_keys = {'waist', 'body', 'lShoulder', 'rShoulder', 'lElbow', 'rElbow',
                               'lHip', 'rHip', 'lKnee', 'rKnee', 'rotation', 'jumpOffset'}
            
            fixed_count = 0
            for i, kf in enumerate(result["keyframes"]):
                if "time" not in kf or "pose" not in kf:
                    print(f"[Dance LLM] ✗ Keyframe {i} missing time or pose")
                    raise ValueError(f"Keyframe {i} missing time or pose")
                
                # Allow pose to be either a string or an object with angles
                pose_value = kf["pose"]
                if isinstance(pose_value, dict):
                    # Validate angle object keys
                    for key in list(pose_value.keys()):
                        if key not in valid_angle_keys:
                            print(f"[Dance LLM] ⚠ Keyframe {i} has invalid angle key: {key}")
                            del pose_value[key]
                            fixed_count += 1
                elif pose_value not in valid_poses:
                    # Validate string pose name
                    print(f"[Dance LLM] ⚠ Invalid pose '{pose_value}' at keyframe {i} (time: {kf['time']}s), replacing with IDLE")
                    kf["pose"] = "IDLE"
                    fixed_count += 1
            
            if fixed_count > 0:
                print(f"[Dance LLM] Fixed {fixed_count} invalid poses")
            
            # Sort keyframes by time
            print(f"[Dance LLM] Sorting keyframes by time...")
            result["keyframes"] = sorted(result["keyframes"], key=lambda k: k["time"])
            
            # Calculate duration based on last keyframe + 1 second buffer
            last_keyframe_time = result["keyframes"][-1]["time"]
            calculated_duration = last_keyframe_time + 1.0  # Add 1 second buffer
            
            if "duration" in result and result["duration"] != calculated_duration:
                print(f"[Dance LLM] ⚠ Adjusting duration from {result['duration']}s to {calculated_duration}s (based on last keyframe at {last_keyframe_time}s)")
            
            result["duration"] = calculated_duration
            
            # Log AI's thinking/reasoning prominently
            print(f"\n[Dance LLM] {'='*60}")
            print(f"[Dance LLM] 🧠 AI CHOREOGRAPHER'S THINKING:")
            print(f"[Dance LLM] {'='*60}")
            if "reasoning" in result:
                print(f"[Dance LLM] {result['reasoning']}")
            else:
                print(f"[Dance LLM] (No reasoning provided)")
            print(f"[Dance LLM] {'='*60}\n")
            
            print(f"[Dance LLM] ✓ Validation complete")
            print(f"\n[Dance LLM] {'='*60}")
            print(f"[Dance LLM] 🎭 GENERATED DANCE SEQUENCE:")
            print(f"[Dance LLM] {'='*60}")
            print(f"[Dance LLM] Duration: {result['duration']:.1f}s ({len(result['keyframes'])} keyframes)\n")
            
            # Log all keyframes with details
            for i, kf in enumerate(result["keyframes"]):
                pose_desc = kf["pose"]
                easing = kf.get("easing", "cubic")
                
                if isinstance(pose_desc, dict):
                    # Custom angles - show key movements
                    angles = []
                    if "lShoulder" in pose_desc or "rShoulder" in pose_desc:
                        angles.append(f"arms: L{pose_desc.get('lShoulder', 0)}° R{pose_desc.get('rShoulder', 0)}°")
                    if "lHip" in pose_desc or "rHip" in pose_desc:
                        angles.append(f"legs: L{pose_desc.get('lHip', 0)}° R{pose_desc.get('rHip', 0)}°")
                    if "waist" in pose_desc:
                        angles.append(f"waist: {pose_desc.get('waist')}°")
                    if "jumpOffset" in pose_desc and pose_desc["jumpOffset"] != 0:
                        angles.append(f"jump: {pose_desc['jumpOffset']}")
                    if "torsoScaleY" in pose_desc:
                        angles.append(f"squash/stretch: {pose_desc['torsoScaleY']}x")
                    if "footTargetY" in pose_desc:
                        angles.append(f"footIK: {pose_desc['footTargetY']}")
                    
                    pose_str = "Custom (" + ", ".join(angles) + ")" if angles else "Custom pose"
                else:
                    pose_str = pose_desc
                
                print(f"[Dance LLM] {i+1:2d}. {kf['time']:5.1f}s → {pose_str:<50s} [{easing}]")
            
            print(f"[Dance LLM] {'='*60}\n")
            
            return result
            
        except json.JSONDecodeError as e:
            print(f"[Dance LLM] ✗ JSON parse error: {e}")
            if 'response_content' in locals():
                print(f"\n[Dance LLM] {'='*60}")
                print(f"[Dance LLM] 📄 FULL RESPONSE FROM AI:")
                print(f"[Dance LLM] {'='*60}")
                print(response_content)
                print(f"[Dance LLM] {'='*60}\n")
            print(f"[Dance LLM] Falling back to default dance")
            return self._get_fallback_dance()
        except Exception as e:
            print(f"[Dance LLM] ✗ Generation failed: {type(e).__name__}: {e}")
            import traceback
            traceback.print_exc()
            print(f"[Dance LLM] Falling back to default dance")
            return self._get_fallback_dance()
    
    def _get_fallback_dance(self) -> Dict[str, Any]:
        """Fallback dance plan when LLM fails."""
        print("[Dance LLM] ⚠ Using fallback dance plan (7 keyframes, 12s)")
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
        self.dance_cooldown.pop(conn_id, None)
