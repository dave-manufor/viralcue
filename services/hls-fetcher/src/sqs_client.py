"""
HLS Fetcher - SQS client for publishing transcripts
"""
import json
import boto3
from botocore.config import Config
from .config import settings


def get_sqs_client():
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


_sqs_client = None


def get_client():
    """Lazy singleton SQS client."""
    global _sqs_client
    if _sqs_client is None:
        _sqs_client = get_sqs_client()
    return _sqs_client


async def publish_transcript(user_id: str, session_id: str, transcript: str) -> bool:
    """Publish transcript to SQS queue for AI Engine."""
    try:
        client = get_client()
        
        # Get queue URL
        queue_url = client.get_queue_url(QueueName=settings.transcripts_queue)["QueueUrl"]
        
        # Build message params
        message_params = {
            "QueueUrl": queue_url,
            "MessageBody": json.dumps({
                "userId": user_id,
                "sessionId": session_id,
                "transcript": transcript,
            }),
        }
        
        # Only add MessageGroupId for FIFO queues
        if settings.transcripts_queue.endswith(".fifo"):
            message_params["MessageGroupId"] = session_id
        
        # Send message
        client.send_message(**message_params)
        
        print(f"[SQS] Published transcript for session {session_id}")
        return True
        
    except Exception as e:
        print(f"[SQS] Error publishing transcript: {e}")
        return False
