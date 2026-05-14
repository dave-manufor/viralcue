FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Ensure Python output is not buffered for real-time logging
ENV PYTHONUNBUFFERED=1

COPY . .

# Run functions-framework on port 8080 (container port)
# Host 0.0.0.0 is required to be accessible from outside container
# signature-type=cloudevent for Pub/Sub push subscriptions
CMD ["functions-framework", "--target", "publisher_webhook", "--signature-type", "cloudevent", "--host", "0.0.0.0", "--port", "8080", "--debug"]
