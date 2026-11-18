"""Application settings, read from the environment variables injected by Terraform."""

import hashlib
import os

SERVICE_NAME = "api-service"

# Requests arrive as /api/api-service/... via CloudFront, or already stripped
# by the local dev proxy. The prefix is removed before routing.
PATH_PREFIX = f"/api/{SERVICE_NAME}"

POSTGRES_HOST = os.getenv("POSTGRES_HOST", "localhost")
POSTGRES_PORT = int(os.getenv("POSTGRES_PORT", "5432"))
POSTGRES_USER = os.getenv("POSTGRES_USER", "postgres")
POSTGRES_PASS = os.getenv("POSTGRES_PASS", "postgres123")
POSTGRES_NAME = os.getenv("POSTGRES_NAME", "postgres")

# JWT signing key. Prefer an explicit JWT_SECRET; otherwise derive one from
# deployment-specific values so no extra infrastructure is required.
JWT_SECRET = os.getenv("JWT_SECRET") or hashlib.sha256(
    f"jwt:{POSTGRES_PASS}:{os.getenv('APP_ID', 'local')}".encode()
).hexdigest()
JWT_ALGORITHM = "HS256"
TOKEN_TTL_HOURS = 8

ACME_EMAIL_DOMAIN = "acme.inc"
MIN_PASSWORD_LENGTH = 8

# Comma-separated origins allowed to call the API directly (only needed when
# running under uvicorn; Lambda URLs / the dev proxy / CloudFront handle CORS).
CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "").split(",") if o.strip()]
