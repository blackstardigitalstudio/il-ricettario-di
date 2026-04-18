"""Shopping List generation.

Takes a list of recipe ids, concatenates their ingredients and uses Gemini
to produce a single consolidated shopping list with quantities aggregated
per ingredient. Ingredients common to multiple recipes are merged.
"""
import uuid
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel

from config import EMERGENT_LLM_KEY, logger
from db import db, get_current_user


router = APIRouter()


class ShoppingListRequest(BaseModel):
    recipe_ids: List[str]
    language: Optional[str] = "it"  # output language hint


class ShoppingListResponse(BaseModel):
    id: str
    items: List[str]
    raw: str
    recipe_names: List[str]


async def _aggregate_with_ai(raw_blocks: List[dict], lang: str = "it") -> str:
    """Call Gemini to produce a clean aggregated shopping list.

    raw_blocks: [{"name": "Tiramisù", "ingredients": "- 4 uova\n- 250g mascarpone..."}, ...]
    Returns a plain-text list with one item per line prefixed with "- ".
    """
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
    except Exception as e:
        logger.warning(f"shopping: emergentintegrations unavailable: {e}")
        # Fallback: concat without aggregation
        lines: List[str] = []
        for b in raw_blocks:
            for raw_line in (b.get("ingredients") or "").splitlines():
                s = raw_line.strip("- •*\t ")
                if s:
                    lines.append(f"- {s}")
        return "\n".join(lines)

    system = (
        "Sei un assistente che unifica gli ingredienti di più ricette in UNA lista della spesa.\n"
        "Regole:\n"
        "- Somma le quantità quando lo stesso ingrediente compare in più ricette (es. 200g + 100g = 300g di farina).\n"
        "- Mantieni l'unità di misura quando presente. Se le unità non sono comparabili (es. 'q.b.' + '200g'), usa la più precisa.\n"
        "- Un ingrediente per riga, preceduto da '- '.\n"
        "- Non aggiungere intestazioni, categorie o testo extra: solo la lista.\n"
        f"- Rispondi nella lingua: {lang}.\n"
    )

    user_text = "Unisci questi ingredienti in una singola lista della spesa:\n\n"
    for b in raw_blocks:
        user_text += f"=== {b.get('name', 'Ricetta')} ===\n{b.get('ingredients', '')}\n\n"

    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"shopping-{uuid.uuid4().hex[:10]}",
        system_message=system,
    ).with_model("gemini", "gemini-2.5-flash")
    msg = UserMessage(text=user_text)
    resp = await chat.send_message(msg)
    # resp can be string or object depending on SDK version
    text = resp if isinstance(resp, str) else getattr(resp, "content", str(resp))
    return (text or "").strip()


@router.post("/shopping-list/generate", response_model=ShoppingListResponse)
async def generate_shopping_list(body: ShoppingListRequest, request: Request):
    user = await get_current_user(request)
    if not body.recipe_ids:
        raise HTTPException(status_code=400, detail="Nessuna ricetta selezionata")

    recipes = await db.recipes.find(
        {"user_id": user["user_id"], "id": {"$in": body.recipe_ids}},
        {"_id": 0, "id": 1, "name": 1, "ingredients": 1},
    ).to_list(500)

    if not recipes:
        raise HTTPException(status_code=404, detail="Nessuna ricetta trovata")

    # Build raw blocks only for recipes that actually have ingredients
    blocks = []
    names: List[str] = []
    for r in recipes:
        names.append(r.get("name", ""))
        ing = (r.get("ingredients") or "").strip()
        if ing:
            blocks.append({"name": r.get("name", ""), "ingredients": ing})

    if not blocks:
        raise HTTPException(
            status_code=400,
            detail="Le ricette selezionate non hanno ancora ingredienti estratti.",
        )

    try:
        raw = await _aggregate_with_ai(blocks, lang=body.language or "it")
    except Exception as e:
        logger.error(f"shopping: AI aggregate failed: {e}")
        # Fallback simple concat
        raw_lines = []
        for b in blocks:
            for raw_line in (b.get("ingredients") or "").splitlines():
                s = raw_line.strip("- •*\t ")
                if s:
                    raw_lines.append(f"- {s}")
        raw = "\n".join(raw_lines)

    # Parse into items (one per line)
    items: List[str] = []
    for line in raw.splitlines():
        s = line.strip()
        if not s:
            continue
        # remove leading bullets
        while s and s[0] in "-•*":
            s = s[1:].strip()
        if s:
            items.append(s)

    sl_id = str(uuid.uuid4())
    # Persist so user can access again later if desired
    doc = {
        "id": sl_id,
        "user_id": user["user_id"],
        "recipe_ids": body.recipe_ids,
        "recipe_names": names,
        "items": items,
        "raw": raw,
    }
    await db.shopping_lists.insert_one(doc)

    return ShoppingListResponse(id=sl_id, items=items, raw=raw, recipe_names=names)
