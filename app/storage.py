"""Audio object storage: Cloudflare R2 in production, MinIO locally, both via S3.

Only object keys are stored in the database. The app gets short-lived signed GET URLs,
generated per bundle request, so no credential ever leaves the server and a URL that
leaks expires on its own.
"""

from functools import lru_cache
from pathlib import Path
from typing import Protocol

import boto3
from botocore.client import Config

from app.config import Settings, get_settings


class Storage(Protocol):
    def put(self, key: str, data: bytes, content_type: str) -> None: ...
    def exists(self, key: str) -> bool: ...
    def signed_url(self, key: str) -> str: ...


class S3Storage:
    def __init__(self, settings: Settings):
        self.bucket = settings.s3_bucket
        self.ttl = settings.signed_url_ttl_s
        common = dict(
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
            region_name=settings.s3_region,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path"}),
        )
        self.client = boto3.client("s3", endpoint_url=settings.s3_endpoint_url, **common)
        # Signatures cover the host, so URLs for the phone must be signed against the
        # host the phone will use (localhost:9000 for MinIO in Docker, R2 in production).
        public = settings.s3_public_endpoint_url or settings.s3_endpoint_url
        self.signer = boto3.client("s3", endpoint_url=public, **common)

    def ensure_bucket(self) -> None:
        existing = {b["Name"] for b in self.client.list_buckets().get("Buckets", [])}
        if self.bucket not in existing:
            self.client.create_bucket(Bucket=self.bucket)

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type,
                               CacheControl="public, max-age=31536000, immutable")

    def exists(self, key: str) -> bool:
        try:
            self.client.head_object(Bucket=self.bucket, Key=key)
            return True
        except self.client.exceptions.ClientError:
            return False

    def signed_url(self, key: str) -> str:
        return self.signer.generate_presigned_url(
            "get_object", Params={"Bucket": self.bucket, "Key": key}, ExpiresIn=self.ttl
        )


class MemoryStorage:
    """For tests: same interface, nothing leaves the process."""

    def __init__(self) -> None:
        self.objects: dict[str, tuple[bytes, str]] = {}

    def put(self, key: str, data: bytes, content_type: str) -> None:
        self.objects[key] = (data, content_type)

    def exists(self, key: str) -> bool:
        return key in self.objects

    def signed_url(self, key: str) -> str:
        return f"https://storage.test/{key}?signature=test"


class LocalStorage:
    """Laptop runs without Docker. file:// URLs only work on this machine: dev use only."""

    def __init__(self, root: str = "local-audio") -> None:
        self.root = Path(root).resolve()

    def ensure_bucket(self) -> None:
        self.root.mkdir(parents=True, exist_ok=True)

    def put(self, key: str, data: bytes, content_type: str) -> None:
        path = self.root / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)

    def exists(self, key: str) -> bool:
        return (self.root / key).exists()

    def signed_url(self, key: str) -> str:
        return (self.root / key).as_uri()


@lru_cache
def get_storage() -> Storage:
    settings = get_settings()
    return LocalStorage() if settings.storage_backend == "local" else S3Storage(settings)
