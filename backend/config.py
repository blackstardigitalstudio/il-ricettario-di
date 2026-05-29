"""Central configuration, env loading, paths, logger, LLM/IG keys."""
import os
import logging
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
from dotenv import load_dotenv
from cryptography.fernet import Fernet

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Logger
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("ricettario")

# Directories
VIDEO_DIR = ROOT_DIR / "videos"
THUMB_DIR = ROOT_DIR / "thumbnails"
DOWNLOAD_DIR = ROOT_DIR / "downloads"
IG_COOKIE_DIR = ROOT_DIR / "ig_cookies"
for _d in (VIDEO_DIR, THUMB_DIR, DOWNLOAD_DIR, IG_COOKIE_DIR):
    _d.mkdir(exist_ok=True)

# Shared executor for blocking I/O (yt-dlp, ffmpeg, etc.)
executor = ThreadPoolExecutor(max_workers=3)

# LLM key (Google Gemini, free tier — get one at https://aistudio.google.com/apikey)
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Instagram session encryption
_IG_KEY = os.getenv("IG_COOKIE_KEY", "")
IG_COOKIE_KEY = _IG_KEY.encode() if _IG_KEY else None
IG_CIPHER = Fernet(IG_COOKIE_KEY) if IG_COOKIE_KEY else None
IG_RATE_LIMIT_PER_HOUR = 20

# Mongo
MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']
