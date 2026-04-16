from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, timezone
import yt_dlp
import asyncio
from concurrent.futures import ThreadPoolExecutor
import subprocess
import tempfile

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Thread pool for blocking operations
executor = ThreadPoolExecutor(max_workers=3)

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Video storage directory
VIDEO_DIR = ROOT_DIR / "videos"
VIDEO_DIR.mkdir(exist_ok=True)

# ================= MODELS =================

class UserProfile(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class UserProfileCreate(BaseModel):
    name: str

class Folder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

class FolderCreate(BaseModel):
    name: str

class FolderUpdate(BaseModel):
    name: str

class Subfolder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
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
    transcription_status: str = "none"  # none, pending, done, error
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

class TranscribeRequest(BaseModel):
    recipe_id: str

class SearchQuery(BaseModel):
    query: str

# ================= VIDEO EXTRACTION =================

def detect_platform(url: str) -> str:
    url_lower = url.lower()
    if 'instagram.com' in url_lower or 'instagr.am' in url_lower:
        return 'instagram'
    elif 'facebook.com' in url_lower or 'fb.com' in url_lower or 'fb.watch' in url_lower:
        return 'facebook'
    return 'unknown'

def extract_video_info(url: str) -> dict:
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
        'skip_download': True,
        'format': 'best[ext=mp4]/best',
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
            video_url = info.get('url', '')
            if not video_url and info.get('formats'):
                for fmt in reversed(info.get('formats', [])):
                    if fmt.get('url'):
                        video_url = fmt['url']
                        break
            return {
                'success': True,
                'caption': info.get('description', '') or info.get('title', ''),
                'video_url': video_url,
                'thumbnail_url': info.get('thumbnail', ''),
                'title': info.get('title', ''),
            }
    except Exception as e:
        logger.error(f"Error extracting video: {str(e)}")
        return {'success': False, 'error': str(e)}

def download_video_for_transcription(url: str, output_path: str) -> bool:
    """Download video audio for transcription - optimized for speed"""
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'format': 'worstaudio/worst',
        'outtmpl': output_path,
        'postprocessors': [{
            'key': 'FFmpegExtractAudio',
            'preferredcodec': 'mp3',
            'preferredquality': '48',
        }],
        'socket_timeout': 30,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        
        # Trim to 3 min max and downsample for Whisper (16kHz mono)
        mp3_path = output_path + '.mp3'
        if os.path.exists(mp3_path):
            trimmed = output_path + '_fast.mp3'
            try:
                cmd = ['ffmpeg', '-i', mp3_path, '-t', '180', '-ar', '16000', '-ac', '1', '-b:a', '48k', '-y', trimmed]
                subprocess.run(cmd, capture_output=True, timeout=20)
                if os.path.exists(trimmed) and os.path.getsize(trimmed) > 0:
                    os.replace(trimmed, mp3_path)
            except Exception:
                pass
        return True
    except Exception as e:
        logger.error(f"Error downloading audio: {str(e)}")
        return False

def compress_video_file(input_path: str, output_path: str) -> bool:
    """Compress video using FFmpeg"""
    try:
        cmd = [
            'ffmpeg', '-i', input_path,
            '-vcodec', 'libx264', '-crf', '28',
            '-preset', 'fast',
            '-acodec', 'aac', '-b:a', '64k',
            '-y', output_path
        ]
        result = subprocess.run(cmd, capture_output=True, timeout=120)
        return result.returncode == 0
    except Exception as e:
        logger.error(f"Error compressing video: {str(e)}")
        return False

def download_video_file(url: str, output_path: str) -> bool:
    """Download video file"""
    ydl_opts = {
        'quiet': True,
        'no_warnings': True,
        'format': 'best[ext=mp4]/best',
        'outtmpl': output_path,
    }
    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([url])
        return True
    except Exception as e:
        logger.error(f"Error downloading video: {str(e)}")
        return False

# ================= API ROUTES =================

@api_router.get("/")
async def root():
    return {"message": "Il Ricettario - API"}

# ================= USER PROFILE =================

@api_router.post("/profile", response_model=UserProfile)
async def create_or_update_profile(profile: UserProfileCreate):
    existing = await db.profiles.find_one({}, {"_id": 0})
    if existing:
        await db.profiles.update_one({}, {"$set": {"name": profile.name}})
        updated = await db.profiles.find_one({}, {"_id": 0})
        return UserProfile(**updated)
    else:
        profile_obj = UserProfile(name=profile.name)
        await db.profiles.insert_one(profile_obj.dict())
        return profile_obj

@api_router.get("/profile")
async def get_profile():
    profile = await db.profiles.find_one({}, {"_id": 0})
    if profile:
        return UserProfile(**profile)
    return None

# ================= EXTRACT =================

@api_router.post("/extract", response_model=ExtractResponse)
async def extract_video(request: ExtractRequest):
    url = request.url.strip()
    platform = detect_platform(url)
    if platform == 'unknown':
        return ExtractResponse(success=False, error="URL non supportato. Usa link di Instagram o Facebook.")
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, extract_video_info, url)
    if result.get('success'):
        return ExtractResponse(
            success=True, platform=platform,
            caption=result.get('caption', ''),
            video_url=result.get('video_url', ''),
            thumbnail_url=result.get('thumbnail_url', '')
        )
    else:
        return ExtractResponse(success=False, platform=platform, error=result.get('error', 'Errore'))

