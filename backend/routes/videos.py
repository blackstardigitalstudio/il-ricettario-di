"""Video download & thumbnail endpoints."""
import asyncio
import base64
import re
import html as html_lib
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
import httpx

from config import THUMB_DIR, DOWNLOAD_DIR, executor, logger
from db import db, get_current_user
from services.video import generate_thumbnail_from_url

router = APIRouter()


@router.post("/recipes/{recipe_id}/generate-thumbnail")
async def generate_thumbnail(recipe_id: str, request: Request):
    user = await get_current_user(request)
    recipe = await db.recipes.find_one({"id": recipe_id, "user_id": user["user_id"]}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")

    # 1) accept user upload as base64
    try:
        body = await request.json()
        if body.get("image_base64"):
            thumb_url = body["image_base64"]
            await db.recipes.update_one({"id": recipe_id}, {"$set": {"thumbnail_url": thumb_url}})
            return {"success": True, "thumbnail_url": thumb_url}
    except Exception:
        pass

    # 2) auto-extract via yt-dlp + ffmpeg
    thumb_path = str(THUMB_DIR / f"{recipe_id}.jpg")
    loop = asyncio.get_event_loop()
    ok = await loop.run_in_executor(executor, generate_thumbnail_from_url, recipe["source_url"], thumb_path)
    if ok:
        with open(thumb_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        url = f"data:image/jpeg;base64,{b64}"
        await db.recipes.update_one({"id": recipe_id}, {"$set": {"thumbnail_url": url}})
        return {"success": True, "thumbnail_url": url}
    return {"success": False, "error": "Estrazione automatica non riuscita. Usa 'Scegli dalla Galleria' per caricare uno screenshot."}


@router.post("/recipes/{recipe_id}/download-video")
async def download_video_endpoint(recipe_id: str, request: Request):
    user = await get_current_user(request)
    recipe = await db.recipes.find_one({"id": recipe_id, "user_id": user["user_id"]}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")

    source_url = recipe.get("source_url", "")

    # Try DownloadGram (free)
    try:
        async with httpx.AsyncClient(timeout=25) as http:
            res = await http.post(
                'https://api.downloadgram.org/media',
                json={'url': source_url},
                headers={'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json'},
            )
            if res.status_code == 200:
                text = res.text.replace('\x20', ' ').replace('\x22', '"')
                text = html_lib.unescape(text)
                cdn_urls = re.findall(r'(https://cdn\.downloadgram\.org/[^\s"\'<>\\]+)', text)
                video_url, thumb_url = "", ""
                for u in cdn_urls:
                    try:
                        head = await http.head(u, follow_redirects=True, timeout=10)
                        ct = head.headers.get('content-type', '')
                        if 'video' in ct:
                            video_url = u
                        elif 'image' in ct:
                            thumb_url = u
                    except Exception:
                        pass
                if video_url:
                    if thumb_url and not recipe.get("thumbnail_url"):
                        try:
                            img_res = await http.get(thumb_url, timeout=15)
                            if img_res.status_code == 200:
                                b64 = base64.b64encode(img_res.content).decode('utf-8')
                                await db.recipes.update_one(
                                    {"id": recipe_id},
                                    {"$set": {"thumbnail_url": f"data:image/jpeg;base64,{b64}"}},
                                )
                        except Exception:
                            pass
                    return {"success": True, "video_url": video_url, "thumb_url": thumb_url, "method": "direct"}
    except Exception as e:
        logger.error(f"DownloadGram error: {e}")

    # Fallback public download links
    platform = recipe.get("platform", "")
    encoded_url = source_url.replace("&", "%26")
    fallback_links = []
    if platform == "instagram":
        fallback_links = [
            {"name": "SnapInsta", "url": f"https://snapinst.to/?url={encoded_url}"},
            {"name": "SaveInsta", "url": f"https://saveinsta.io/?url={encoded_url}"},
        ]
    elif platform == "facebook":
        fallback_links = [{"name": "FBDown", "url": f"https://fbdown.net/?url={encoded_url}"}]

    return {"success": False, "fallback_links": fallback_links, "source_url": source_url, "method": "fallback"}


@router.get("/videos/{filename}")
async def serve_video(filename: str):
    file_path = DOWNLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Video non trovato")
    return FileResponse(str(file_path), media_type="video/mp4", filename=filename)
