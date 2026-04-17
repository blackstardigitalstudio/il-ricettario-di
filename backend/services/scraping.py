"""Multi-strategy video scraping: yt-dlp, OG tags, DownloadGram, ffmpeg frame."""
import asyncio
import re
import html as html_lib
import httpx

from config import executor, logger
from services.video import ytdlp_info, extract_frame_from_video_url


async def extract_real_media(source_url: str, user_id: str = "local_user") -> dict:
    """Try multiple strategies to obtain caption + thumbnail + video_url."""
    result = {"caption": "", "thumbnail_bytes": None, "thumbnail_mime": "image/jpeg", "video_url": ""}

    # Method 1: yt-dlp
    try:
        loop = asyncio.get_event_loop()
        info = await loop.run_in_executor(executor, ytdlp_info, source_url, None)
        if info:
            desc = info.get('description') or info.get('title') or ''
            if desc:
                result['caption'] = desc.strip()
            if info.get('url'):
                result['video_url'] = info['url']
            thumb_url = info.get('thumbnail') or ''
            if not thumb_url and info.get('thumbnails'):
                thumbs = info.get('thumbnails') or []
                if thumbs:
                    thumb_url = thumbs[-1].get('url', '')
            if thumb_url:
                try:
                    async with httpx.AsyncClient() as http:
                        r = await http.get(thumb_url, timeout=15, follow_redirects=True,
                                           headers={'User-Agent': 'Mozilla/5.0'})
                        if r.status_code == 200 and 'image' in r.headers.get('content-type', ''):
                            result['thumbnail_bytes'] = r.content
                            result['thumbnail_mime'] = r.headers.get('content-type', 'image/jpeg').split(';')[0]
                except Exception as e:
                    logger.warning(f"yt-dlp thumb download error: {e}")
    except Exception as e:
        logger.warning(f"yt-dlp method error: {e}")

    # Method 2: OG tags
    if not result['caption'] or not result['thumbnail_bytes']:
        try:
            async with httpx.AsyncClient() as http:
                page = await http.get(source_url, timeout=15, follow_redirects=True,
                    headers={
                        'User-Agent': 'Mozilla/5.0 (compatible; facebookexternalhit/1.1; +http://www.facebook.com/externalhit_uatext.php)',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                        'Accept-Language': 'en-US,en;q=0.9',
                    })
                if page.status_code == 200:
                    html = page.text
                    m_desc = re.search(r'<meta\s+property=["\']og:description["\']\s+content=["\']([^"\']+)', html)
                    if not m_desc:
                        m_desc = re.search(r'<meta\s+name=["\']description["\']\s+content=["\']([^"\']+)', html)
                    if m_desc and not result['caption']:
                        result['caption'] = html_lib.unescape(m_desc.group(1)).strip()
                    m_img = re.search(r'<meta\s+property=["\']og:image["\']\s+content=["\']([^"\']+)', html)
                    if m_img and not result['thumbnail_bytes']:
                        img_url = html_lib.unescape(m_img.group(1))
                        try:
                            r = await http.get(img_url, timeout=15, follow_redirects=True,
                                               headers={'User-Agent': 'Mozilla/5.0'})
                            if r.status_code == 200 and 'image' in r.headers.get('content-type', ''):
                                result['thumbnail_bytes'] = r.content
                                result['thumbnail_mime'] = r.headers.get('content-type', 'image/jpeg').split(';')[0]
                        except Exception:
                            pass
        except Exception as e:
            logger.warning(f"OG scrape error: {e}")

    # Method 3: DownloadGram (Instagram-specific)
    if 'instagram' in source_url.lower() and (not result['caption'] or not result['thumbnail_bytes'] or not result['video_url']):
        try:
            async with httpx.AsyncClient(timeout=25) as http:
                res = await http.post('https://api.downloadgram.org/media',
                    json={'url': source_url},
                    headers={'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/json'})
                if res.status_code == 200:
                    text = html_lib.unescape(res.text.replace('\x20', ' ').replace('\x22', '"'))
                    cdn_urls = re.findall(r'(https://cdn\.downloadgram\.org/[^\s"\'<>\\]+)', text)
                    for u in cdn_urls:
                        try:
                            head = await http.head(u, follow_redirects=True, timeout=10)
                            ct = head.headers.get('content-type', '')
                            if 'video' in ct and not result['video_url']:
                                result['video_url'] = u
                            elif 'image' in ct and not result['thumbnail_bytes']:
                                r = await http.get(u, timeout=15, follow_redirects=True)
                                if r.status_code == 200:
                                    result['thumbnail_bytes'] = r.content
                                    result['thumbnail_mime'] = 'image/jpeg'
                        except Exception:
                            pass
        except Exception as e:
            logger.warning(f"DownloadGram media error: {e}")

    # Method 4: ffmpeg frame as last resort
    if not result['thumbnail_bytes'] and result['video_url']:
        try:
            loop = asyncio.get_event_loop()
            frame = await loop.run_in_executor(executor, extract_frame_from_video_url, result['video_url'])
            if frame:
                result['thumbnail_bytes'] = frame
                result['thumbnail_mime'] = 'image/jpeg'
                logger.info("Thumbnail extracted from video frame via ffmpeg")
        except Exception as e:
            logger.warning(f"ffmpeg frame extract error: {e}")

    return result
