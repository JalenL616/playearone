#!/usr/bin/env python3
"""Download and extract Vosk model for speech recognition."""

import os
import urllib.request
import zipfile
import shutil

MODEL_URL = "https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip"
MODEL_NAME = "vosk-model-small-en-us-0.15"
MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")


def download_model():
    os.makedirs(MODELS_DIR, exist_ok=True)

    model_path = os.path.join(MODELS_DIR, MODEL_NAME)
    if os.path.exists(model_path):
        print(f"Model already exists at {model_path}")
        return

    zip_path = os.path.join(MODELS_DIR, f"{MODEL_NAME}.zip")

    print(f"Downloading Vosk model (~40MB)...")
    print(f"URL: {MODEL_URL}")

    # Download with progress
    def progress_hook(block_num, block_size, total_size):
        downloaded = block_num * block_size
        percent = min(100, downloaded * 100 // total_size)
        mb_downloaded = downloaded / (1024 * 1024)
        mb_total = total_size / (1024 * 1024)
        print(f"\r  {percent}% ({mb_downloaded:.1f}/{mb_total:.1f} MB)", end="", flush=True)

    urllib.request.urlretrieve(MODEL_URL, zip_path, progress_hook)
    print("\nDownload complete!")

    print("Extracting...")
    with zipfile.ZipFile(zip_path, 'r') as zip_ref:
        zip_ref.extractall(MODELS_DIR)

    # Clean up zip
    os.remove(zip_path)

    print(f"Model installed at {model_path}")
    print("Ready to use!")


if __name__ == "__main__":
    download_model()
