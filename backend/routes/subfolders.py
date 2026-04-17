"""Subfolder endpoints."""
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, HTTPException, Request

from db import db, get_current_user
from models import Subfolder, SubfolderCreate, SubfolderUpdate

router = APIRouter()


@router.post("/subfolders")
async def create_subfolder(subfolder: SubfolderCreate, request: Request):
    user = await get_current_user(request)
    folder = await db.folders.find_one({"id": subfolder.folder_id, "user_id": user["user_id"]}, {"_id": 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    obj = Subfolder(user_id=user["user_id"], folder_id=subfolder.folder_id, name=subfolder.name)
    await db.subfolders.insert_one(obj.dict())
    return obj


@router.get("/subfolders")
async def get_subfolders(request: Request, folder_id: Optional[str] = None):
    user = await get_current_user(request)
    q = {"user_id": user["user_id"]}
    if folder_id:
        q["folder_id"] = folder_id
    return await db.subfolders.find(q, {"_id": 0}).sort("name", 1).to_list(1000)


@router.put("/subfolders/{subfolder_id}")
async def update_subfolder(subfolder_id: str, update: SubfolderUpdate, request: Request):
    user = await get_current_user(request)
    sf = await db.subfolders.find_one({"id": subfolder_id, "user_id": user["user_id"]}, {"_id": 0})
    if not sf:
        raise HTTPException(status_code=404, detail="Sottocartella non trovata")
    await db.subfolders.update_one(
        {"id": subfolder_id},
        {"$set": {"name": update.name, "updated_at": datetime.now(timezone.utc)}},
    )
    return await db.subfolders.find_one({"id": subfolder_id}, {"_id": 0})


@router.delete("/subfolders/{subfolder_id}")
async def delete_subfolder(subfolder_id: str, request: Request):
    user = await get_current_user(request)
    sf = await db.subfolders.find_one({"id": subfolder_id, "user_id": user["user_id"]}, {"_id": 0})
    if not sf:
        raise HTTPException(status_code=404, detail="Sottocartella non trovata")
    await db.recipes.delete_many({"subfolder_id": subfolder_id, "user_id": user["user_id"]})
    await db.subfolders.delete_one({"id": subfolder_id})
    return {"message": "Sottocartella eliminata"}
