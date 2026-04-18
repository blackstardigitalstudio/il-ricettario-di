"""AI generation (Gemini Vision) for title + full recipe text."""
import asyncio
import base64
import os
import uuid

from config import EMERGENT_LLM_KEY, logger
from db import db
from services.instagram import check_rate_limit
from services.scraping import extract_real_media
from services.video import extract_multiple_frames_from_local, extract_multiple_frames_from_url


async def _get_video_frames(recipe: dict, count: int = 6) -> list:
    """Extract N frames from the recipe's video. Uses local cache if available."""
    loop = asyncio.get_event_loop()
    local_path = recipe.get("local_video_path", "")
    if local_path and os.path.exists(local_path):
        return await loop.run_in_executor(None, extract_multiple_frames_from_local, local_path, count)
    # Try the remote video_url if available
    video_url = recipe.get("video_url", "")
    if video_url:
        return await loop.run_in_executor(None, extract_multiple_frames_from_url, video_url, count)
    return []


async def do_ai_recipe_generation(recipe_id: str, recipe: dict):
    """Generate a full recipe (ingredients, steps) via Gemini multimodal.

    Produces TWO outputs:
      - `ingredients`: a clean bulleted list of ingredients (string)
      - `transcription`: step-by-step procedure + tips + servings (string)
    """
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"recipe-{recipe_id}-{uuid.uuid4().hex[:6]}",
            system_message=(
                "Sei un esperto chef italiano. Analizza l'immagine (se fornita) e la descrizione "
                "per generare una ricetta dettagliata e realistica in italiano. Rispondi SOLO in formato JSON valido "
                "con due chiavi: \"ingredients\" (lista testuale con trattini per ciascun ingrediente e quantità) "
                "e \"steps\" (procedimento numerato dettagliato + tempi + consigli dello chef + porzioni). "
                "Niente testo fuori dal JSON."
            ),
        ).with_model("gemini", "gemini-2.5-flash")

        parts = []
        if recipe.get("name"):
            parts.append(f"Nome: {recipe['name']}")
        if recipe.get("caption"):
            parts.append(f"Descrizione: {recipe['caption']}")
        if recipe.get("notes"):
            parts.append(f"Note utente: {recipe['notes']}")
        context = "\n".join(parts) or "Ricetta italiana"

        prompt = (
            "Genera la ricetta completa in italiano. Rispondi ESCLUSIVAMENTE con un oggetto JSON valido nella forma:\n"
            "{\n"
            '  "ingredients": "- 200 g di farina\\n- 2 uova\\n- ...",\n'
            '  "steps": "1. Primo passo dettagliato\\n2. ...\\n\\n⏱️ Tempo prep: 15 min\\n🔥 Tempo cottura: 20 min\\n👥 Porzioni: 4\\n💡 Consigli: ..."\n'
            "}\n"
            "Contesto:\n" + context
        )

        msg_content: list = [prompt]
        file_contents: list = []
        # Attach multiple video frames (multi-frame analysis) for better recipe detection
        try:
            frames = await _get_video_frames(recipe, count=6)
            if frames:
                logger.info(f"Multi-frame: using {len(frames)} frames for AI recipe gen {recipe_id}")
                for fr in frames:
                    b64 = base64.b64encode(fr['bytes']).decode('utf-8')
                    file_contents.append(ImageContent(image_base64=b64))
            else:
                # Fallback: use cover thumbnail if no video frames available
                thumb = recipe.get("thumbnail_url", "")
                if thumb and thumb.startswith("data:image"):
                    header, b64data = thumb.split(",", 1)
                    file_contents.append(ImageContent(image_base64=b64data))
        except Exception as img_err:
            logger.warning(f"AI image attach err: {img_err}")

        if file_contents:
            response = await chat.send_message(UserMessage(text=prompt, file_contents=file_contents))
        else:
            response = await chat.send_message(UserMessage(text=prompt))

        text = str(response) if response else ""
        ingredients = ""
        steps = text
        # Try to parse JSON (possibly wrapped in markdown fences)
        try:
            import json, re
            cleaned = text.strip()
            # Strip ```json ... ``` fences if present
            m = re.search(r"```(?:json)?\s*(\{.*\})\s*```", cleaned, re.DOTALL)
            if m:
                cleaned = m.group(1)
            # Take the first {...} block
            m2 = re.search(r"\{.*\}", cleaned, re.DOTALL)
            if m2:
                cleaned = m2.group(0)
            parsed = json.loads(cleaned)
            ingredients = str(parsed.get("ingredients", "")).strip()
            steps = str(parsed.get("steps", "")).strip() or text
        except Exception as parse_err:
            logger.warning(f"AI JSON parse failed, using raw text: {parse_err}")

        status = "done" if (steps or ingredients) and len(text) > 20 else "error"
        await db.recipes.update_one(
            {"id": recipe_id},
            {"$set": {
                "transcription_status": status,
                "transcription": steps or "Errore",
                "ingredients": ingredients,
            }},
        )
    except Exception as e:
        logger.error(f"AI error {recipe_id}: {e}")
        await db.recipes.update_one(
            {"id": recipe_id},
            {"$set": {"transcription_status": "error", "transcription": f"Errore: {e}"}},
        )


