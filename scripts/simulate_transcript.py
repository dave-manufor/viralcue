#!/usr/bin/env python3
"""
Simulate Transcript Script
Publishes a fake transcript to the Pub/Sub topic to trigger AI Engine.

Usage:
    python scripts/simulate_transcript.py <userId> "I love my new Razer mouse" [channelName]
"""
import sys
import json
import time
import os
from google.cloud import pubsub_v1
from dotenv import load_dotenv

load_dotenv()

PROJECT_ID = os.getenv("GCP_PROJECT_ID", "viralcue-local")
TOPIC_NAME = os.getenv("TRANSCRIPTS_TOPIC", "viralcue-transcripts")

def publish_transcript(user_id: str, text: str, channel_name: str = "test_channel"):
    publisher = pubsub_v1.PublisherClient()
    topic_path = publisher.topic_path(PROJECT_ID, TOPIC_NAME)

    message = {
        "userId": user_id,
        "sessionId": f"test-session-{int(time.time())}",
        "streamId": f"test-stream-{int(time.time())}",
        "transcript": text,
        "timestamp": time.time(),
        "channelName": channel_name,
        "confidence": 0.99
    }

    data = json.dumps(message).encode("utf-8")
    
    print(f"Publishing to {topic_path}...")
    print(f"Message: {json.dumps(message, indent=2)}")

    try:
        future = publisher.publish(topic_path, data)
        message_id = future.result()
        print(f"Published message ID: {message_id}")
    except Exception as e:
        print(f"Error publishing: {e}")
        # If emulator is not running or env issues
        print("Ensure Pub/Sub emulator is running or GCP credentials are set.")

if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("Usage: python simulate_transcript.py <userId> <text> [channelName]")
        sys.exit(1)
    
    user_id = sys.argv[1]
    text = sys.argv[2]
    channel = sys.argv[3] if len(sys.argv) > 3 else "test_channel"
    
    publish_transcript(user_id, text, channel)
