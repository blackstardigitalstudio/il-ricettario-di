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
