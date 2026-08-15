"""yt-dlp extraction, ffmpeg helpers and thumbnail extraction."""
import os
import re
import html as html_lib
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
    if 'youtube.com' in u or 'youtu.be' in u or 'youtube-nocookie.com' in u:
        return 'youtube'
    return 'unknown'


def youtube_video_id(url: str) -> str:
    """Extract the 11-char video id from any common YouTube URL form."""
    patterns = [
        r'(?:v=|/v/|/embed/|/shorts/|youtu\.be/|/live/)([A-Za-z0-9_-]{11})',
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return ''


def youtube_thumb_url(url: str) -> str:
    """Public CDN thumbnail for a YouTube video (no bot-wall, always available)."""
    vid = youtube_video_id(url)
    return f"https://img.youtube.com/vi/{vid}/hqdefault.jpg" if vid else ''


def youtube_data_fetch(url: str) -> dict:
    """Fetch title + description + thumbnail via the official YouTube Data API v3.

    Works from any server (API-key auth, no bot-wall, no cookie-consent wall).

    Tries YOUTUBE_API_KEY first, then falls back to GEMINI_API_KEY (the same Google
    project may have the YouTube Data API enabled). Malformed keys — e.g. a masked
    value accidentally pasted with bullet characters — are skipped, so one bad env
    var cannot block a working fallback. Returns {} when nothing succeeds.
    """
    from config import YOUTUBE_API_KEY, GEMINI_API_KEY
    vid = youtube_video_id(url)
    if not vid:
        return {}
    seen: set = set()
    candidates = []
    for k in (YOUTUBE_API_KEY, GEMINI_API_KEY):
        k = (k or "").strip()
        # Google API keys are ASCII alphanumeric with - and _; reject anything else
        # (this filters out a masked "AIzaSy••••" paste).
        if k and k not in seen and re.fullmatch(r"[A-Za-z0-9_\-]{20,}", k):
            candidates.append(k)
            seen.add(k)
    for key in candidates:
        try:
            r = httpx.get(
                "https://www.googleapis.com/youtube/v3/videos",
                params={"part": "snippet", "id": vid, "key": key},
                timeout=20,
            )
            if r.status_code != 200:
                logger.warning(f"YouTube Data API {r.status_code}: {r.text[:150]}")
                continue
            items = r.json().get("items", [])
            if not items:
                continue
            sn = items[0].get("snippet", {})
            thumbs = sn.get("thumbnails", {}) or {}
            thumb = (thumbs.get("maxres") or thumbs.get("high") or thumbs.get("medium")
                     or thumbs.get("default") or {}).get("url", "")
            return {
                "title": sn.get("title", "") or "",
                "description": sn.get("description", "") or "",
                "thumbnail": thumb,
            }
        except Exception as e:
            logger.warning(f"YouTube Data API err: {e}")
            continue
    return {}


def _parse_vtt(vtt: str) -> str:
    """Turn a WebVTT subtitle blob into plain, de-duplicated text."""
    out: list = []
    for raw in vtt.splitlines():
        line = raw.strip()
        if not line:
            continue
        if line.startswith(('WEBVTT', 'NOTE', 'Kind:', 'Language:')):
            continue
        if '-->' in line:
            continue
        if line.isdigit():
            continue
        line = re.sub(r'<[^>]+>', '', line)          # inline timing tags
        line = html_lib.unescape(line).strip()
        if line and (not out or out[-1] != line):     # drop consecutive repeats (auto-captions)
            out.append(line)
    return ' '.join(out)


def _subtitle_text_from_info(info: dict, langs=('it', 'en')) -> str:
    """Fetch subtitles / auto-captions as plain text WITHOUT downloading the video."""
    if not isinstance(info, dict):
        return ''
    subs = info.get('subtitles') or {}
    autos = info.get('automatic_captions') or {}
    ordered: list = []
    # Prefer human subtitles, then auto-captions; match exact lang then prefix (en-US → en).
    for pool in (subs, autos):
        for lang in langs:
            if lang in pool:
                ordered.append(pool[lang])
        for key, tracks in pool.items():
            if any(key.lower().startswith(l) for l in langs) and key not in langs:
                ordered.append(tracks)
    pref = {'vtt': 0, 'srv1': 1, 'ttml': 2, 'srv3': 3, 'json3': 4}
    try:
        with httpx.Client(timeout=15, follow_redirects=True,
                          headers={'User-Agent': 'Mozilla/5.0'}) as client:
            for tracks in ordered:
                for t in sorted(tracks or [], key=lambda x: pref.get(x.get('ext'), 9)):
                    turl = t.get('url')
                    if not turl:
                        continue
                    try:
                        r = client.get(turl)
                        if r.status_code != 200 or not r.text:
                            continue
                        text = _parse_vtt(r.text)
                        if len(text) > 30:
                            return text
                    except Exception:
                        continue
    except Exception as e:
        logger.warning(f"subtitle fetch err: {e}")
    return ''


def extract_youtube_text(url: str) -> dict:
    """YouTube: title + description + subtitles as TEXT only. Never downloads the video."""
    opts = {'quiet': True, 'no_warnings': True, 'skip_download': True, 'format': 'best'}
    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            info = ydl.extract_info(url, download=False) or {}
        title = (info.get('title') or '').strip()
        desc = (info.get('description') or '').strip()
        subs = _subtitle_text_from_info(info)
        parts = []
        if title:
            parts.append(title)
        if desc:
            parts.append(desc)
        if subs:
            parts.append("Trascrizione del video: " + subs[:6000])
        caption = "\n\n".join(parts).strip()
        return {
            'success': bool(caption),
            'caption': caption,
            'video_url': '',  # never expose a downloadable stream for YouTube
            'thumbnail_url': info.get('thumbnail', '') or '',
        }
    except Exception as e:
        logger.warning(f"YouTube text extract err: {e}")
        return {'success': False, 'error': str(e)}


def extract_video_info(url: str) -> dict:
    if detect_platform(url) == 'youtube':
        return extract_youtube_text(url)
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


def _probe_duration(video_path: str) -> float:
    """Return duration of a local video file in seconds (ffprobe)."""
    try:
        r = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
             '-of', 'default=noprint_wrappers=1:nokey=1', video_path],
            capture_output=True, timeout=10, text=True,
        )
        return float(r.stdout.strip()) if r.stdout.strip() else 0.0
    except Exception:
        return 0.0


