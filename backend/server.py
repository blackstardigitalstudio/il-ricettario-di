from fastapi import FastAPI, APIRouter, HTTPException, BackgroundTasks
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime
import yt_dlp
import asyncio
from concurrent.futures import ThreadPoolExecutor

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Thread pool for yt-dlp operations
executor = ThreadPoolExecutor(max_workers=3)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ================= MODELS =================

class Folder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class FolderCreate(BaseModel):
    name: str

class FolderUpdate(BaseModel):
    name: str

class Subfolder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    folder_id: str
    name: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

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
    platform: str  # instagram, facebook
    caption: str = ""
    video_url: str = ""
    thumbnail_url: str = ""
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

class RecipeCreate(BaseModel):
    name: str
    folder_id: Optional[str] = None
    subfolder_id: Optional[str] = None
    source_url: str
    manual_caption: Optional[str] = None

class RecipeUpdate(BaseModel):
    name: Optional[str] = None
    folder_id: Optional[str] = None
    subfolder_id: Optional[str] = None
    caption: Optional[str] = None

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
    """Detect the platform from URL"""
    url_lower = url.lower()
    if 'instagram.com' in url_lower or 'instagr.am' in url_lower:
        return 'instagram'
    elif 'facebook.com' in url_lower or 'fb.com' in url_lower or 'fb.watch' in url_lower:
        return 'facebook'
    return 'unknown'

def extract_video_info(url: str) -> dict:
    """Extract video info using yt-dlp"""
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
            
            # Get the best video URL
            video_url = info.get('url', '')
            if not video_url and info.get('formats'):
                # Try to get best mp4 format
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
        return {
            'success': False,
            'error': str(e)
        }

# ================= API ROUTES =================

@api_router.get("/")
async def root():
    return {"message": "Recipe Manager API"}

# Extract endpoint
@api_router.post("/extract", response_model=ExtractResponse)
async def extract_video(request: ExtractRequest):
    """Extract video info from Instagram or Facebook URL"""
    url = request.url.strip()
    platform = detect_platform(url)
    
    if platform == 'unknown':
        return ExtractResponse(
            success=False,
            error="URL non supportato. Usa link di Instagram o Facebook."
        )
    
    # Run extraction in thread pool to not block
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, extract_video_info, url)
    
    if result.get('success'):
        return ExtractResponse(
            success=True,
            platform=platform,
            caption=result.get('caption', ''),
            video_url=result.get('video_url', ''),
            thumbnail_url=result.get('thumbnail_url', '')
        )
    else:
        return ExtractResponse(
            success=False,
            platform=platform,
            error=result.get('error', 'Errore durante l\'estrazione')
        )

# ================= FOLDERS =================

@api_router.post("/folders", response_model=Folder)
async def create_folder(folder: FolderCreate):
    """Create a new folder"""
    folder_obj = Folder(name=folder.name)
    await db.folders.insert_one(folder_obj.dict())
    return folder_obj

@api_router.get("/folders", response_model=List[Folder])
async def get_folders():
    """Get all folders"""
    folders = await db.folders.find().sort("name", 1).to_list(1000)
    return [Folder(**f) for f in folders]

@api_router.get("/folders/{folder_id}", response_model=Folder)
async def get_folder(folder_id: str):
    """Get a specific folder"""
    folder = await db.folders.find_one({"id": folder_id})
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    return Folder(**folder)

@api_router.put("/folders/{folder_id}", response_model=Folder)
async def update_folder(folder_id: str, update: FolderUpdate):
    """Update a folder"""
    folder = await db.folders.find_one({"id": folder_id})
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    
    update_data = {"name": update.name, "updated_at": datetime.utcnow()}
    await db.folders.update_one({"id": folder_id}, {"$set": update_data})
    
    updated = await db.folders.find_one({"id": folder_id})
    return Folder(**updated)

@api_router.delete("/folders/{folder_id}")
async def delete_folder(folder_id: str):
    """Delete a folder and all its subfolders and recipes"""
    folder = await db.folders.find_one({"id": folder_id})
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella non trovata")
    
    # Delete all subfolders
    await db.subfolders.delete_many({"folder_id": folder_id})
    # Delete all recipes in folder
    await db.recipes.delete_many({"folder_id": folder_id})
    # Delete folder
    await db.folders.delete_one({"id": folder_id})
    
    return {"message": "Cartella eliminata con successo"}

# ================= SUBFOLDERS =================

@api_router.post("/subfolders", response_model=Subfolder)
async def create_subfolder(subfolder: SubfolderCreate):
    """Create a new subfolder"""
    # Verify folder exists
    folder = await db.folders.find_one({"id": subfolder.folder_id})
    if not folder:
        raise HTTPException(status_code=404, detail="Cartella principale non trovata")
    
    subfolder_obj = Subfolder(folder_id=subfolder.folder_id, name=subfolder.name)
    await db.subfolders.insert_one(subfolder_obj.dict())
    return subfolder_obj

