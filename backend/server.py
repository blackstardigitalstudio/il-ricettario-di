"""FastAPI entry point: wires middleware and route modules.

All endpoints live in /app/backend/routes/*.py.
Business logic lives in /app/backend/services/*.py.
"""
from fastapi import FastAPI, APIRouter
from starlette.middleware.cors import CORSMiddleware

from db import client
from routes import auth, extract, folders, subfolders, recipes, videos, instagram

app = FastAPI()
api_router = APIRouter(prefix="/api")

# Order does not really matter, but we group them logically.
api_router.include_router(auth.router)
api_router.include_router(extract.router)
api_router.include_router(folders.router)
api_router.include_router(subfolders.router)
api_router.include_router(recipes.router)
api_router.include_router(videos.router)
api_router.include_router(instagram.router)

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
