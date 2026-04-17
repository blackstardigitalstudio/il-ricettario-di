"""Video download & thumbnail endpoints."""
import asyncio
import base64
import os
import re
import html as html_lib
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import FileResponse
import httpx

from config import THUMB_DIR, DOWNLOAD_DIR, executor, logger
from db import db, get_current_user
from services.video import generate_thumbnail_from_url, download_video_file

router = APIRouter()


async def _download_remote_file(url: str, dst_path: str) -> bool:
    """Stream-download a remote URL to disk using httpx (async). Returns True on success."""
    try:
        async with httpx.AsyncClient(timeout=120, follow_redirects=True) as http:
            async with http.stream('GET', url, headers={'User-Agent': 'Mozilla/5.0'}) as resp:
                if resp.status_code != 200:
                    return False
                with open(dst_path, 'wb') as f:
                    async for chunk in resp.aiter_bytes(chunk_size=65536):
                        f.write(chunk)
        return os.path.exists(dst_path) and os.path.getsize(dst_path) > 1000
    except Exception as e:
        logger.warning(f"httpx download err: {e}")
        return False


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
async def download_video_endpoint(request: Request, recipe_id: str):
    """Download the video ONCE on the server, save to DOWNLOAD_DIR, return internal URL.

    Strategy:
      1. If already downloaded, return existing internal URL.
      2. Try yt-dlp (works for Facebook + many Instagram).
      3. Fallback: DownloadGram → grab CDN URL → server-side download.
      4. Last resort: return external fallback links.
    """
    user = await get_current_user(request)
    recipe = await db.recipes.find_one({"id": recipe_id, "user_id": user["user_id"]}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")

    source_url = recipe.get("source_url", "")
    out_name = f"{recipe_id}.mp4"
    out_path = DOWNLOAD_DIR / out_name
    internal_url = f"/api/videos/{out_name}"

    # 1. Cached?
    if out_path.exists() and out_path.stat().st_size > 10_000:
        return {"success": True, "video_url": internal_url, "method": "cached"}

    # 2. yt-dlp
    try:
        loop = asyncio.get_event_loop()
        ok = await loop.run_in_executor(executor, download_video_file, source_url, str(out_path))
        if ok and out_path.exists() and out_path.stat().st_size > 10_000:
            await db.recipes.update_one(
                {"id": recipe_id},
                {"$set": {"local_video_path": str(out_path)}},
            )
            return {"success": True, "video_url": internal_url, "method": "ytdlp"}
    except Exception as e:
        logger.warning(f"yt-dlp download failed: {e}")

    # 3. SnapSave fallback (works for both Instagram & Facebook)
    try:
        from services.snapsave import snapsave_fetch
        loop = asyncio.get_event_loop()
        ss = await loop.run_in_executor(executor, snapsave_fetch, source_url)
        if ss.get('video_url'):
            ok = await _download_remote_file(ss['video_url'], str(out_path))
            if ok:
                # Save thumbnail too if we didn't have one yet
                if ss.get('thumbnail_url') and not recipe.get("thumbnail_url"):
                    try:
                        async with httpx.AsyncClient(timeout=15) as hc:
                            img_res = await hc.get(ss['thumbnail_url'])
                            if img_res.status_code == 200 and img_res.headers.get('content-type', '').startswith('image'):
                                b64 = base64.b64encode(img_res.content).decode('utf-8')
                                await db.recipes.update_one(
                                    {"id": recipe_id},
                                    {"$set": {"thumbnail_url": f"data:image/jpeg;base64,{b64}"}},
                                )
                    except Exception:
                        pass
                await db.recipes.update_one(
                    {"id": recipe_id},
                    {"$set": {"local_video_path": str(out_path)}},
                )
                return {"success": True, "video_url": internal_url, "method": "snapsave"}
        else:
            logger.info(f"SnapSave no video for {recipe_id}: {ss.get('error', 'unknown')}")
    except Exception as e:
        logger.warning(f"SnapSave error: {e}")

    # 4. DownloadGram fallback (for Instagram when yt-dlp blocked)
    try:
        async with httpx.AsyncClient(timeout=30) as http:
            res = await http.post(
                'https://api.downloadgram.org/media',
                json={'url': source_url},
                headers={'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json'},
            )
            if res.status_code == 200:
                text = res.text.replace('\x20', ' ').replace('\x22', '"')
                text = html_lib.unescape(text)
                cdn_urls = re.findall(r'(https://cdn\.downloadgram\.org/[^\s"\'<>\\]+)', text)
                video_src = ""
                for u in cdn_urls:
                    try:
                        head = await http.head(u, follow_redirects=True, timeout=10)
                        ct = head.headers.get('content-type', '')
                        if 'video' in ct:
                            video_src = u
                            break
                    except Exception:
                        pass
                if video_src:
                    ok = await _download_remote_file(video_src, str(out_path))
                    if ok:
                        await db.recipes.update_one(
                            {"id": recipe_id},
                            {"$set": {"local_video_path": str(out_path)}},
                        )
                        return {"success": True, "video_url": internal_url, "method": "downloadgram"}
    except Exception as e:
        logger.error(f"DownloadGram error: {e}")

    # 5. Fallback public download links (opened in in-app WebView)
    platform = recipe.get("platform", "")
    encoded_url = httpx.QueryParams({'url': source_url}).get('url')  # simple encode
    fallback_links = []
    if platform == "instagram":
        fallback_links = [
            {"name": "SSSInstagram", "url": f"https://sssinstagram.com/?url={source_url}"},
            {"name": "SnapInsta", "url": f"https://snapinst.to/?url={source_url}"},
            {"name": "SaveInsta", "url": f"https://saveinsta.io/?url={source_url}"},
        ]
    elif platform == "facebook":
        fallback_links = [
            {"name": "FDownloader", "url": f"https://fdownloader.net/?url={source_url}"},
            {"name": "FBDown", "url": f"https://fbdown.net/?url={source_url}"},
        ]

    return {"success": False, "fallback_links": fallback_links, "source_url": source_url, "method": "fallback"}


@router.get("/videos/{filename}")
async def serve_video(filename: str):
    """Serve downloaded video file."""
    file_path = DOWNLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Video non trovato")
    return FileResponse(str(file_path), media_type="video/mp4", filename=filename)