# ================= FOLDERS =================

@api_router.post("/folders", response_model=Folder)
async def create_folder(folder: FolderCreate):
    folder_obj = Folder(name=folder.name)
    await db.folders.insert_one(folder_obj.dict())
    return folder_obj

@api_router.get("/folders", response_model=List[Folder])
async def get_folders():
    folders = await db.folders.find({}, {"_id": 0}).sort("name", 1).to_list(1000)
    return [Folder(**f) for f in folders]

@api_router.get("/folders/{folder_id}", response_model=Folder)
async def get_folder(folder_id: str):
    folder = await db.folders.find_one({"id": folder_id}, {"_id": 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    return Folder(**folder)

@api_router.put("/folders/{folder_id}", response_model=Folder)
async def update_folder(folder_id: str, update: FolderUpdate):
    folder = await db.folders.find_one({"id": folder_id}, {"_id": 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    await db.folders.update_one({"id": folder_id}, {"$set": {"name": update.name, "updated_at": datetime.now(timezone.utc)}})
    updated = await db.folders.find_one({"id": folder_id}, {"_id": 0})
    return Folder(**updated)

@api_router.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str):
    folder = await db.folders.find_one({"id": folder_id}, {"_id": 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    await db.subfolders.delete_many({"folder_id": folder_id})
    await db.recipes.delete_many({"folder_id": folder_id})
    await db.folders.delete_one({"id": folder_id})
    return {"message": "Cartella eliminata"}

# ================= SUBFOLDERS =================

@api_router.post("/subfolders", response_model=Subfolder)
async def create_subfolder(subfolder: SubfolderCreate):
    folder = await db.folders.find_one({"id": subfolder.folder_id}, {"_id": 0})
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella principale non trovata")
    subfolder_obj = Subfolder(folder_id=subfolder.folder_id, name=subfolder.name)
    await db.subfolders.insert_one(subfolder_obj.dict())
    return subfolder_obj

@api_router.get("/subfolders", response_model=List[Subfolder])
async def get_subfolders(folder_id: Optional[str] = None):
    query = {}
    if folder_id:
        query["folder_id"] = folder_id
    subfolders = await db.subfolders.find(query, {"_id": 0}).sort("name", 1).to_list(1000)
    return [Subfolder(**s) for s in subfolders]

@api_router.get("/subfolders/{subfolder_id}", response_model=Subfolder)
async def get_subfolder(subfolder_id: str):
    subfolder = await db.subfolders.find_one({"id": subfolder_id}, {"_id": 0})
    if not subfolder:
        raise HTTPException(status_code=404, detail="Sottocartella non trovata")
    return Subfolder(**subfolder)

@api_router.put("/subfolders/{subfolder_id}", response_model=Subfolder)
async def update_subfolder(subfolder_id: str, update: SubfolderUpdate):
    subfolder = await db.subfolders.find_one({"id": subfolder_id}, {"_id": 0})
    if not subfolder:
        raise HTTPException(status_code=404, detail="Sottocartella non trovata")
    await db.subfolders.update_one({"id": subfolder_id}, {"$set": {"name": update.name, "updated_at": datetime.now(timezone.utc)}})
    updated = await db.subfolders.find_one({"id": subfolder_id}, {"_id": 0})
    return Subfolder(**updated)

@api_router.delete("/subfolders/{subfolder_id}")
async def delete_subfolder(subfolder_id: str):
    subfolder = await db.subfolders.find_one({"id": subfolder_id}, {"_id": 0})
    if not subfolder:
        raise HTTPException(status_code=404, detail="Sottocartella non trovata")
    await db.recipes.delete_many({"subfolder_id": subfolder_id})
    await db.subfolders.delete_one({"id": subfolder_id})
    return {"message": "Sottocartella eliminata"}

# ================= RECIPES =================

@api_router.post("/recipes", response_model=Recipe)
async def create_recipe(recipe: RecipeCreate):
    url = recipe.source_url.strip()
    platform = detect_platform(url)
    if platform == 'unknown':
        raise HTTPException(status_code=400, detail="URL non supportato.")

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, extract_video_info, url)
    
    caption = recipe.manual_caption if recipe.manual_caption else (result.get('caption', '') if result.get('success') else '')
    
    recipe_obj = Recipe(
        name=recipe.name,
        folder_id=recipe.folder_id,
        subfolder_id=recipe.subfolder_id,
        source_url=url,
        platform=platform,
        caption=caption,
        video_url=result.get('video_url', '') if result.get('success') else '',
        thumbnail_url=result.get('thumbnail_url', '') if result.get('success') else '',
        notes=recipe.notes or '',
    )
    await db.recipes.insert_one(recipe_obj.dict())

    # Check if we need to compress videos (every 3 recipes)
    total_recipes = await db.recipes.count_documents({})
    if total_recipes > 0 and total_recipes % 3 == 0:
        asyncio.create_task(compress_old_videos())

    return recipe_obj

@api_router.get("/recipes", response_model=List[Recipe])
async def get_recipes(folder_id: Optional[str] = None, subfolder_id: Optional[str] = None, search: Optional[str] = None):
    query = {}
    if folder_id:
        query["folder_id"] = folder_id
    if subfolder_id:
        query["subfolder_id"] = subfolder_id
    if search:
        search_regex = {"$regex": search, "$options": "i"}
        query["$or"] = [
            {"name": search_regex},
            {"caption": search_regex},
            {"notes": search_regex},
            {"transcription": search_regex},
        ]
    recipes = await db.recipes.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [Recipe(**r) for r in recipes]

@api_router.get("/recipes/count")
async def get_recipes_count():
    count = await db.recipes.count_documents({})
    return {"count": count}

@api_router.get("/recipes/random")
async def get_random_recipes(count: int = 3):
    """Get random recipes for 'What do we cook today?' section"""
    pipeline = [
        {"$sample": {"size": count}},
        {"$project": {"_id": 0}}
    ]
    recipes = await db.recipes.aggregate(pipeline).to_list(count)
    return [Recipe(**r) for r in recipes] if recipes else []

@api_router.get("/recipes/{recipe_id}", response_model=Recipe)
async def get_recipe(recipe_id: str):
    recipe = await db.recipes.find_one({"id": recipe_id}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")
    return Recipe(**recipe)

@api_router.put("/recipes/{recipe_id}", response_model=Recipe)
async def update_recipe(recipe_id: str, update: RecipeUpdate):
    recipe = await db.recipes.find_one({"id": recipe_id}, {"_id": 0})
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
    updated = await db.recipes.find_one({"id": recipe_id}, {"_id": 0})
    return Recipe(**updated)

@api_router.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str):
    recipe = await db.recipes.find_one({"id": recipe_id}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")
    # Clean up local video file if exists
    if recipe.get("local_video_path"):
        try:
            p = Path(recipe["local_video_path"])
            if p.exists():
                p.unlink()
        except Exception:
            pass
    await db.recipes.delete_one({"id": recipe_id})
    return {"message": "Ricetta eliminata"}

# ================= AI RECIPE GENERATION =================

@api_router.post("/recipes/{recipe_id}/generate-recipe")
async def generate_recipe(recipe_id: str):
    """Use AI to generate structured recipe from caption/title"""
    recipe = await db.recipes.find_one({"id": recipe_id}, {"_id": 0})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")
    
    # Mark as pending
    await db.recipes.update_one({"id": recipe_id}, {"$set": {"transcription_status": "pending"}})
    
    # Run AI generation
    asyncio.create_task(do_ai_recipe_generation(recipe_id, recipe))
    
    return {"message": "Generazione ricetta avviata", "status": "pending"}

async def do_ai_recipe_generation(recipe_id: str, recipe: dict):
    """Generate structured recipe using GPT from caption/name/URL"""
    try:
        from emergentintegrations.llm.chat import LlmChat, UserMessage
        
        chat = LlmChat(
            api_key=os.getenv("EMERGENT_LLM_KEY"),
            session_id=f"recipe-{recipe_id}",
            system_message="Sei un esperto chef italiano. Genera ricette strutturate in italiano con ingredienti e procedimento. Se ricevi solo il nome di un piatto senza caption, genera comunque la ricetta completa basandoti sulla tua conoscenza. Rispondi SOLO con la ricetta, senza preamboli."
        ).with_model("gemini", "gemini-2.5-flash")
        
        # Build context from whatever info we have
        context_parts = []
        if recipe.get("name"):
            context_parts.append(f"Nome piatto: {recipe['name']}")
        if recipe.get("caption"):
            context_parts.append(f"Descrizione dal video: {recipe['caption']}")
        if recipe.get("source_url"):
            context_parts.append(f"Fonte: {recipe['source_url']}")
        
        context = "\n".join(context_parts) if context_parts else "Ricetta italiana generica"
        
        prompt = f"""Basandoti su queste informazioni di un video di ricetta, genera la ricetta completa strutturata:

{context}

Formato richiesto:
🍽️ NOME PIATTO

📝 INGREDIENTI:
- (lista ingredienti con quantità)

👨‍🍳 PROCEDIMENTO:
1. (passi numerati)

⏱️ TEMPO: (tempo stimato)
👥 PORZIONI: (numero porzioni)

💡 CONSIGLI: (1-2 consigli utili)"""

        user_message = UserMessage(text=prompt)
        response = await chat.send_message(user_message)
        
        transcription_text = response if isinstance(response, str) else str(response)
        
        if not transcription_text or len(transcription_text) < 20:
            transcription_text = "Non è stato possibile generare la ricetta."
            status = "error"
        else:
            status = "done"
        
        await db.recipes.update_one({"id": recipe_id}, {
            "$set": {"transcription_status": status, "transcription": transcription_text}
        })
        logger.info(f"AI recipe generation completed for {recipe_id}")
        
    except Exception as e:
        logger.error(f"AI recipe generation error for {recipe_id}: {str(e)}")
        await db.recipes.update_one({"id": recipe_id}, {
            "$set": {"transcription_status": "error", "transcription": f"Errore AI: {str(e)}"}
        })

# ================= VIDEO COMPRESSION =================

async def compress_old_videos():
    """Compress videos that haven't been compressed yet"""
    try:
        uncompressed = await db.recipes.find(
            {"video_compressed": False, "video_url": {"$ne": ""}},
            {"_id": 0}
        ).sort("created_at", 1).to_list(10)
        
        loop = asyncio.get_event_loop()
        
        for recipe in uncompressed:
            try:
                with tempfile.TemporaryDirectory() as tmpdir:
                    input_path = os.path.join(tmpdir, "input.mp4")
                    output_path = os.path.join(str(VIDEO_DIR), f"{recipe['id']}_compressed.mp4")
                    
                    # Download video
                    success = await loop.run_in_executor(
                        executor, download_video_file, recipe['source_url'], input_path
                    )
                    
                    if success and os.path.exists(input_path):
                        # Compress
                        compressed = await loop.run_in_executor(
                            executor, compress_video_file, input_path, output_path
                        )
                        
                        if compressed and os.path.exists(output_path):
                            original_size = os.path.getsize(input_path)
                            compressed_size = os.path.getsize(output_path)
                            logger.info(f"Compressed {recipe['id']}: {original_size} -> {compressed_size}")
                            
                            await db.recipes.update_one(
                                {"id": recipe['id']},
                                {"$set": {
                                    "video_compressed": True,
                                    "local_video_path": output_path
                                }}
                            )
                        else:
                            await db.recipes.update_one(
                                {"id": recipe['id']},
                                {"$set": {"video_compressed": True}}
                            )
            except Exception as e:
                logger.error(f"Error compressing video {recipe['id']}: {str(e)}")
                await db.recipes.update_one(
                    {"id": recipe['id']},
                    {"$set": {"video_compressed": True}}
                )
                
    except Exception as e:
        logger.error(f"Error in compress_old_videos: {str(e)}")

@api_router.get("/compression/status")
async def compression_status():
    total = await db.recipes.count_documents({"video_url": {"$ne": ""}})
    compressed = await db.recipes.count_documents({"video_compressed": True})
    return {"total_with_video": total, "compressed": compressed, "pending": total - compressed}

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
