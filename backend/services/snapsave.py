"""SnapSave scraper: third-party fallback for Instagram/Facebook video extraction.

SnapSave returns an obfuscated JS response that uses a custom packer (`p.a.c.k.e.r`-like).
We run the JS in a sandboxed Node.js subprocess to extract the final HTML payload, then
regex out the video/image URLs.
"""
import re
import subprocess
from typing import Optional

import httpx

from config import logger


def _decode_snapsave_js(js_source: str) -> str:
    """Execute the JS returned by SnapSave in a tiny Node.js sandbox.

    SnapSave's response is a packed JS ending with an `eval(...)` that constructs the real HTML.
    We monkey-patch `eval` to capture the string instead of running it, then print.
    """
    wrapper = (
        "let evalResult='';"
        "eval=function(c){evalResult=c};"
        "try{" + js_source + "}catch(e){};"
        "process.stdout.write(evalResult||'')"
    )
    try:
        r = subprocess.run(
            ['node', '-e', wrapper],
            capture_output=True, timeout=10, text=True,
        )
        return r.stdout or ''
    except Exception as e:
        logger.warning(f"snapsave node exec err: {e}")
        return ''


def snapsave_fetch(source_url: str, timeout: int = 30) -> dict:
    """Try to extract video/thumbnail URLs from SnapSave for an IG/FB URL.

    Returns dict: { 'video_url': str, 'thumbnail_url': str, 'error': str }.
    """
    out = {'video_url': '', 'thumbnail_url': '', 'error': ''}
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as c:
            r = c.post(
                'https://snapsave.app/action.php?lang=en',
                data={'url': source_url},
                headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
                    'Referer': 'https://snapsave.app/en',
                    'Origin': 'https://snapsave.app',
                    'X-Requested-With': 'XMLHttpRequest',
                },
            )
            if r.status_code != 200:
                out['error'] = f"http {r.status_code}"
                return out
            decoded = _decode_snapsave_js(r.text)
            if not decoded:
                out['error'] = 'decode empty'
                return out

            # Detect explicit error messages
            low = decoded.lower()
            if 'error' in low and 'mp4' not in low and 'http' not in low[:400]:
                err_match = re.search(r'innerHTML\s*=\s*"([^"]+)"', decoded)
                if err_match:
                    out['error'] = err_match.group(1)[:200]
                    return out

            # Video URL via <a href="...mp4">
            video_hrefs = re.findall(r'href="(https?://[^"]+\.mp4[^"]*)"', decoded)
            if not video_hrefs:
                video_hrefs = re.findall(r'href="(https?://[^"]+)"[^>]*>[^<]*(?:download|Download|HD|SD)', decoded)
            if video_hrefs:
                out['video_url'] = video_hrefs[0]

            # Thumbnail via <img src=...>
            thumb_match = re.search(r'<img[^>]+src="(https?://[^"]+)"', decoded)
            if thumb_match:
                out['thumbnail_url'] = thumb_match.group(1)

            if not out['video_url']:
                out['error'] = 'no video url in response'
    except Exception as e:
        out['error'] = str(e)[:200]
        logger.warning(f"snapsave_fetch err: {e}")
    return out
