from fastapi import FastAPI, APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone, timedelta
import yt_dlp
import asyncio
from concurrent.futures import ThreadPoolExecutor
import subprocess
import tempfile
import httpx

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

app = FastAPI()
api_router = APIRouter(prefix="/api")
executor = ThreadPoolExecutor(max_workers=3)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

VIDEO_DIR = ROOT_DIR / "videos"
VIDEO_DIR.mkdir(exist_ok=True)

# ================= AUTH HELPERS =================

DEFAULT_LOCAL_USER = {"user_id": "local_user", "email": "", "name": "Utente", "picture": ""}

async def get_current_user(request: Request) -> dict:
    """Get current user - returns local user if no auth token"""
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("session_token")
    
    if not token:
        # No auth = local user mode
        return DEFAULT_LOCAL_USER
    
    session = await db.user_sessions.find_one({"session_token": token}, {"_id": 0})
    if not session:
        return DEFAULT_LOCAL_USER
    
    expires_at = session.get("expires_at")
    if isinstance(expires_at, str):
        expires_at = datetime.fromisoformat(expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        return DEFAULT_LOCAL_USER
    
    user = await db.users.find_one({"user_id": session["user_id"]}, {"_id": 0})
    if not user:
        return DEFAULT_LOCAL_USER
    return user

# ================= MODELS =================

class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class Folder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FolderCreate(BaseModel):
    name: str

class FolderUpdate(BaseModel):
    name: str

class Subfolder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    folder_id: str
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class SubfolderCreate(BaseModel):
    folder_id: str
    name: str

class SubfolderUpdate(BaseModel):
    name: str

class Recipe(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    folder_id: Optional[str] = None
    subfolder_id: Optional[str] = None
    source_url: str
    platform: str
    caption: str = ""
    video_url: str = ""
    thumbnail_url: str = ""
    notes: str = ""
    transcription: str = ""
    transcription_status: str = "none"
    video_compressed: bool = False
    local_video_path: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class RecipeCreate(BaseModel):
    name: str
    folder_id: Optional[str] = None
    subfolder_id: Optional[str] = None
    source_url: str
    manual_caption: Optional[str] = None
    notes: Optional[str] = None

class RecipeUpdate(BaseModel):
    name: Optional[str] = None
    folder_id: Optional[str] = None
    subfolder_id: Optional[str] = None
    caption: Optional[str] = None
    notes: Optional[str] = None

class ExtractRequest(BaseModel):
    url: str

class ExtractResponse(BaseModel):
    success: bool
    platform: str = ""
    caption: str = ""
    video_url: str = ""
    thumbnail_url: str = ""
    error: str = ""

# ================= VIDEO EXTRACTION =================

def detect_platform(url: str) -> str:
    url_lower = url.lower()
    if 'instagram.com' in url_lower or 'instagr.am' in url_lower:
        return 'instagram'
    elif 'facebook.com' in url_lower or 'fb.com' in url_lower or 'fb.watch' in url_lower:
        return 'facebook'
    return 'unknown'

def extract_video_info(url: str) -> dict:
    ydl_opts = {'quiet': True, 'no_warnings': True, 'extract_flat': False, 'skip_download': True, 'format': 'best[ext=mp4]/best'}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            video_url = info.get('url', '')
            if not video_url and info.get('formats'):
                for fmt in reversed(info.get('formats', [])):
                    if fmt.get('url'):
                        video_url = fmt['url']
                        break
            return {'success': True, 'caption': info.get('description', '') or info.get('title', ''), 'video_url': video_url, 'thumbnail_url': info.get('thumbnail', '')}
    except Exception as e:
        return {'success': False, 'error': str(e)}

def compress_video_file(input_path: str, output_path: str) -> bool:
    try:
        cmd = ['ffmpeg', '-i', input_path, '-vcodec', 'libx264', '-crf', '28', '-preset', 'fast', '-acodec', 'aac', '-b:a', '64k', '-y', output_path]
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        return result.returncode == 0
    except Exception:
        return False

def download_video_file(url: str, output_path: str) -> bool:
    ydl_opts = {'quiet': True, 'no_warnings': True, 'format': 'best[ext=mp4]/best', 'outtmpl': output_path}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        return True
    except Exception:
        return False

# ================= AUTH ENDPOINTS =================

@api_router.get("/")
async def root():
    return {"message": "Il Ricettario - API"}

@api_router.post("/auth/session")
async def exchange_session(request: Request):
    """Exchange session_id for session_token"""
    body = await request.json()
    session_id = body.get("session_id")
    if not session_id:
        raise HTTPException(status_code=400, detail="session_id richiesto")
    
    # Call Emergent Auth to get user data
    async with httpx.AsyncClient() as http_client:
        res = await http_client.get(
            "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data",
            headers={"X-Session-ID": session_id}
        )
    
    if res.status_code != 200:
        raise HTTPException(status_code=401, detail="Sessione Google non valida")
    
    data = res.json()
    email = data.get("email")
    name = data.get("name", "")
    picture = data.get("picture", "")
    session_token = data.get("session_token", str(uuid.uuid4()))
    
    # Find or create user
    existing_user = await db.users.find_one({"email": email}, {"_id": 0})
    if existing_user:
        user_id = existing_user["user_id"]
        await db.users.update_one({"email": email}, {"$set": {"name": name, "picture": picture}})
    else:
        user_id = f"user_{uuid.uuid4().hex[:12]}"
        await db.users.insert_one({
            "user_id": user_id,
            "email": email,
            "name": name,
            "picture": picture,
            "created_at": datetime.now(timezone.utc)
        })
    
    # Store session
    await db.user_sessions.insert_one({
        "user_id": user_id,
        "session_token": session_token,
        "expires_at": datetime.now(timezone.utc) + timedelta(days=7),
        "created_at": datetime.now(timezone.utc)
    })
    
    return {
        "user_id": user_id,
        "email": email,
        "name": name,
        "picture": picture,
        "session_token": session_token
    }

@api_router.get("/auth/me")
async def get_me(request: Request):
    """Get current user"""
    user = await get_current_user(request)
    return user

@api_router.post("/auth/logout")
async def logout(request: Request):
    """Logout"""
    token = None
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header[7:]
    if not token:
        token = request.cookies.get("session_token")
    if token:
        await db.user_sessions.delete_many({"session_token": token})
    return {"message": "Logout effettuato"}

@api_router.put("/auth/profile")
async def update_profile(request: Request):
    """Update user name"""
    user = await get_current_user(request)
    body = await request.json()
    new_name = body.get("name", "").strip()
    if new_name:
        await db.users.update_one({"user_id": user["user_id"]}, {"$set": {"name": new_name}})
    updated = await db.users.find_one({"user_id": user["user_id"]}, {"_id": 0})
    return updated

# ================= EXTRACT =================

@api_router.post("/extract", response_model=ExtractResponse)
async def extract_video(request_data: ExtractRequest):
    url = request_data.url.strip()
    platform = detect_platform(url)
    if platform == 'unknown':
        return ExtractResponse(success=False, error="URL non supportato.")
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, extract_video_info, url)
    if result.get('success'):
        return ExtractResponse(success=True, platform=platform, caption=result.get('caption', ''), video_url=result.get('video_url', ''), thumbnail_url=result.get('thumbnail_url', ''))
    return ExtractResponse(success=False, platform=platform, error=result.get('error', 'Errore'))

# ================= FOLDERS (user-scoped) =================

@api_router.post("/folders")
async def create_folder(folder: FolderCreate, request: Request):
    user = await get_current_user(request)
    folder_obj = Folder(user_id=user["user_id"], name=folder.name)
    await db.folders.insert_one(folder_obj.dict())
    return folder_obj

@api_router.get("/folders")
async def get_folders(request: Request):
    user = await get_current_user(request)
    folders = await db.folders.find({"user_id": user["user_id"]}, {"_id": 0}).sort("name", 1).to_list(1000)
    return folders

@api_router.get("/folders/{folder_id}")
async def get_folder(folder_id: str, request: Request):
    user = await get_current_user(request)
    folder = await db.folders.find_one({"id": folder_id, "user_id": user["user_id"]}, {"_id": 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    return folder

@api_router.put("/folders/{folder_id}")
async def update_folder(folder_id: str, update: FolderUpdate, request: Request):
    user = await get_current_user(request)
    folder = await db.folders.find_one({"id": folder_id, "user_id": user["user_id"]}, {"_id": 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    await db.folders.update_one({"id": folder_id}, {"$set": {"name": update.name, "updated_at": datetime.now(timezone.utc)}})
    return await db.folders.find_one({"id": folder_id}, {"_id": 0})

@api_router.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str, request: Request):
    user = await get_current_user(request)
    folder = await db.folders.find_one({"id": folder_id, "user_id": user["user_id"]}, {"_id": 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    await db.subfolders.delete_many({"folder_id": folder_id, "user_id": user["user_id"]})
    await db.recipes.delete_many({"folder_id": folder_id, "user_id": user["user_id"]})
    await db.folders.delete_one({"id": folder_id})
    return {"message": "Cartella eliminata"}

# ================= SUBFOLDERS (user-scoped) =================

@api_router.post("/subfolders")
async def create_subfolder(subfolder: SubfolderCreate, request: Request):
    user = await get_current_user(request)
    folder = await db.folders.find_one({"id": subfolder.folder_id, "user_id": user["user_id"]}, {"_id": 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    obj = Subfolder(user_id=user["user_id"], folder_id=subfolder.folder_id, name=subfolder.name)
    await db.subfolders.insert_one(obj.dict())
    return obj

@api_router.get("/subfolders")
async def get_subfolders(request: Request, folder_id: Optional[str] = None):
    user = await get_current_user(request)
    query = {"user_id": user["user_id"]}
    if folder_id:
        query["folder_id"] = folder_id
    return await db.subfolders.find(query, {"_id": 0}).sort("name", 1).to_list(1000)

@api_router.put("/subfolders/{subfolder_id}")
async def update_subfolder(subfolder_id: str, update: SubfolderUpdate, request: Request):
    user = await get_current_user(request)
    sf = await db.subfolders.find_one({"id": subfolder_id, "user_id": user["user_id"]}, {"_id": 0})
    if not sf:
        raise HTTPException(status_code=404, detail="Sottocartella non trovata")
    await db.subfolders.update_one({"id": subfolder_id}, {"$set": {"name": update.name, "updated_at": datetime.now(timezone.utc)}})
    return await db.subfolders.find_one({"id": subfolder_id}, {"_id": 0})

@api_router.delete("/subfolders/{subfolder_id}")
async def delete_subfolder(subfolder_id: str, request: Request):
    user = await get_current_user(request)
    sf = await db.subfolders.find_one({"id": subfolder_id, "user_id": user["user_id"]}, {"_id": 0})
    if not sf:
        raise HTTPException(status_code=404, detail="Sottocartella non trovata")
    await db.recipes.delete_many({"subfolder_id": subfolder_id, "user_id": user["user_id"]})
    await db.subfolders.delete_one({"id": subfolder_id})
    return {"message": "Sottocartella eliminata"}

# ================= RECIPES (user-scoped) =================

@api_router.post("/recipes")
async def create_recipe(recipe: RecipeCreate, request: Request):
    user = await get_current_user(request)
    url = recipe.source_url.strip()
    platform = detect_platform(url)
    if platform == 'unknown':
        raise HTTPException(status_code=400, detail="URL non supportato.")
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, extract_video_info, url)
    caption = recipe.manual_caption if recipe.manual_caption else (result.get('caption', '') if result.get('success') else '')
    
    # Use provided name or placeholder
    name = recipe.name.strip() if recipe.name.strip() else "Nuova Ricetta"
    
    recipe_obj = Recipe(
        user_id=user["user_id"], name=name, folder_id=recipe.folder_id,
        subfolder_id=recipe.subfolder_id, source_url=url, platform=platform,
        caption=caption, video_url=result.get('video_url', '') if result.get('success') else '',
        thumbnail_url=result.get('thumbnail_url', '') if result.get('success') else '',
        notes=recipe.notes or '',
    )
    await db.recipes.insert_one(recipe_obj.dict())
    
    # Background: auto-generate AI title + cover image
    asyncio.create_task(auto_generate_title_and_cover(recipe_obj.id, name, caption, url))
    
    total = await db.recipes.count_documents({"user_id": user["user_id"]})
    if total > 0 and total % 3 == 0:
        asyncio.create_task(compress_old_videos(user["user_id"]))
    return recipe_obj

@api_router.get("/recipes/random")
async def get_random_recipes(request: Request, count: int = 3):
    user = await get_current_user(request)
    pipeline = [{"$match": {"user_id": user["user_id"]}}, {"$sample": {"size": count}}, {"$project": {"_id": 0}}]
    recipes = await db.recipes.aggregate(pipeline).to_list(count)
    return recipes

@api_router.get("/recipes/count")
async def get_recipes_count(request: Request):
    user = await get_current_user(request)
    count = await db.recipes.count_documents({"user_id": user["user_id"]})
    return {"count": count}

@api_router.get("/recipes")
async def get_recipes(request: Request, folder_id: Optional[str] = None, subfolder_id: Optional[str] = None, search: Optional[str] = None):
    user = await get_current_user(request)
    query = {"user_id": user["user_id"]}
    if folder_id:
        query["folder_id"] = folder_id
    if subfolder_id:
        query["subfolder_id"] = subfolder_id
    if search:
        sr = {"$regex": search, "$options": "i"}
        query["$or"] = [{"name": sr}, {"caption": sr}, {"notes": sr}, {"transcription": sr}]
    return await db.recipes.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)

@api_router.get("/recipes/{recipe_id}")
async def get_recipe(recipe_id: str, request: Request):
    user = await get_current_user(request)
    recipe = await db.recipes.find_one({"id": recipe_id, "user_id": user["user_id"]}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")
    return recipe

@api_router.put("/recipes/{recipe_id}")
async def update_recipe(recipe_id: str, update: RecipeUpdate, request: Request):
    user = await get_current_user(request)
    recipe = await db.recipes.find_one({"id": recipe_id, "user_id": user["user_id"]}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")
    update_data = {"updated_at": datetime.now(timezone.utc)}
    if update.name is not None:
        update_data["name"] = update.name
    if update.folder_id is not None:
        update_data["folder_id"] = update.folder_id
    if update.subfolder_id is not None:
        update_data["subfolder_id"] = update.subfolder_id
    if update.caption is not None:
        update_data["caption"] = update.caption
    if update.notes is not None:
        update_data["notes"] = update.notes
    await db.recipes.update_one({"id": recipe_id}, {"$set": update_data})
    return await db.recipes.find_one({"id": recipe_id}, {"_id": 0})

@api_router.delete("/recipes/{recipe_id}")
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

# ================= AI RECIPE =================

@api_router.post("/recipes/{recipe_id}/generate-recipe")
async def generate_recipe(recipe_id: str, request: Request):
    user = await get_current_user(request)
    recipe = await db.recipes.find_one({"id": recipe_id, "user_id": user["user_id"]}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")
    await db.recipes.update_one({"id": recipe_id}, {"$set": {"transcription_status": "pending"}})
    asyncio.create_task(do_ai_recipe_generation(recipe_id, recipe))
    return {"message": "Generazione avviata", "status": "pending"}

async def do_ai_recipe_generation(recipe_id: str, recipe: dict):
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        chat = LlmChat(
            api_key=os.getenv("EMERGENT_LLM_KEY"),
            session_id=f"recipe-{recipe_id}-{uuid.uuid4().hex[:6]}",
            system_message="Sei un esperto chef italiano. Genera ricette strutturate in italiano. Se ricevi solo il nome, genera la ricetta completa dalla tua conoscenza. Rispondi SOLO con la ricetta."
        ).with_model("gemini", "gemini-2.5-flash")
        
        parts = []
        if recipe.get("name"):
            parts.append(f"Nome: {recipe['name']}")
        if recipe.get("caption"):
            parts.append(f"Descrizione: {recipe['caption']}")
        context = "\n".join(parts) or "Ricetta italiana"
        
        prompt = f"""Genera la ricetta completa:\n\n{context}\n\nFormato:\n🍽️ NOME\n\n📝 INGREDIENTI:\n- (lista con quantità)\n\n👨‍🍳 PROCEDIMENTO:\n1. (passi)\n\n⏱️ TEMPO:\n👥 PORZIONI:\n💡 CONSIGLI:"""
        
        response = await chat.send_message(UserMessage(text=prompt))
        text = str(response) if response else ""
        status = "done" if len(text) > 20 else "error"
        await db.recipes.update_one({"id": recipe_id}, {"$set": {"transcription_status": status, "transcription": text or "Errore"}})
    except Exception as e:
        logger.error(f"AI error {recipe_id}: {e}")
        await db.recipes.update_one({"id": recipe_id}, {"$set": {"transcription_status": "error", "transcription": f"Errore: {e}"}})

# ================= AUTO TITLE + COVER IMAGE =================

async def auto_generate_title_and_cover(recipe_id: str, current_name: str, caption: str, source_url: str):
    """Background task: generate AI title + AI cover image for a recipe"""
    try:
        # Step 1: Generate AI title from caption/URL
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        chat = LlmChat(
            api_key=os.getenv("EMERGENT_LLM_KEY"),
            session_id=f"title-{recipe_id}-{uuid.uuid4().hex[:6]}",
            system_message="Sei un esperto di cucina italiana. Rispondi SOLO con il nome del piatto, niente altro. Max 5 parole."
        ).with_model("gemini", "gemini-2.5-flash")
        
        context = ""
        if caption:
            context = f"Caption del video: {caption}"
        elif current_name and current_name != "Nuova Ricetta":
            context = f"Nome fornito: {current_name}"
        else:
            context = f"URL del video: {source_url}"
        
        title_prompt = f"Analizza questa ricetta e dammi il nome del piatto in italiano (es: 'Pasta alla Carbonara', 'Tiramisù classico'):\n\n{context}"
        title_response = await chat.send_message(UserMessage(text=title_prompt))
        ai_title = str(title_response).strip().strip('"').strip("'") if title_response else ""
        
        if ai_title and len(ai_title) > 2 and len(ai_title) < 60:
            await db.recipes.update_one({"id": recipe_id}, {"$set": {"name": ai_title}})
            logger.info(f"Auto-title for {recipe_id}: {ai_title}")
        else:
            ai_title = current_name  # Fallback
        
        # Step 2: Get FREE cover image from Foodish API
        import httpx as httpx_client
        
        # Map dish name to food category
        food_categories = {
            'pasta': ['pasta', 'spaghetti', 'penne', 'rigatoni', 'carbonara', 'amatriciana', 'cacio', 'gricia', 'bolognese', 'lasagna', 'tagliatelle', 'fettuccine', 'linguine', 'bucatini'],
            'pizza': ['pizza', 'margherita', 'focaccia'],
            'rice': ['riso', 'risotto', 'arancin'],
            'dessert': ['tiramisu', 'tiramisù', 'torta', 'dolce', 'panna cotta', 'cannoli', 'biscott', 'gelato', 'crostata', 'cioccolat'],
            'burger': ['burger', 'hamburger', 'panino'],
        }
        
        title_lower = ai_title.lower()
        category = 'pasta'  # default
        for cat, keywords in food_categories.items():
            if any(kw in title_lower for kw in keywords):
                category = cat
                break
        
        try:
            async with httpx_client.AsyncClient() as http:
                # Get random food image from Foodish (100% free)
                food_res = await http.get(f'https://foodish-api.com/api/images/{category}', timeout=10)
                if food_res.status_code == 200:
                    image_url = food_res.json().get('image', '')
                    if image_url:
                        # Download the image and convert to base64
                        img_res = await http.get(image_url, timeout=15)
                        if img_res.status_code == 200 and 'image' in img_res.headers.get('content-type', ''):
                            import base64
                            img_b64 = base64.b64encode(img_res.content).decode('utf-8')
                            thumbnail_url = f"data:image/jpeg;base64,{img_b64}"
                            await db.recipes.update_one({"id": recipe_id}, {"$set": {"thumbnail_url": thumbnail_url}})
                            logger.info(f"Auto-cover (Foodish/{category}) for {recipe_id}")
        except Exception as img_err:
            logger.error(f"Foodish cover error: {img_err}")
        
    except Exception as e:
        logger.error(f"Auto-generate error for {recipe_id}: {e}")

# ================= VIDEO DOWNLOAD & THUMBNAIL =================

THUMB_DIR = ROOT_DIR / "thumbnails"
THUMB_DIR.mkdir(exist_ok=True)
DOWNLOAD_DIR = ROOT_DIR / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)

def generate_thumbnail_from_url(source_url: str, output_path: str) -> bool:
    """Download video and extract a frame as thumbnail using ffmpeg"""
    try:
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as tmp:
            tmp_path = tmp.name
        ydl_opts = {'quiet': True, 'no_warnings': True, 'format': 'worst[ext=mp4]/worst', 'outtmpl': tmp_path}
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([source_url])
        # Extract frame at 2 seconds
        cmd = ['ffmpeg', '-i', tmp_path, '-ss', '2', '-vframes', '1', '-q:v', '3', '-y', output_path]
        result = subprocess.run(cmd, capture_output=True, timeout=30)
        try:
            os.unlink(tmp_path)
        except Exception:
            pass
        return result.returncode == 0 and os.path.exists(output_path)
    except Exception as e:
        logger.error(f"Thumbnail error: {e}")
        return False

def download_video_to_file(source_url: str, output_path: str) -> bool:
    """Download video to file"""
    ydl_opts = {'quiet': True, 'no_warnings': True, 'format': 'best[ext=mp4]/best', 'outtmpl': output_path}
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([source_url])
        return os.path.exists(output_path)
    except Exception as e:
        logger.error(f"Download error: {e}")
        return False

@api_router.post("/recipes/{recipe_id}/generate-thumbnail")
async def generate_thumbnail(recipe_id: str, request: Request):
    """Generate thumbnail - try auto-extract, or accept user upload"""
    user = await get_current_user(request)
    recipe = await db.recipes.find_one({"id": recipe_id, "user_id": user["user_id"]}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")
    
    # Check if user uploaded a base64 image
    try:
        body = await request.json()
        if body.get("image_base64"):
            thumb_url = body["image_base64"]
            await db.recipes.update_one({"id": recipe_id}, {"$set": {"thumbnail_url": thumb_url}})
            return {"success": True, "thumbnail_url": thumb_url}
    except Exception:
        pass
    
    # Try auto-extract from video
    thumb_path = str(THUMB_DIR / f"{recipe_id}.jpg")
    loop = asyncio.get_event_loop()
    success = await loop.run_in_executor(executor, generate_thumbnail_from_url, recipe["source_url"], thumb_path)
    
    if success:
        import base64
        with open(thumb_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
        thumb_data_url = f"data:image/jpeg;base64,{b64}"
        await db.recipes.update_one({"id": recipe_id}, {"$set": {"thumbnail_url": thumb_data_url}})
        return {"success": True, "thumbnail_url": thumb_data_url}
    
    return {"success": False, "error": "Estrazione automatica non riuscita. Usa 'Scegli dalla Galleria' per caricare uno screenshot."}

@api_router.post("/recipes/{recipe_id}/download-video")
async def download_video_endpoint(recipe_id: str, request: Request):
    """Get download links for the video"""
    user = await get_current_user(request)
    recipe = await db.recipes.find_one({"id": recipe_id, "user_id": user["user_id"]}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")
    
    source_url = recipe.get("source_url", "")
    platform = recipe.get("platform", "")
    encoded_url = source_url.replace("&", "%26")
    
    # Generate download service URLs
    download_links = []
    if platform == "instagram":
        download_links = [
            {"name": "SnapInsta", "url": f"https://snapinst.to/?url={encoded_url}", "icon": "download"},
            {"name": "SaveInsta", "url": f"https://saveinsta.io/?url={encoded_url}", "icon": "cloud-download"},
            {"name": "Apri Instagram", "url": source_url, "icon": "logo-instagram"},
        ]
    elif platform == "facebook":
        download_links = [
            {"name": "FBDown", "url": f"https://fbdown.net/?url={encoded_url}", "icon": "download"},
            {"name": "SaveFrom", "url": f"https://savefrom.net/?url={encoded_url}", "icon": "cloud-download"},
            {"name": "Apri Facebook", "url": source_url, "icon": "logo-facebook"},
        ]
    else:
        download_links = [{"name": "Apri link", "url": source_url, "icon": "open-outline"}]
    
    return {"success": True, "download_links": download_links, "source_url": source_url}

@api_router.get("/videos/{filename}")
async def serve_video(filename: str):
    """Serve downloaded video file"""
    file_path = DOWNLOAD_DIR / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Video non trovato")
    return FileResponse(str(file_path), media_type="video/mp4", filename=filename)

# ================= VIDEO COMPRESSION =================

async def compress_old_videos(user_id: str):
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
                    success = await loop.run_in_executor(executor, download_video_file, recipe['source_url'], inp)
                    if success and os.path.exists(inp):
                        compressed = await loop.run_in_executor(executor, compress_video_file, inp, out)
                        if compressed and os.path.exists(out):
                            await db.recipes.update_one({"id": recipe['id']}, {"$set": {"video_compressed": True, "local_video_path": out}})
                        else:
                            await db.recipes.update_one({"id": recipe['id']}, {"$set": {"video_compressed": True}})
            except Exception:
                await db.recipes.update_one({"id": recipe['id']}, {"$set": {"video_compressed": True}})
    except Exception as e:
        logger.error(f"Compression error: {e}")

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
