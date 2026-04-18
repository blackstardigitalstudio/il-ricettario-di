"""Backup Export/Import endpoints.

Allows a user to download a JSON dump of all their recipes, folders and
subfolders and to re-import it on another device. Media (video/thumbnail)
URLs are preserved as-is; local binary files are not included to keep the
JSON small and shareable via WhatsApp.
"""
from datetime import datetime, timezone
from typing import List, Optional
import uuid

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from db import db, get_current_user


router = APIRouter()

BACKUP_VERSION = 1


class BackupDoc(BaseModel):
    version: int = BACKUP_VERSION
    exported_at: str
    app: str = "Il Ricettario"
    folders: List[dict] = []
    subfolders: List[dict] = []
    recipes: List[dict] = []


class ImportRequest(BaseModel):
    data: dict
    # "merge": keep existing + add new (by UUID); "replace": delete all then import
    mode: Optional[str] = "merge"


def _sanitize(doc: dict) -> dict:
    """Remove Mongo internal fields, keep UUID-based id."""
    d = {k: v for k, v in doc.items() if k != "_id"}
    # datetime -> isoformat
    for k, v in list(d.items()):
        if isinstance(v, datetime):
            d[k] = v.isoformat()
    return d


@router.get("/backup/export")
async def export_backup(request: Request):
    """Download all data of the current user as a JSON document."""
    user = await get_current_user(request)
    uid = user["user_id"]

    folders = await db.folders.find({"user_id": uid}, {"_id": 0}).to_list(10000)
    subfolders = await db.subfolders.find({"user_id": uid}, {"_id": 0}).to_list(10000)
    recipes = await db.recipes.find({"user_id": uid}, {"_id": 0}).to_list(10000)

    payload = BackupDoc(
        exported_at=datetime.now(timezone.utc).isoformat(),
        folders=[_sanitize(f) for f in folders],
        subfolders=[_sanitize(f) for f in subfolders],
        recipes=[_sanitize(r) for r in recipes],
    ).model_dump()
    payload["totals"] = {
        "folders": len(folders),
        "subfolders": len(subfolders),
        "recipes": len(recipes),
    }
    return payload


@router.post("/backup/import")
async def import_backup(body: ImportRequest, request: Request):
    """Import a backup JSON into the current user's account.

    Two modes supported:
      - merge (default): inserts items whose id doesn't exist yet.
      - replace: wipes all user data and re-imports everything.
    """
    user = await get_current_user(request)
    uid = user["user_id"]
    data = body.data or {}

    if not isinstance(data, dict):
        raise HTTPException(status_code=400, detail="Formato backup non valido")
    if data.get("app") and data.get("app") != "Il Ricettario":
        raise HTTPException(status_code=400, detail="Questo file non è un backup del ricettario")

    folders = data.get("folders") or []
    subfolders = data.get("subfolders") or []
    recipes = data.get("recipes") or []

    if not isinstance(folders, list) or not isinstance(subfolders, list) or not isinstance(recipes, list):
        raise HTTPException(status_code=400, detail="Struttura backup non valida")

    mode = (body.mode or "merge").lower()
    if mode not in ("merge", "replace"):
        raise HTTPException(status_code=400, detail="mode deve essere 'merge' o 'replace'")

    if mode == "replace":
        await db.recipes.delete_many({"user_id": uid})
        await db.subfolders.delete_many({"user_id": uid})
        await db.folders.delete_many({"user_id": uid})

    imported = {"folders": 0, "subfolders": 0, "recipes": 0, "skipped": 0}

    # Build a set of existing ids for merge-mode fast check
    if mode == "merge":
        existing_folder_ids = {d["id"] for d in await db.folders.find({"user_id": uid}, {"id": 1}).to_list(20000) if d.get("id")}
        existing_subfolder_ids = {d["id"] for d in await db.subfolders.find({"user_id": uid}, {"id": 1}).to_list(20000) if d.get("id")}
        existing_recipe_ids = {d["id"] for d in await db.recipes.find({"user_id": uid}, {"id": 1}).to_list(50000) if d.get("id")}
    else:
        existing_folder_ids = set()
        existing_subfolder_ids = set()
        existing_recipe_ids = set()

    # Folders
    for f in folders:
        if not isinstance(f, dict):
            continue
        fid = f.get("id") or str(uuid.uuid4())
        if mode == "merge" and fid in existing_folder_ids:
            imported["skipped"] += 1
            continue
        doc = dict(f)
        doc["id"] = fid
        doc["user_id"] = uid
        # datetime fields -> best effort parse
        for dk in ("created_at", "updated_at"):
            if isinstance(doc.get(dk), str):
                try:
                    doc[dk] = datetime.fromisoformat(doc[dk])
                except Exception:
                    doc[dk] = datetime.now(timezone.utc)
        doc.setdefault("created_at", datetime.now(timezone.utc))
        doc.setdefault("updated_at", datetime.now(timezone.utc))
        await db.folders.insert_one(doc)
        imported["folders"] += 1

    # Subfolders
    for sf in subfolders:
        if not isinstance(sf, dict):
            continue
        sid = sf.get("id") or str(uuid.uuid4())
        if mode == "merge" and sid in existing_subfolder_ids:
            imported["skipped"] += 1
            continue
        doc = dict(sf)
        doc["id"] = sid
        doc["user_id"] = uid
        for dk in ("created_at", "updated_at"):
            if isinstance(doc.get(dk), str):
                try:
                    doc[dk] = datetime.fromisoformat(doc[dk])
                except Exception:
                    doc[dk] = datetime.now(timezone.utc)
        doc.setdefault("created_at", datetime.now(timezone.utc))
        doc.setdefault("updated_at", datetime.now(timezone.utc))
        await db.subfolders.insert_one(doc)
        imported["subfolders"] += 1

    # Recipes
    for r in recipes:
        if not isinstance(r, dict):
            continue
        rid = r.get("id") or str(uuid.uuid4())
        if mode == "merge" and rid in existing_recipe_ids:
            imported["skipped"] += 1
            continue
        doc = dict(r)
        doc["id"] = rid
        doc["user_id"] = uid
        # do NOT carry over local_video_path (points to old device)
        doc["local_video_path"] = ""
        doc["video_compressed"] = False
        for dk in ("created_at", "updated_at"):
            if isinstance(doc.get(dk), str):
                try:
                    doc[dk] = datetime.fromisoformat(doc[dk])
                except Exception:
                    doc[dk] = datetime.now(timezone.utc)
        doc.setdefault("created_at", datetime.now(timezone.utc))
        doc.setdefault("updated_at", datetime.now(timezone.utc))
        await db.recipes.insert_one(doc)
        imported["recipes"] += 1

    return {"success": True, "mode": mode, "imported": imported}
