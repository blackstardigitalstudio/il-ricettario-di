"""Thin wrapper around Google Gemini (google-generativeai).

Uses direct calls to Google's free-tier Gemini API. Get a free key at
https://aistudio.google.com/apikey and set it as GEMINI_API_KEY.
"""
from typing import List, Optional

from config import GEMINI_API_KEY, GEMINI_MODEL, logger

_configured = False


def _ensure_configured() -> bool:
    global _configured
    if not GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY not set — AI features disabled.")
        return False
    if not _configured:
        import google.generativeai as genai
        genai.configure(api_key=GEMINI_API_KEY)
        _configured = True
    return True


async def gemini_generate(
    prompt: str,
    system: str = "",
    images: Optional[List[bytes]] = None,
    image_mime: str = "image/jpeg",
    model: Optional[str] = None,
) -> str:
    """Generate text from Gemini given a prompt, optional system instruction and images.

    `images` is a list of raw image bytes (e.g. JPEG video frames). Returns the
    generated text, or raises on hard failures so callers can handle fallbacks.
    """
    if not _ensure_configured():
        raise RuntimeError("GEMINI_API_KEY missing")

    import google.generativeai as genai

    gen_model = genai.GenerativeModel(
        model_name=model or GEMINI_MODEL,
        system_instruction=system or None,
    )

    parts: list = [prompt]
    for img in images or []:
        parts.append({"mime_type": image_mime, "data": img})

    response = await gen_model.generate_content_async(parts)
    return (getattr(response, "text", "") or "").strip()


def gemini_youtube_generate(
    url: str,
    prompt: str,
    system: str = "",
    model: Optional[str] = None,
    response_json: bool = True,
) -> str:
    """Let Gemini watch a public YouTube URL directly and return text.

    Uses the newer `google-genai` SDK, which accepts a YouTube URL as a video part
    (Google fetches the video server-side — no download, no yt-dlp, no bot-wall on our
    end). Synchronous: call it inside an executor from async code.
    """
    if not GEMINI_API_KEY:
        raise RuntimeError("GEMINI_API_KEY missing")

    from google import genai
    from google.genai import types

    client = genai.Client(api_key=GEMINI_API_KEY)
    cfg_kwargs: dict = {}
    if system:
        cfg_kwargs["system_instruction"] = system
    if response_json:
        cfg_kwargs["response_mime_type"] = "application/json"
    config = types.GenerateContentConfig(**cfg_kwargs) if cfg_kwargs else None

    contents = [
        types.Part.from_uri(file_uri=url, mime_type="video/*"),
        types.Part.from_text(text=prompt),
    ]
    response = client.models.generate_content(
        model=model or GEMINI_MODEL, contents=contents, config=config,
    )
    return (getattr(response, "text", "") or "").strip()
