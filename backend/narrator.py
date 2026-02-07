import os
import base64
import time
import asyncio
import edge_tts
from openai import OpenAI
from typing import Optional
import config

class Narrator:
    def __init__(self):
        # Client for Text (OpenRouter)
        self.text_client = OpenAI(
            api_key=config.OPENROUTER_API_KEY,
            base_url=config.OPENROUTER_BASE_URL
        )
        self.model = config.LLM_MODEL
        self.last_comment_time = 0
        self.cooldown = 5.0 
        
        # Choose a voice (En-US-GuyNeural is great for announcers)
        # You can see all voices via: edge-tts --list-voices
        self.voice = "en-US-RogerNeural"

    def generate_commentary_text(self, speaker_name: str, action: str) -> Optional[str]:
        """Ask OpenRouter to generate a punchy commentary line."""
        try:
            response = self.text_client.chat.completions.create(     
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a witty, high-energy 1920s boxing radio announcer. Keep comments under 10 words. Respond ONLY with the commentary."},
                    {"role": "user", "content": f"The boxer {speaker_name} just threw a {action}!"}
                ],
                max_tokens=30,
                temperature=0.8
            )
            return response.choices[0].message.content
        except Exception as e:
            print(f"OpenRouter Text Error: {e}")
            return None

    async def generate_tts_audio(self, text: str) -> Optional[str]:
        """Convert text to speech using edge-tts (Free, high quality)."""
        try:
            communicate = edge_tts.Communicate(text, self.voice)
            audio_data = b""
            async for chunk in communicate.stream():
                if chunk["type"] == "audio":
                    audio_data += chunk["data"]
            
            return base64.b64encode(audio_data).decode('utf-8')
        except Exception as e:
            print(f"Edge-TTS Error: {e}")
            return None

    async def get_narration(self, speaker: str, action: str) -> Optional[str]:
        """Orchestrates the text and audio generation."""
        current_time = time.time()
        if current_time - self.last_comment_time < self.cooldown:
            return None

        # 1. Get the text from OpenRouter (run in thread because OpenAI SDK is blocking)
        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(None, self.generate_commentary_text, speaker, action)
        
        if text:
            # 2. Get the audio from Edge-TTS (native async)
            audio_b64 = await self.generate_tts_audio(text)
            if audio_b64:
                self.last_comment_time = time.time()
                return audio_b64
        return None