def extract_multiple_frames_from_local(video_path: str, count: int = 6) -> list:
    """Extract N frames evenly spaced from a local video file.

    Returns list of dicts: [{'bytes': bytes, 'timestamp': float}].
    """
    frames: list = []
    duration = _probe_duration(video_path)
    if duration <= 0:
        return frames
    # Skip the very beginning and end (often black frames / logo)
    start = max(0.8, duration * 0.08)
    end = max(start + 1, duration * 0.92)
    if count <= 1:
        timestamps = [duration / 2]
    else:
        step = (end - start) / (count - 1)
        timestamps = [start + i * step for i in range(count)]
    for ts in timestamps:
        try:
            with tempfile.NamedTemporaryFile(suffix='.jpg', delete=False) as tmp_img:
                img_path = tmp_img.name
            subprocess.run(
                ['ffmpeg', '-ss', f"{ts:.2f}", '-i', video_path, '-vframes', '1',
                 '-q:v', '3', '-y', img_path],
                capture_output=True, timeout=20,
            )
            if os.path.exists(img_path) and os.path.getsize(img_path) > 1000:
                with open(img_path, 'rb') as f:
                    frames.append({'bytes': f.read(), 'timestamp': round(ts, 1)})
            try: os.unlink(img_path)
            except Exception: pass
        except Exception as fe:
            logger.warning(f"multi-frame err at {ts}: {fe}")
    return frames


def extract_multiple_frames_from_url(video_url: str, count: int = 6) -> list:
    """Download the video to a temp file then extract N frames spread across duration."""
    try:
        with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as tmp_vid:
            vid_path = tmp_vid.name
        with httpx.Client(timeout=120, follow_redirects=True) as c:
            with c.stream('GET', video_url, headers={'User-Agent': 'Mozilla/5.0'}) as resp:
                if resp.status_code != 200:
                    return []
                written = 0
                max_bytes = 40 * 1024 * 1024  # 40MB cap for multi-frame
                with open(vid_path, 'wb') as f:
                    for chunk in resp.iter_bytes(chunk_size=65536):
                        f.write(chunk)
                        written += len(chunk)
                        if written >= max_bytes:
                            break
        frames = extract_multiple_frames_from_local(vid_path, count=count)
        try: os.unlink(vid_path)
        except Exception: pass
        return frames
    except Exception as e:
        logger.warning(f"multi-frame url err: {e}")
        return []


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
