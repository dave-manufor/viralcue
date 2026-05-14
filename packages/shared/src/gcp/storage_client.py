"""
GCP Cloud Storage Client with Emulator Support

Automatically connects to fake-gcs-server when STORAGE_EMULATOR_HOST is set.
"""

import os
from typing import Optional, Dict, Any
from datetime import timedelta

from google.cloud import storage
from google.cloud.storage import Blob, Bucket


class Buckets:
    """Bucket names used in ViralCue."""
    RAW_CLIPS = "viralcue-raw-clips"
    PROCESSED_CLIPS = "viralcue-processed-clips"
    THUMBNAILS = "viralcue-thumbnails"


class StorageClient:
    """GCS client wrapper with emulator support."""
    
    def __init__(self, project_id: Optional[str] = None):
        self.project_id = project_id or os.getenv("GCP_PROJECT_ID", "viralcue-local")
        self.emulator_host = os.getenv("STORAGE_EMULATOR_HOST")
        self.is_emulator = bool(self.emulator_host)
        
        # Initialize client
        if self.is_emulator:
            # For fake-gcs-server, we need to set the API endpoint
            self._client = storage.Client(
                project=self.project_id,
                client_options={"api_endpoint": self.emulator_host}
            )
        else:
            self._client = storage.Client(project=self.project_id)
        
        env_type = "emulator" if self.is_emulator else "production"
        print(f"[GCS] Connected to {env_type} (project: {self.project_id})")
    
    @property
    def client(self) -> storage.Client:
        return self._client
    
    def get_bucket(self, bucket_name: str) -> Bucket:
        """Get a bucket by name."""
        return self._client.bucket(bucket_name)
    
    def upload_bytes(
        self,
        bucket_name: str,
        blob_name: str,
        data: bytes,
        content_type: str = "application/octet-stream",
        metadata: Optional[Dict[str, str]] = None
    ) -> str:
        """Upload bytes to GCS and return the public URL."""
        bucket = self.get_bucket(bucket_name)
        blob = bucket.blob(blob_name)
        
        if metadata:
            blob.metadata = metadata
        
        blob.upload_from_string(data, content_type=content_type)
        
        if self.is_emulator:
            return f"{self.emulator_host}/{bucket_name}/{blob_name}"
        else:
            return f"https://storage.googleapis.com/{bucket_name}/{blob_name}"
    
    def upload_file(
        self,
        bucket_name: str,
        blob_name: str,
        file_path: str,
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None
    ) -> str:
        """Upload a file to GCS and return the public URL."""
        bucket = self.get_bucket(bucket_name)
        blob = bucket.blob(blob_name)
        
        if metadata:
            blob.metadata = metadata
        
        blob.upload_from_filename(file_path, content_type=content_type)
        
        if self.is_emulator:
            return f"{self.emulator_host}/{bucket_name}/{blob_name}"
        else:
            return f"https://storage.googleapis.com/{bucket_name}/{blob_name}"
    
    def download_bytes(self, bucket_name: str, blob_name: str) -> bytes:
        """Download a blob as bytes."""
        bucket = self.get_bucket(bucket_name)
        blob = bucket.blob(blob_name)
        return blob.download_as_bytes()
    
    def download_to_file(self, bucket_name: str, blob_name: str, file_path: str) -> None:
        """Download a blob to a local file."""
        bucket = self.get_bucket(bucket_name)
        blob = bucket.blob(blob_name)
        blob.download_to_filename(file_path)
    
    def get_signed_url(
        self,
        bucket_name: str,
        blob_name: str,
        expiration_minutes: int = 60,
        method: str = "GET"
    ) -> str:
        """Generate a signed URL for blob access."""
        bucket = self.get_bucket(bucket_name)
        blob = bucket.blob(blob_name)
        
        # For emulator, return a direct URL (no signing)
        if self.is_emulator:
            return f"{self.emulator_host}/{bucket_name}/{blob_name}"
        
        url = blob.generate_signed_url(
            version="v4",
            expiration=timedelta(minutes=expiration_minutes),
            method=method
        )
        return url
    
    def delete_blob(self, bucket_name: str, blob_name: str) -> None:
        """Delete a blob."""
        bucket = self.get_bucket(bucket_name)
        blob = bucket.blob(blob_name)
        blob.delete()
    
    def blob_exists(self, bucket_name: str, blob_name: str) -> bool:
        """Check if a blob exists."""
        bucket = self.get_bucket(bucket_name)
        blob = bucket.blob(blob_name)
        return blob.exists()


# Singleton instance
_client: Optional[StorageClient] = None


def get_storage_client() -> StorageClient:
    """Get the singleton Storage client."""
    global _client
    if _client is None:
        _client = StorageClient()
    return _client


def upload_clip(
    blob_name: str,
    file_path: str,
    bucket: str = Buckets.RAW_CLIPS
) -> str:
    """Convenience function to upload a video clip."""
    client = get_storage_client()
    return client.upload_file(bucket, blob_name, file_path, content_type="video/mp4")


def get_clip_signed_url(
    blob_name: str,
    bucket: str = Buckets.PROCESSED_CLIPS,
    expiration_minutes: int = 60
) -> str:
    """Convenience function to get a signed URL for a clip."""
    client = get_storage_client()
    return client.get_signed_url(bucket, blob_name, expiration_minutes)
