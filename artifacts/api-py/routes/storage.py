import mimetypes
import os
import uuid
from pathlib import Path

import aiofiles
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from auth import get_current_user
from models import PyUser
from fastapi.responses import FileResponse
from pydantic import BaseModel

router = APIRouter(prefix="/storage")

UPLOAD_DIR = Path(os.environ.get("UPLOAD_DIR", "/tmp/lyceum-uploads"))
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
MAX_SIZE = 20 * 1024 * 1024


class UploadResponse(BaseModel):
    object_path: str
    file_name: str
    content_type: str


@router.post("/upload", response_model=UploadResponse)
async def upload_file(
    file: UploadFile = File(...),
    current_user: PyUser = Depends(get_current_user),
):
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="Файл слишком большой (максимум 20 МБ)")

    ext = Path(file.filename or "file").suffix.lower()
    name = f"{uuid.uuid4().hex}{ext}"
    async with aiofiles.open(UPLOAD_DIR / name, "wb") as f:
        await f.write(content)

    ct = file.content_type or mimetypes.guess_type(file.filename or "")[0] or "application/octet-stream"
    return UploadResponse(object_path=f"/files/{name}", file_name=file.filename or name, content_type=ct)


@router.get("/files/{filename}")
async def serve_file(filename: str):
    if "/" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Недопустимое имя файла")
    fp = UPLOAD_DIR / filename
    if not fp.exists():
        raise HTTPException(status_code=404, detail="Файл не найден")
    return FileResponse(fp, media_type=mimetypes.guess_type(filename)[0] or "application/octet-stream", filename=filename)