async def auto_generate_title_and_cover(recipe_id: str, current_name: str, caption: str,
                                        source_url: str, user_id: str = "local_user"):
    """Background task: extract real caption+thumbnail, then generate AI title."""
    try:
        if 'instagram' in source_url.lower() and not check_rate_limit(user_id):
            logger.warning(f"Rate limit exceeded for user {user_id}")
            await db.recipes.update_one({"id": recipe_id}, {"$set": {"name": current_name or "Nuova Ricetta"}})
            return

        media = await extract_real_media(source_url, user_id=user_id)
        real_caption = (media.get('caption') or '').strip()
        thumb_bytes = media.get('thumbnail_bytes')
        thumb_mime = media.get('thumbnail_mime', 'image/jpeg')

        updates = {}
        existing_caption = caption or ''
        if real_caption and (not existing_caption or len(real_caption) > len(existing_caption)):
            updates['caption'] = real_caption
            caption = real_caption

        if thumb_bytes:
            b64 = base64.b64encode(thumb_bytes).decode('utf-8')
            updates['thumbnail_url'] = f"data:{thumb_mime};base64,{b64}"
            logger.info(f"Real thumbnail extracted for {recipe_id} ({len(thumb_bytes)} bytes)")
        else:
            logger.warning(f"No real thumbnail could be extracted for {recipe_id}")

        if updates:
            await db.recipes.update_one({"id": recipe_id}, {"$set": updates})

        # Generate AI title
        from emergentintegrations.llm.chat import LlmChat, UserMessage

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"title-{recipe_id}-{uuid.uuid4().hex[:6]}",
            system_message=(
                "Sei un esperto di cucina. Rispondi SOLO con il nome del piatto (2-5 parole), "
                "niente altro, nessuna introduzione."
            ),
        ).with_model("gemini", "gemini-2.5-flash")

        if caption:
            context = f"Caption del video: {caption[:800]}"
        else:
            context = f"URL del video: {source_url}"

        title_prompt = (
            "Analizza questa ricetta video e dimmi SOLO il nome del piatto in italiano "
            "(esempi: 'Pasta alla Carbonara', 'Tiramisù classico', 'Tacos al Pastor'):\n\n"
            f"{context}"
        )
        title_response = await chat.send_message(UserMessage(text=title_prompt))
        ai_title = str(title_response).strip().strip('"').strip("'") if title_response else ""

        if ai_title and 2 < len(ai_title) < 60:
            await db.recipes.update_one({"id": recipe_id}, {"$set": {"name": ai_title}})
            logger.info(f"Auto-title for {recipe_id}: {ai_title}")

        # Now that caption + thumbnail + video_url are populated, auto-extract ingredients
        # from the video frames. This runs in the same background task sequentially so the
        # user sees them appear automatically without needing to press the button.
        try:
            refreshed = await db.recipes.find_one({"id": recipe_id}, {"_id": 0})
            if refreshed and not (refreshed.get("ingredients") or "").strip():
                await extract_ingredients_from_video(recipe_id, refreshed)
        except Exception as ing_err:
            logger.warning(f"Auto-ingredients err for {recipe_id}: {ing_err}")
    except Exception as e:
        logger.error(f"Auto-generate error for {recipe_id}: {e}")


