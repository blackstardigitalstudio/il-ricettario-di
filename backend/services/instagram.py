"""Instagram session helpers (encrypted cookies, rate limit)."""
import json
from datetime import datetime, timezone
from typing import Optional

from config import IG_CIPHER, IG_RATE_LIMIT_PER_HOUR, logger
from db import db

# In-memory per-user rate limit (count, reset_at_ts)
_RATE = {}


def check_rate_limit(user_id: str) -> bool:
    now = datetime.now(timezone.utc).timestamp()
    rec = _RATE.get(user_id)
    if not rec or rec[1] < now:
        _RATE[user_id] = (1, now + 3600)
        return True
    count, reset_at = rec
    if count >= IG_RATE_LIMIT_PER_HOUR:
        return False
    _RATE[user_id] = (count + 1, reset_at)
    return True


async def get_user_ig_cookies(user_id: str) -> Optional[dict]:
    if not IG_CIPHER:
        return None
    session = await db.instagram_sessions.find_one({"user_id": user_id}, {"_id": 0})
    if not session:
        return None
    try:
        enc = session.get("encrypted_cookies", "").encode()
        dec = IG_CIPHER.decrypt(enc).decode()
        return json.loads(dec)
    except Exception as e:
        logger.error(f"Cookie decrypt error for {user_id}: {e}")
        return None


def write_cookies_netscape(cookies: dict, path: str):
    with open(path, 'w') as f:
        f.write("# Netscape HTTP Cookie File\n")
        for name, value in cookies.items():
            f.write(f".instagram.com\tTRUE\t/\tTRUE\t2147483647\t{name}\t{value}\n")
