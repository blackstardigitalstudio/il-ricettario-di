"""Recipes CRUD + AI generation endpoints."""
import asyncio
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, Request

from config import executor
from db import db, get_current_user
from models import Recipe, RecipeCreate, RecipeUpdate
from services.video import detect_platform, extract_video_info
from services.ai import do_ai_recipe_generation, auto_generate_title_and_cover, compress_old_videos

router = APIRouter()


@router.post("/recipes")
async def create_recipe(recipe: RecipeCreate, request: Request):
    user = await get_current_user(request)
    url = recipe.source_url.strip()
    platform = detect_platform(url)
    if platform == 'unknown':
        raise HTTPException(status_code=400, detail="URL non supportato.")
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, extract_video_info, url)
    caption = recipe.manual_caption if recipe.manual_caption else (result.get('caption', '') if result.get('success') else '')
    name = recipe.name.strip() if recipe.name.strip() else "Nuova Ricetta"

    obj = Recipe(
        user_id=user["user_id"], name=name, folder_id=recipe.folder_id,
        subfolder_id=recipe.subfolder_id, source_url=url, platform=platform,
        caption=caption,
        video_url=result.get('video_url', '') if result.get('success') else '',
        thumbnail_url=result.get('thumbnail_url', '') if result.get('success') else '',
        notes=recipe.notes or '',
    )
    await db.recipes.insert_one(obj.dict())

    asyncio.create_task(auto_generate_title_and_cover(obj.id, name, caption, url, user["user_id"]))

    total = await db.recipes.count_documents({"user_id": user["user_id"]})
    if total > 0 and total % 3 == 0:
        asyncio.create_task(compress_old_videos(user["user_id"]))
    return obj


@router.get("/recipes/random")
async def get_random_recipes(request: Request, count: int = 3):
    user = await get_current_user(request)
    pipeline = [
        {"$match": {"user_id": user["user_id"]}},
        {"$sample": {"size": count}},
        {"$project": {"_id": 0}},
    ]
    return await db.recipes.aggregate(pipeline).to_list(count)


@router.get("/recipes/count")
async def get_recipes_count(request: Request):
    user = await get_current_user(request)
    count = await db.recipes.count_documents({"user_id": user["user_id"]})
    return {"count": count}


@router.get("/recipes")
async def get_recipes(request: Request, folder_id: Optional[str] = None,
                     subfolder_id: Optional[str] = None, search: Optional[str] = None,
                     favorites: Optional[bool] = None):
    user = await get_current_user(request)
    q = {"user_id": user["user_id"]}
    if folder_id:
        q["folder_id"] = folder_id
    if subfolder_id:
        q["subfolder_id"] = subfolder_id
    if favorites:
        q["is_favorite"] = True
    if search:
        sr = {"$regex": search, "$options": "i"}
        q["$or"] = [{"name": sr}, {"caption": sr}, {"notes": sr}, {"transcription": sr}]
    return await db.recipes.find(q, {"_id": 0}).sort("created_at", -1).to_list(1000)


@router.get("/recipes/{recipe_id}")
async def get_recipe(recipe_id: str, request: Request):
    user = await get_current_user(request)
    recipe = await db.recipes.find_one({"id": recipe_id, "user_id": user["user_id"]}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")
    return recipe


@router.put("/recipes/{recipe_id}")
async def update_recipe(recipe_id: str, update: RecipeUpdate, request: Request):
    user = await get_current_user(request)
    recipe = await db.recipes.find_one({"id": recipe_id, "user_id": user["user_id"]}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")
    data = {"updated_at": datetime.now(timezone.utc)}
    if update.name is not None: data["name"] = update.name
    if update.folder_id is not None: data["folder_id"] = update.folder_id
    if update.subfolder_id is not None: data["subfolder_id"] = update.subfolder_id
    if update.caption is not None: data["caption"] = update.caption
    if update.notes is not None: data["notes"] = update.notes
    if update.transcription is not None:
        data["transcription"] = update.transcription
        # When user manually edits the recipe, mark as done so the UI shows it
        if update.transcription.strip():
            data["transcription_status"] = "done"
    if update.tags is not None: data["tags"] = update.tags
    if update.difficulty is not None: data["difficulty"] = update.difficulty
    if update.prep_time is not None: data["prep_time"] = update.prep_time
    if update.cook_time is not None: data["cook_time"] = update.cook_time
    if update.is_favorite is not None: data["is_favorite"] = update.is_favorite
    await db.recipes.update_one({"id": recipe_id}, {"$set": data})
    return await db.recipes.find_one({"id": recipe_id}, {"_id": 0})


@router.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str, request: Request):
    user = await get_current_user(request)
    recipe = await db.recipes.find_one({"id": recipe_id, "user_id": user["user_id"]}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")
    if recipe.get("local_video_path"):
        try:
            Path(recipe["local_video_path"]).unlink(missing_ok=True)
        except Exception:
            pass
    await db.recipes.delete_one({"id": recipe_id})
    return {"message": "Ricetta eliminata"}


@router.post("/recipes/{recipe_id}/generate-recipe")
async def generate_recipe(recipe_id: str, request: Request):
    user = await get_current_user(request)
    recipe = await db.recipes.find_one({"id": recipe_id, "user_id": user["user_id"]}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")
    await db.recipes.update_one({"id": recipe_id}, {"$set": {"transcription_status": "pending"}})
    asyncio.create_task(do_ai_recipe_generation(recipe_id, recipe))
    return {"message": "Generazione avviata", "status": "pending"}
