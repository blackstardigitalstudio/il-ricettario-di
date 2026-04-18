"""Mongo client, default user, auth helper."""
from datetime import datetime, timezone
from fastapi import Request
from motor.motor_asyncio import AsyncIOMotorClient

from config import MONGO_URL, DB_NAME

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

DEFAULT_LOCAL_USER = {"user_id": "local_user", "email": "", "name": "Utente", "picture": ""}


def _device_user(device_id: str) -> dict:
    """Build an anonymous user object tied to a device UUID."""
    return {
        "user_id": f"device_{device_id}",
        "email": "",
        "name": "Utente",
        "picture": "",
        "is_anonymous": True,
    }


async def get_current_user(request: Request) -> dict:
    """Return authenticated user or a per-device anonymous user.

    Priority:
      1. Bearer session token (Google-logged-in user)  → real user record
      2. `X-Device-Id` header                          → stable per-install anon user
      3. fallback legacy `local_user`                   → only if neither is present
    """
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("session_token")

    if token:
        session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
        if session:
            expires_at = session.get("expires_at")
            if isinstance(expires_at, str):
                expires_at = datetime.fromisoformat(expires_at)
            if expires_at and expires_at.tzinfo is None:
                expires_at = expires_at.replace(tzinfo=timezone.utc)
            if not expires_at or expires_at >= datetime.now(timezone.utc):
                user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
                if user:
                    return user

    # Anonymous per-installation user
    device_id = request.headers.get("X-Device-Id", "").strip()
    if device_id and 16 <= len(device_id) <= 128:
        uid = f"device_{device_id}"
        # Prefer the persisted record (if the user has set a custom name),
        # otherwise fall back to the transient device user dict.
        persisted = await db.users.find_one({"user_id": uid}, {"_id": 0})
        if persisted:
            persisted.setdefault("is_anonymous", True)
            return persisted
        return _device_user(device_id)

    return DEFAULT_LOCAL_USER
