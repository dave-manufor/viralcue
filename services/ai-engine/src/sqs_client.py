"""AI Engine - SQS client for consuming transcripts and publishing drafts."""

import json
import boto3
from botocore.config import Config
from .config import Settings


def get_sqs_client(settings: Settings):
    """Get SQS client configured for LocalStack or AWS."""
    config = Config(
        region_name=settings.aws_region,
        retries={"max_attempts": 3, "mode": "adaptive"},
    )
    
    kwargs = {
        "service_name": "sqs",
        "config": config,
    }
    
    # Use LocalStack endpoint in development
    if settings.aws_endpoint_url:
        kwargs["endpoint_url"] = settings.aws_endpoint_url
        kwargs["aws_access_key_id"] = "test"
        kwargs["aws_secret_access_key"] = "test"
    
    return boto3.client(**kwargs)


class SQSClient:
    """SQS client wrapper for transcript consumption and draft publishing."""
    
    def __init__(self, settings: Settings):
        self.settings = settings
        self.client = get_sqs_client(settings)
        self._transcripts_url = None
        self._drafts_url = None
    
    def _get_queue_url(self, queue_name: str) -> str:
        """Get queue URL by name."""
        return self.client.get_queue_url(QueueName=queue_name)["QueueUrl"]
    
    @property
    def transcripts_queue_url(self) -> str:
        if not self._transcripts_url:
            self._transcripts_url = self._get_queue_url(self.settings.transcripts_queue)
        return self._transcripts_url
    
    @property
    def drafts_queue_url(self) -> str:
        if not self._drafts_url:
            self._drafts_url = self._get_queue_url(self.settings.drafts_queue)
        return self._drafts_url
    
    def receive_transcripts(self, max_messages: int = 10) -> list[dict]:
        """Receive transcript messages from SQS."""
        try:
            response = self.client.receive_message(
                QueueUrl=self.transcripts_queue_url,
                MaxNumberOfMessages=max_messages,
                WaitTimeSeconds=5,  # Long polling
                MessageAttributeNames=["All"],
            )
            
            messages = []
            for msg in response.get("Messages", []):
                messages.append({
                    "receipt_handle": msg["ReceiptHandle"],
                    "body": json.loads(msg["Body"]),
                })
            
            return messages
        except Exception as e:
            print(f"[SQS] Error receiving transcripts: {e}")
            return []
    
    def delete_message(self, receipt_handle: str) -> None:
        """Delete a processed message."""
        try:
            self.client.delete_message(
                QueueUrl=self.transcripts_queue_url,
                ReceiptHandle=receipt_handle,
            )
        except Exception as e:
            print(f"[SQS] Error deleting message: {e}")
    
    def publish_draft(self, user_id: str, draft: dict) -> bool:
        """Publish a generated draft to the drafts queue."""
        try:
            self.client.send_message(
                QueueUrl=self.drafts_queue_url,
                MessageBody=json.dumps({
                    "userId": user_id,
                    "draft": draft,
                }),
            )
            print(f"[SQS] Published draft for user {user_id}")
            return True
        except Exception as e:
            print(f"[SQS] Error publishing draft: {e}")
            return False
