import os
import sys

# Add backend directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from ws.handler import WebSocketHandler
from speakers.storage import SpeakerStorage
import config

# Initialize storage (creates data directory and speakers.json if needed)
SpeakerStorage()

app = FastAPI(title="PlayEarOne - Voice Command System")

# CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket handler
ws_handler = WebSocketHandler()

# Serve frontend static files
frontend_path = os.path.join(os.path.dirname(__file__), "..", "frontend")


@app.get("/")
async def root():
    """Serve the frontend."""
    index_path = os.path.join(frontend_path, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "PlayEarOne API", "status": "running"}


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {"status": "healthy"}


@app.get("/api/speakers")
async def list_speakers():
    """List all enrolled speakers."""
    storage = SpeakerStorage()
    return {"speakers": storage.list_speaker_names()}


@app.delete("/api/speakers/{name}")
async def remove_speaker(name: str):
    """Remove an enrolled speaker."""
    storage = SpeakerStorage()
    success = storage.remove_speaker(name)
    return {"success": success, "name": name}


@app.get("/api/config")
async def get_config():
    """Get public configuration."""
    return {
        "valid_commands": config.VALID_COMMANDS,
        "sample_rate": config.SAMPLE_RATE,
        "enrollment_duration_seconds": config.ENROLLMENT_DURATION_SECONDS,
        "chunk_duration_ms": config.CHUNK_DURATION_MS
    }


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint for audio streaming."""
    await ws_handler.handle_connection(websocket)


# Mount frontend at root for static files (must be after all route definitions)
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path), name="frontend")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
