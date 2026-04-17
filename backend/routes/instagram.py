"""Instagram session save/get/delete endpoints."""
import json
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request

from config import IG_CIPHER, logger
from db import db, get_current_user
from models import IgSessionIn

router = APIRouter()


@router.post("/instagram/session")
async def save_ig_session(request: Request, body: IgSessionIn):
    if not IG_CIPHER:
        raise HTTPException(status_code=500, detail="Cifratura non configurata (IG_COOKIE_KEY mancante)")
    user = await get_current_user(request)
    if not body.cookies or 'sessionid' not in body.cookies:
        raise HTTPException(status_code=400, detail="Cookie 'sessionid' mancante. Accedi a Instagram correttamente.")
    try:
        encrypted = IG_CIPHER.encrypt(json.dumps(body.cookies).encode()).decode()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Errore cifratura: {e}")
    await db.instagram_sessions.update_one(
        {"user_id": user["user_id"]},
        {"$set": {
            "user_id": user["user_id"],
            "encrypted_cookies": encrypted,
            "username": body.username or "",
            "connected_at": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    logger.info(f"IG session saved for user {user['user_id']} (username: {body.username or 'n/a'})")
    return {"success": True, "connected": True, "username": body.username or ""}


@router.get("/instagram/session")
async def get_ig_session(request: Request):
    user = await get_current_user(request)
    session = await db.instagram_sessions.find_one(
        {"user_id": user["user_id"]}, {"_id": 0, "encrypted_cookies": 0}
    )
    return {
        "connected": bool(session),
        "username": session.get("username", "") if session else "",
        "connected_at": session.get("connected_at", "") if session else "",
    }


@router.delete("/instagram/session")
async def delete_ig_session(request: Request):
    user = await get_current_user(request)
    result = await db.instagram_sessions.delete_one({"user_id": user["user_id"]})
    logger.info(f"IG session deleted for user {user['user_id']} (matched: {result.deleted_count})")
    return {"success": True, "connected": False}