@api_router.get("/subfolders", response_model=List[Subfolder])
async def get_subfolders(folder_id: Optional[str] = None):
    """Get subfolders, optionally filtered by folder_id"""
    query = {}
    if folder_id:
        query["folder_id"] = folder_id
    subfolders = await db.subfolders.find(query).sort("name", 1).to_list(1000)
    return [Subfolder(**s) for s in subfolders]

@api_router.get("/subfolders/{subfolder_id}", response_model=Subfolder)
async def get_subfolder(subfolder_id: str):
    """Get a specific subfolder"""
    subfolder = await db.subfolders.find_one({"id": subfolder_id})
    if not subfolder:
        raise HTTPException(status_code=404, detail="Sottocartella non trovata")
    return Subfolder(**subfolder)

@api_router.put("/subfolders/{subfolder_id}", response_model=Subfolder)
async def update_subfolder(subfolder_id: str, update: SubfolderUpdate):
    """Update a subfolder"""
    subfolder = await db.subfolders.find_one({"id": subfolder_id})
    if not subfolder:
        raise HTTPException(status_code=404, detail="Sottocartella non trovata")
    
    update_data = {"name": update.name, "updated_at": datetime.utcnow()}
    await db.subfolders.update_one({"id": subfolder_id}, {"$set": update_data})
    
    updated = await db.subfolders.find_one({"id": subfolder_id})
    return Subfolder(**updated)

@api_router.delete("/subfolders/{subfolder_id}")
async def delete_subfolder(subfolder_id: str):
    """Delete a subfolder and all its recipes"""
    subfolder = await db.subfolders.find_one({"id": subfolder_id})
    if not subfolder:
        raise HTTPException(status_code=404, detail="Sottocartella non trovata")
    
    # Delete all recipes in subfolder
    await db.recipes.delete_many({"subfolder_id": subfolder_id})
    # Delete subfolder
    await db.subfolders.delete_one({"id": subfolder_id})
    
    return {"message": "Sottocartella eliminata con successo"}

# ================= RECIPES =================

@api_router.post("/recipes", response_model=Recipe)
async def create_recipe(recipe: RecipeCreate):
    """Create a new recipe with video extraction"""
    url = recipe.source_url.strip()
    platform = detect_platform(url)
    
    if platform == 'unknown':
        raise HTTPException(status_code=400, detail="URL non supportato. Usa link di Instagram o Facebook.")
    
    # Extract video info
    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(executor, extract_video_info, url)
    
    # Use manual caption if provided, otherwise use extracted caption
    caption = recipe.manual_caption if recipe.manual_caption else (result.get('caption', '') if result.get('success') else '')
    
    recipe_obj = Recipe(
        name=recipe.name,
        folder_id=recipe.folder_id,
        subfolder_id=recipe.subfolder_id,
        source_url=url,
        platform=platform,
        caption=caption,
        video_url=result.get('video_url', '') if result.get('success') else '',
        thumbnail_url=result.get('thumbnail_url', '') if result.get('success') else ''
    )
    
    await db.recipes.insert_one(recipe_obj.dict())
    return recipe_obj

@api_router.get("/recipes", response_model=List[Recipe])
async def get_recipes(
    folder_id: Optional[str] = None,
    subfolder_id: Optional[str] = None
):
    """Get recipes, optionally filtered by folder or subfolder"""
    query = {}
    if folder_id:
        query["folder_id"] = folder_id
    if subfolder_id:
        query["subfolder_id"] = subfolder_id
    
    recipes = await db.recipes.find(query).sort("created_at", -1).to_list(1000)
    return [Recipe(**r) for r in recipes]

@api_router.get("/recipes/{recipe_id}", response_model=Recipe)
async def get_recipe(recipe_id: str):
    """Get a specific recipe"""
    recipe = await db.recipes.find_one({"id": recipe_id})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")
    return Recipe(**recipe)

@api_router.put("/recipes/{recipe_id}", response_model=Recipe)
async def update_recipe(recipe_id: str, update: RecipeUpdate):
    """Update a recipe"""
    recipe = await db.recipes.find_one({"id": recipe_id})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")
    
    update_data = {"updated_at": datetime.utcnow()}
    if update.name is not None:
        update_data["name"] = update.name
    if update.folder_id is not None:
        update_data["folder_id"] = update.folder_id
    if update.subfolder_id is not None:
        update_data["subfolder_id"] = update.subfolder_id
    if update.caption is not None:
        update_data["caption"] = update.caption
    
    await db.recipes.update_one({"id": recipe_id}, {"$set": update_data})
    
    updated = await db.recipes.find_one({"id": recipe_id})
    return Recipe(**updated)

@api_router.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str):
    """Delete a recipe"""
    recipe = await db.recipes.find_one({"id": recipe_id})
    if not recipe:
        raise HTTPException(status_code=404, detail="Ricetta non trovata")
    
    await db.recipes.delete_one({"id": recipe_id})
    return {"message": "Ricetta eliminata con successo"}

# Include the router in the main app
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
