"""
ViralCue Integration Tests - Pub/Sub Flow

Tests the complete message flow through Pub/Sub topics.
Run with: pytest tests/integration/test_pubsub_flow.py -v
"""
import pytest
import json
import os
import asyncio
from datetime import datetime

# Skip if not running integration tests
pytestmark = pytest.mark.skipif(
    os.getenv("RUN_INTEGRATION_TESTS") != "true",
    reason="Integration tests disabled"
)


@pytest.fixture
def pubsub_client():
    """Get Pub/Sub client configured for emulator."""
    from google.cloud import pubsub_v1
    
    # Ensure emulator is being used
    assert os.getenv("PUBSUB_EMULATOR_HOST"), "Pub/Sub emulator not configured"
    
    # Enable message ordering for tests publishing with ordering keys
    publisher_options = pubsub_v1.types.PublisherOptions(enable_message_ordering=True)
    
    return {
        "publisher": pubsub_v1.PublisherClient(publisher_options=publisher_options),
        "subscriber": pubsub_v1.SubscriberClient(),
        "project_id": os.getenv("GCP_PROJECT_ID", "viralcue-local"),
    }


class TestPubSubFlow:
    """Test Pub/Sub message flow."""
    
    def test_publish_viral_candidate(self, pubsub_client):
        """Test publishing to viral-candidates topic."""
        publisher = pubsub_client["publisher"]
        project_id = pubsub_client["project_id"]
        
        topic_path = publisher.topic_path(project_id, "viralcue-viral-candidates")
        
        message = {
            "userId": "test-user-123",
            "streamId": "stream-456",
            "timestamp": datetime.now().isoformat(),
            "viralScore": 85,
            "reason": "High chat velocity + audio spike",
        }
        
        future = publisher.publish(
            topic_path,
            json.dumps(message).encode("utf-8"),
            ordering_key="stream-456",
        )
        
        message_id = future.result(timeout=5)
        assert message_id is not None
        print(f"Published message: {message_id}")
    
    def test_publish_draft(self, pubsub_client):
        """Test publishing to drafts topic."""
        publisher = pubsub_client["publisher"]
        project_id = pubsub_client["project_id"]
        
        topic_path = publisher.topic_path(project_id, "viralcue-drafts")
        
        message = {
            "userId": "test-user-123",
            "streamId": "stream-456",
            "draft": {
                "draft_type": "TWEET",
                "content": "Amazing play! 🔥 #gaming",
                "confidence_score": 0.92,
            },
        }
        
        future = publisher.publish(
            topic_path,
            json.dumps(message).encode("utf-8"),
            ordering_key="stream-456",
        )
        
        message_id = future.result(timeout=5)
        assert message_id is not None
    
    def test_subscribe_and_receive(self, pubsub_client):
        """Test subscribing and receiving messages."""
        publisher = pubsub_client["publisher"]
        subscriber = pubsub_client["subscriber"]
        project_id = pubsub_client["project_id"]
        
        # Publish a test message
        topic_path = publisher.topic_path(project_id, "viralcue-transcripts")
        test_message = {"test": "data", "timestamp": datetime.now().isoformat()}
        
        publisher.publish(
            topic_path,
            json.dumps(test_message).encode("utf-8"),
        ).result(timeout=5)
        
        # Pull message
        subscription_path = subscriber.subscription_path(project_id, "ai-engine-sub")
        
        response = subscriber.pull(
            request={"subscription": subscription_path, "max_messages": 1},
            timeout=10,
        )
        
        assert len(response.received_messages) > 0
        
        # Acknowledge
        ack_ids = [msg.ack_id for msg in response.received_messages]
        subscriber.acknowledge(
            request={"subscription": subscription_path, "ack_ids": ack_ids}
        )


class TestGCSStorage:
    """Test GCS storage operations."""
    
    @pytest.fixture
    def gcs_client(self):
        """Get GCS client configured for emulator."""
        from google.cloud import storage
        
        assert os.getenv("STORAGE_EMULATOR_HOST"), "GCS emulator not configured"
        
        return storage.Client(project=os.getenv("GCP_PROJECT_ID", "viralcue-local"))
    
    def test_upload_and_download(self, gcs_client):
        """Test uploading and downloading a file."""
        bucket_name = "viralcue-raw-clips"
        blob_name = f"test/test-{datetime.now().timestamp()}.txt"
        test_data = b"Hello, ViralCue!"
        
        bucket = gcs_client.bucket(bucket_name)
        blob = bucket.blob(blob_name)
        
        # Upload
        blob.upload_from_string(test_data)
        
        # Download and verify
        downloaded = blob.download_as_bytes()
        assert downloaded == test_data
        
        # Cleanup
        blob.delete()


class TestFirestore:
    """Test Firestore operations."""
    
    @pytest.fixture
    def firestore_client(self):
        """Get Firestore client configured for emulator."""
        from google.cloud import firestore
        
        assert os.getenv("FIRESTORE_EMULATOR_HOST"), "Firestore emulator not configured"
        
        return firestore.Client(project=os.getenv("GCP_PROJECT_ID", "viralcue-local"))
    
    def test_create_and_read_card(self, firestore_client):
        """Test creating and reading a card document."""
        user_id = "test-user-123"
        stream_id = "test-stream-456"
        
        card_ref = firestore_client.collection(
            f"users/{user_id}/streams/{stream_id}/cards"
        ).document()
        
        card_data = {
            "status": "pending",
            "viralScore": 85,
            "videoUrl": "gs://test-bucket/test.mp4",
            "createdAt": datetime.now(),
        }
        
        # Create
        card_ref.set(card_data)
        
        # Read
        doc = card_ref.get()
        assert doc.exists
        assert doc.get("viralScore") == 85
        
        # Update
        card_ref.update({"status": "approved"})
        
        # Verify update
        doc = card_ref.get()
        assert doc.get("status") == "approved"
        
        # Cleanup
        card_ref.delete()


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