async def extract_ingredients_from_video(recipe_id: str, recipe: dict):
    """Dedicated multi-frame analysis to extract ONLY the ingredients from the video.

    Downloads the video, samples ~6 frames, then asks Gemini Vision to list ingredients only.
    Writes result to `recipe.ingredients` field (replaces whatever was there).
    """
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage, ImageContent

        # Always re-fetch the latest version of the recipe so we have the newly
        # populated thumbnail_url / video_url / caption.
        fresh = await db.recipes.find_one({"id": recipe_id}, {"_id": 0})
        if fresh:
            recipe = fresh

        frames = await _get_video_frames(recipe, count=6)
        used_cover_fallback = False
        if not frames:
            # Fallback: use the cover thumbnail (single frame is better than nothing)
            thumb = recipe.get("thumbnail_url", "")
            if thumb and thumb.startswith("data:image"):
                try:
                    header, b64data = thumb.split(",", 1)
                    frames = [{"bytes": base64.b64decode(b64data), "timestamp": 0}]
                    used_cover_fallback = True
                except Exception:
                    pass
        if not frames:
            logger.warning(f"ingredients: no frames extractable for {recipe_id}")
            await db.recipes.update_one(
                {"id": recipe_id},
                {"$set": {"ingredients_status": "error",
                          "ingredients_error": "Impossibile estrarre fotogrammi dal video"}},
            )
            return

        chat = LlmChat(
            api_key=EMERGENT_LLM_KEY,
            session_id=f"ingredients-{recipe_id}-{uuid.uuid4().hex[:6]}",
            system_message=(
                "Sei un esperto chef. Analizza i fotogrammi del video (presi in momenti diversi della cottura) "
                "e la descrizione scritta per identificare TUTTI gli ingredienti usati, anche quelli che "
                "compaiono solo brevemente. Rispondi SOLO con la lista degli ingredienti in italiano, uno per riga, "
                "preceduti da un trattino, con quantità stimate se possibili. Nessuna introduzione o commento extra."
            ),
        ).with_model("gemini", "gemini-2.5-flash")

        parts = []
        if recipe.get("name"):
            parts.append(f"Nome ricetta: {recipe['name']}")
        if recipe.get("caption"):
            parts.append(f"Descrizione: {recipe['caption']}")
        context = "\n".join(parts) or "Ricetta video"

        prompt = (
            "Analizza questi fotogrammi del video (presi in ordine cronologico) e la descrizione sotto, "
            "poi elenca TUTTI gli ingredienti che vedi o che sono menzionati. "
            "Includi ingredienti visibili in qualsiasi fotogramma (anche pochi secondi). "
            "Formato output richiesto (solo lista, niente altro):\n"
            "- 200 g di farina\n"
            "- 2 uova\n"
            "- 50 g di zucchero\n"
            "...\n\n"
            f"Contesto:\n{context}"
        )
        logger.info(f"ingredients: analyzing {len(frames)} frames for {recipe_id}")
        await db.recipes.update_one({"id": recipe_id}, {"$set": {"ingredients_status": "pending"}})

        file_contents = []
        for fr in frames:
            b64 = base64.b64encode(fr['bytes']).decode('utf-8')
            file_contents.append(ImageContent(image_base64=b64))

        response = await chat.send_message(UserMessage(text=prompt, file_contents=file_contents))
        text = str(response).strip() if response else ""

        if text and len(text) > 5:
            await db.recipes.update_one(
                {"id": recipe_id},
                {"$set": {"ingredients": text, "ingredients_status": "done"}},
            )
            logger.info(f"ingredients: done for {recipe_id} ({len(text)} chars)")
        else:
            await db.recipes.update_one(
                {"id": recipe_id},
                {"$set": {"ingredients_status": "error",
                          "ingredients_error": "Risposta AI vuota"}},
            )
    except Exception as e:
        logger.error(f"extract_ingredients err {recipe_id}: {e}")
        await db.recipes.update_one(
            {"id": recipe_id},
            {"$set": {"ingredients_status": "error", "ingredients_error": str(e)[:200]}},
        )


async def compress_old_videos(user_id: str):
    """Compress and cache older videos for the user."""
    import os, tempfile
    from config import VIDEO_DIR, executor
    from services.video import download_video_file, compress_video_file
    try:
        uncompressed = await db.recipes.find(
            {"user_id": user_id, "video_compressed": False, "video_url": {"$ne": ""}}, {"_id": 0}
        ).sort("created_at", 1).to_list(10)
        loop = asyncio.get_event_loop()
        for recipe in uncompressed:
            try:
                with tempfile.TemporaryDirectory() as tmpdir:
                    inp = os.path.join(tmpdir, "input.mp4")
                    out = os.path.join(str(VIDEO_DIR), f"{recipe['id']}_compressed.mp4")
                    ok = await loop.run_in_executor(executor, download_video_file, recipe['source_url'], inp)
                    if ok and os.path.exists(inp):
                        compressed = await loop.run_in_executor(executor, compress_video_file, inp, out)
                        if compressed and os.path.exists(out):
                            await db.recipes.update_one(
                                {"id": recipe['id']},
                                {"$set": {"video_compressed": True, "local_video_path": out}},
                            )
                        else:
                            await db.recipes.update_one({"id": recipe['id']}, {"$set": {"video_compressed": True}})
            except Exception:
                await db.recipes.update_one({"id": recipe['id']}, {"$set": {"video_compressed": True}})
    except Exception as e:
        logger.error(f"Compression error: {e}")
