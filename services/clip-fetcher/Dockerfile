# Sniper Service - Cloud Run Job for video clip processing
# Uses FFmpeg for video manipulation

FROM python:3.11-slim

# Install FFmpeg and dependencies
RUN apt-get update && apt-get install -y \
    ffmpeg \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Create a non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app

# Copy only pyproject.toml first and install dependencies using a dummy src
COPY pyproject.toml .
RUN mkdir src && touch src/__init__.py && pip install --no-cache-dir --default-timeout=1000 .

# Copy actual source code and re-install local package without re-downloading dependencies
COPY src/ ./src/
RUN pip install --no-cache-dir --no-deps . && chown -R appuser:appuser /app

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# Run as non-root user
USER appuser

# Run the service
CMD ["python", "-m", "src.main"]
