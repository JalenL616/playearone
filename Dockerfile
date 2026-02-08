FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 build-essential && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY . .

# Install CPU-only PyTorch first (much smaller than default GPU version)
RUN pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r backend/requirements.txt

EXPOSE 8000

WORKDIR /app/backend
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000} --workers 1"]
