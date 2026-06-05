FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for audio processing
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app

# Copy pyproject.toml first and install dependencies using a dummy src
COPY pyproject.toml .
RUN mkdir src && touch src/__init__.py && pip install --no-cache-dir --default-timeout=1000 .

# Copy source code and re-install local package without dependencies
COPY src/ ./src/
RUN pip install --no-cache-dir --no-deps . && chown -R appuser:appuser /app

# Run as non-root user
USER appuser

# Run the service
CMD ["python", "-m", "src.main"]
