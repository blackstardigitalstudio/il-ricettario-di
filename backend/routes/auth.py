"""Auth endpoints (device-based identity + profile update).

Google OAuth session exchange and logout have been removed: the app is now
fully device-based (X-Device-Id header) with no login UI. The only remaining
endpoints are:
  - GET  /           Root health check
  - GET  /auth/me    Return the caller's current user record
  - PUT  /auth/profile   Update the display name
"""
from fastapi import APIRouter, Request

from db import db, get_current_user

router = APIRouter()


@router.get("/")
async def root():
    return {"message": "Il Ricettario - API"}


@router.get("/auth/me")
async def get_me(request: Request):
    return await get_current_user(request)


@router.put("/auth/profile")
async def update_profile(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    new_name = (body.get("name") or "").strip()
    if new_name:
        await db.users.update_one(
            {"user_id": user["user_id"]},
            {
                "$set": {"name": new_name},
                "$setOnInsert": {
                    "user_id": user["user_id"],
                    "email": user.get("email", ""),
                    "picture": user.get("picture", ""),
                    "is_anonymous": user.get("is_anonymous", True),
                },
            },
            upsert=True,
        )
    doc = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    # For anonymous device users never persisted, fall back to the transient doc
    return doc or {**user, "name": new_name or user.get("name", "")}
