"""Folder endpoints."""
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request

from db import db, get_current_user
from models import Folder, FolderCreate, FolderUpdate

router = APIRouter()


@router.post("/folders")
async def create_folder(folder: FolderCreate, request: Request):
    user = await get_current_user(request)
    obj = Folder(user_id=user["user_id"], name=folder.name)
    await db.folders.insert_one(obj.dict())
    return obj


@router.get("/folders")
async def get_folders(request: Request):
    user = await get_current_user(request)
    return await db.folders.find({"user_id": user["user_id"]}, {"_id": 0}).sort("name", 1).to_list(1000)


@router.get("/folders/{folder_id}")
async def get_folder(folder_id: str, request: Request):
    user = await get_current_user(request)
    folder = await db.folders.find_one({"id": folder_id, "user_id": user["user_id"]}, {"_id": 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    return folder


@router.put("/folders/{folder_id}")
async def update_folder(folder_id: str, update: FolderUpdate, request: Request):
    user = await get_current_user(request)
    folder = await db.folders.find_one({"id": folder_id, "user_id": user["user_id"]}, {"_id": 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    await db.folders.update_one(
        {"id": folder_id},
        {"$set": {"name": update.name, "updated_at": datetime.now(timezone.utc)}},
    )
    return await db.folders.find_one({"id": folder_id}, {"_id": 0})


@router.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str, request: Request):
    user = await get_current_user(request)
    folder = await db.folders.find_one({"id": folder_id, "user_id": user["user_id"]}, {"_id": 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    await db.subfolders.delete_many({"folder_id": folder_id, "user_id": user["user_id"]})
    await db.recipes.delete_many({"folder_id": folder_id, "user_id": user["user_id"]})
    await db.folders.delete_one({"id": folder_id})
    return {"message": "Cartella eliminata"}
