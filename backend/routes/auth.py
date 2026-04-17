"""Auth endpoints (Emergent OAuth session exchange + me/logout/profile)."""
import uuid
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Request
import httpx

from db import db, get_current_user

router = APIRouter()


@router.get("/")
async def root():
    return {"message": "Il Ricettario - API"}


@router.post("/auth/session")
async def exchange_session(request: Request):
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id richiesto")

    async with httpx.AsyncClient() as http_client:
        res = await http_client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id},
        )
    if res.status_code != 200:
        raise HTTPException(status_code=401, detail="Sessione Google non valida")

    data = res.json()
    email = data.get("email")
    name = data.get("name", "")
    picture = data.get("picture", "")
    session_token = data.get("session_token", str(uuid.uuid4()))

    existing = await db.users.find_one({"email": email}, {"_id": 0})
    if existing:
        user_id = existing["user_id"]
        await db.users.update_one({"email": email}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id, "email": email, "name": name, "picture": picture,
            "created_at": datetime.now(timezone.utc),
        })

    # Migrate anonymous device data into the authenticated user on FIRST login from this device
    device_id = request.headers.get("X-Device-Id", "").strip()
    migrated = {"recipes": 0, "folders": 0, "subfolders": 0}
    if device_id and 16 <= len(device_id) <= 128:
        anon_user_id = f"device_{device_id}"
        # Only migrate the user's own anonymous data, not someone else's
        res_r = await db.recipes.update_many({"user_id": anon_user_id}, {"$set": {"user_id": user_id}})
        res_f = await db.folders.update_many({"user_id": anon_user_id}, {"$set": {"user_id": user_id}})
        res_s = await db.subfolders.update_many({"user_id": anon_user_id}, {"$set": {"user_id": user_id}})
        migrated = {
            "recipes": res_r.modified_count,
            "folders": res_f.modified_count,
            "subfolders": res_s.modified_count,
        }

    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc),
    })
    return {
        "user_id": user_id, "email": email, "name": name, "picture": picture,
        "session_token": session_token, "migrated": migrated,
    }


@router.get("/auth/me")
async def get_me(request: Request):
    return await get_current_user(request)


@router.post("/auth/logout")
async def logout(request: Request):
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_many({"session_token": token})
    return {"message": "Logout effettuato"}


@router.put("/auth/profile")
async def update_profile(request: Request):
    user = await get_current_user(request)
    body = await request.json()
    new_name = body.get("name", "").strip()
    if new_name:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"name": new_name}})
    return await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
