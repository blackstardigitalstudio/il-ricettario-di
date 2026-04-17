"""Pydantic models for requests / db objects."""
import uuid
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field


class User(BaseModel):
    user_id: str
    email: str
    name: str
    picture: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class Folder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    name: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class FolderCreate(BaseModel):
    name: str


class FolderUpdate(BaseModel):
    name: str


class Subfolder(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
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
    user_id: str
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
    transcription_status: str = "none"
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


class IgSessionIn(BaseModel):
    cookies: dict
    username: Optional[str] = None
