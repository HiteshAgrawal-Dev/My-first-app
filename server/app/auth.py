"""Password hashing (bcrypt) and session tokens (JWT HS256, 7-day expiry)."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt

SECRET = os.environ.get("VELOURA_SECRET", "veloura-dev-secret-change-me-in-production")
ALGORITHM = "HS256"
TOKEN_TTL = timedelta(days=7)


def hash_password(password: str) -> str:
    # bcrypt only looks at the first 72 bytes; truncate explicitly so long passphrases never error.
    return bcrypt.hashpw(password.encode("utf-8")[:72], bcrypt.gensalt()).decode("ascii")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8")[:72], hashed.encode("ascii"))
    except ValueError:
        return False


def create_token(user_id: int, secret: Optional[str] = None) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": str(user_id), "iat": now, "exp": now + TOKEN_TTL}
    return jwt.encode(payload, secret or SECRET, algorithm=ALGORITHM)


def decode_token(token: str, secret: Optional[str] = None) -> Optional[int]:
    """Return the user id for a valid token, or None if it is invalid/expired."""
    try:
        payload = jwt.decode(token, secret or SECRET, algorithms=[ALGORITHM], options={"require": ["exp", "sub"]})
        return int(payload["sub"])
    except (jwt.PyJWTError, ValueError, KeyError):
        return None
