"""Extract (metadata preview) endpoint."""
import asyncio
from fastapi import APIRouter

from config import executor
from models import ExtractRequest, ExtractResponse
from services.video import detect_platform, extract_video_info

router = APIRouter()


@router.post("/extract", response_model=ExtractResponse)
async def extract_video(request_data: ExtractRequest):
    url = request_data.url.strip()
    platform = detect_platform(url)
    if platform == 'unknown':
        return ExtractResponse(success=False, error="URL non supportato.")
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, extract_video_info, url)
    if result.get('success'):
        return ExtractResponse(
            success=True,
            platform=platform,
            caption=result.get('caption', ''),
            video_url=result.get('video_url', ''),
            thumbnail_url=result.get('thumbnail_url', ''),
        )
    return ExtractResponse(success=False, platform=platform, error=result.get('error', 'Errore'))
