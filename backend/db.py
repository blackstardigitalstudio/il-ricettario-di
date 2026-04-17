"""Mongo client, default user, auth helper."""
from datetime import datetime, timezone
from fastapi import Request
from motor.motor_asyncio import AsyncIOMotorClient

from config import MONGO_URL, DB_NAME

client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

DEFAULT_LOCAL_USER = {"user_id": "local_user", "email": "", "name": "Utente", "picture": ""}


async def get_current_user(request: Request) -> dict:
    """Return authenticated user or local fallback."""
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("session_token")
    if not token:
        return DEFAULT_LOCAL_USER

    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return DEFAULT_LOCAL_USER

    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return DEFAULT_LOCAL_USER

    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    return user or DEFAULT_LOCAL_USER
