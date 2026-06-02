"""FastAPI entry point: wires middleware and route modules.

All endpoints live in /app/backend/routes/*.py.
Business logic lives in /app/backend/services/*.py.
"""
from fastapi import FastAPI, APIRouter
from fastapi.responses import HTMLResponse
from starlette.middleware.cors import CORSMiddleware

from db import client
from routes import auth, extract, folders, subfolders, recipes, videos, instagram, shopping, backup

app = FastAPI()

PRIVACY_HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy - Il Ricettario di Casa</title>
<style>body{font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:760px;margin:0 auto;padding:32px 20px;color:#1a1a1a;line-height:1.6}h1{font-size:26px}h2{font-size:17px;margin-top:28px;color:#b8541a}a{color:#b8541a}small{color:#777}</style>
</head><body>
<h1>Privacy Policy - Il Ricettario di Casa</h1>
<small>Last updated: June 2026</small>
<p>This Privacy Policy explains how the app "Il Ricettario di Casa" (the "App"), developed by Black Star Digital Studio, handles your data. Made in Italy.</p>
<h2>1. Data we collect</h2>
<p>- <b>Account data</b>: email, name and password (stored only as a bcrypt hash).<br>
- <b>Content you create</b>: recipes, folders, notes, tags and shopping lists you save.<br>
- <b>Instagram connection (optional)</b>: if you connect Instagram, we store only the encrypted session cookies, used exclusively to fetch the videos you paste into the App.<br>
- <b>Advertising identifiers</b>: collected by Google AdMob to show ads.</p>
<h2>2. How we use your data</h2>
<p>To create and manage your account, save and organize your recipes, extract ingredients/steps from the video links you submit, generate shopping lists, and display ads.</p>
<h2>3. AI processing</h2>
<p>The video links and recipe text you submit are processed by Google Gemini solely to extract ingredients and steps. We do not use your content to train models.</p>
<h2>4. Third-party services (data processors)</h2>
<p>Google (Gemini AI, AdMob ads), Render (hosting) and MongoDB Atlas (database). We do not sell your personal data.</p>
<h2>5. Storage and security</h2>
<p>Data is stored on MongoDB Atlas. Passwords are hashed with bcrypt and traffic is encrypted in transit (HTTPS).</p>
<h2>6. Data retention and deletion</h2>
<p>You can export a full backup of your data from within the App at any time. To request deletion of your account and data, contact us at the address below and we will comply within the time limits set by applicable law.</p>
<h2>7. Children</h2>
<p>The App is not directed to children under 18.</p>
<h2>8. Contact</h2>
<p>For any privacy request: <a href="mailto:blackstardigitalstudio@gmail.com">blackstardigitalstudio@gmail.com</a></p>
</body></html>"""


@app.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
async def privacy_policy():
    return PRIVACY_HTML
api_router = APIRouter(prefix="/api")

# Order does not really matter, but we group them logically.
api_router.include_router(auth.router)
api_router.include_router(extract.router)
api_router.include_router(folders.router)
api_router.include_router(subfolders.router)
api_router.include_router(recipes.router)
api_router.include_router(videos.router)
api_router.include_router(instagram.router)
api_router.include_router(shopping.router)
api_router.include_router(backup.router)

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
