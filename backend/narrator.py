import os
import base64
import time
import asyncio
import edge_tts
from openai import OpenAI
from typing import Optional
import config

class Narrator:
    def __init__(self, game_type):
        # Client for Text (OpenRouter)
        self.text_client = OpenAI(
            api_key=config.OPENROUTER_API_KEY,
            base_url=config.OPENROUTER_BASE_URL
        )
        self.model = config.LLM_MODEL
        self.last_comment_time = 0
        self.cooldown = 5.0
        self.game_type = game_type
        
        # Choose a voice
        self.voice = "en-US-RogerNeural"
        
        # Game-specific prompts
        self.game_prompts = {
            "pong": {
                "system": "You are a witty, high-energy sports announcer for a Pong game. Keep comments under 10 words. Respond ONLY with the commentary.",
                "user_template": "Player {speaker} just moved their paddle {action}!"
            },
            "boxing": {
                "system": "You are a witty, high-energy 1920s boxing radio announcer. Keep comments under 10 words. Respond ONLY with the commentary.",
                "user_template": "The boxer {speaker} just threw a {action}!"
            }
        }

    def generate_commentary_text(self, speaker_name: str, action: str) -> Optional[str]:
        """Ask OpenRouter to generate a punchy commentary line."""
        try:
            prompts = self.game_prompts.get(self.game_type, self.game_prompts.keys())
            
            response = self.text_client.chat.completions.create(     
                model=self.model,
                messages=[
                    {"role": "system", "content": prompts["system"]},
                    {"role": "user", "content": prompts["user_template"].format(
                        speaker=speaker_name, 
                        action=action
                    )}
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

        # Update cooldown timestamp BEFORE generation to prevent overlaps
        self.last_comment_time = current_time

        loop = asyncio.get_event_loop()
        text = await loop.run_in_executor(None, self.generate_commentary_text, speaker, action)
        
        if text:
            audio_b64 = await self.generate_tts_audio(text)
            if audio_b64:
                return audio_b64
        
        # If generation failed, reset cooldown so we can try again sooner
        self.last_comment_time = current_time - self.cooldown + 1.0
        return None
    