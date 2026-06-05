FROM python:3.11-slim

WORKDIR /app

# Create a non-root user
RUN useradd -m appuser && chown -R appuser:appuser /app

# Install poetry
RUN pip install poetry==1.7.1

# Copy poetry files
COPY pyproject.toml poetry.lock* ./

# Set poetry HTTP timeout to prevent PyPI timeouts
ENV POETRY_HTTP_TIMEOUT=600

# Install dependencies
RUN poetry config virtualenvs.create false \
    && poetry install --no-interaction --no-ansi --no-dev

# Copy source code
COPY src/ ./src/

# Change ownership of copied files to the appuser
RUN chown -R appuser:appuser /app

# Set Python path
ENV PYTHONPATH=/app

# Run as non-root user
USER appuser

# Run the service
CMD ["python", "-m", "src.main"]
