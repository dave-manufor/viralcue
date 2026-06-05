FROM python:3.11-slim

WORKDIR /app

# Create a non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY src/ ./

# Change ownership of copied files to the appuser
RUN chown -R appuser:appuser /app

# Run as non-root user
USER appuser

# Run the service
CMD ["python", "main.py"]
