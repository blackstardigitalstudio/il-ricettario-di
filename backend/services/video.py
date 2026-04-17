"""yt-dlp extraction, ffmpeg helpers and thumbnail extraction."""
import os
import tempfile
import subprocess
from typing import Optional
import yt_dlp
import httpx

from config import logger


def detect_platform(url: str) -> str:
    u = url.lower()
    if 'instagram.com' in u or 'instagr.am' in u:
        return 'instagram'
    if 'facebook.com' in u or 'fb.com' in u or 'fb.watch' in u:
        return 'facebook'
    return 'unknown'


def extract_video_info(url: str) -> dict:
    opts = {'quiet': True, 'no_warnings': True, 'extract_flat': False,
            'skip_download': True, 'format': 'best[ext=mp4]/best'}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
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
            }
    except Exception as e:
        return {'success': False, 'error': str(e)}


def ytdlp_info(url: str, cookiefile: Optional[str] = None) -> dict:
    opts = {'quiet': True, 'no_warnings': True, 'skip_download': True, 'format': 'best'}
    if cookiefile:
        opts['cookiefile'] = cookiefile
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            return ydl.extract_info(url, download=False) or {}
    except Exception as e:
        logger.warning(f"yt-dlp info failed: {e}")
        return {}


def download_video_file(url: str, output_path: str) -> bool:
    opts = {'quiet': True, 'no_warnings': True, 'format': 'best[ext=mp4]/best', 'outtmpl': output_path}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])
        return os.path.exists(output_path)
    except Exception as e:
        logger.error(f"Download error: {e}")
        return False


def compress_video_file(input_path: str, output_path: str) -> bool:
    try:
        cmd = ['ffmpeg', '-i', input_path, '-vcodec', 'libx264', '-crf', '28',
               '-preset', 'fast', '-acodec', 'aac', '-b:a', '64k', '-y', output_path]
        r = subprocess.run(cmd, capture_output=True, timeout=120)
        return r.returncode == 0
    except Exception:
        return False


def extract_frame_from_video_url(video_url: str) -> Optional[bytes]:
    """Stream-download (up to 20MB) and extract a frame at 1.5s via ffmpeg."""
    try:
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as tmp_vid:
            vid_path = tmp_vid.name
        with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp_img:
            img_path = tmp_img.name
        with httpx.Client(timeout=60, follow_redirects=True) as c:
            with c.stream('GET', video_url, headers={'User-Agent': 'Mozilla/5.0'}) as resp:
                if resp.status_code != 200:
                    return None
                written = 0
                max_bytes = 20 * 1024 * 1024
                with open(vid_path, 'wb') as f:
                    for chunk in resp.iter_bytes(chunk_size=65536):
                        f.write(chunk)
                        written += len(chunk)
                        if written >= max_bytes:
                            break
        cmd = ['ffmpeg', '-ss', '1.5', '-i', vid_path, '-vframes', '1', '-q:v', '3', '-y', img_path]
        subprocess.run(cmd, capture_output=True, timeout=30)
        data = None
        if os.path.exists(img_path) and os.path.getsize(img_path) > 1000:
            with open(img_path, 'rb') as f:
                data = f.read()
        for p in (vid_path, img_path):
            try: os.unlink(p)
            except Exception: pass
        return data
    except Exception as e:
        logger.warning(f"frame extract err: {e}")
        return None


def generate_thumbnail_from_url(source_url: str, output_path: str) -> bool:
    """Full yt-dlp download + ffmpeg frame extraction (used by on-demand endpoint)."""
    try:
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as tmp:
            tmp_path = tmp.name
        opts = {'quiet': True, 'no_warnings': True, 'format': 'worst[ext=mp4]/worst', 'outtmpl': tmp_path}
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([source_url])
        cmd = ['ffmpeg', '-i', tmp_path, '-ss', '2', '-vframes', '1', '-q:v', '3', '-y', output_path]
        r = subprocess.run(cmd, capture_output=True, timeout=30)
        try: os.unlink(tmp_path)
        except Exception: pass
        return r.returncode == 0 and os.path.exists(output_path)
    except Exception as e:
        logger.error(f"Thumbnail error: {e}")
        return False
