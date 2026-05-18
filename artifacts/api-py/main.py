import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import init_db
from routes.auth import router as auth_router
from routes.users import router as users_router
from routes.chats import router as chats_router
from routes.messages import router as messages_router
from routes.storage import router as storage_router
from routes.admin import router as admin_router
from routes.ws import router as ws_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.typing: dict = {}
    await init_db()
    yield


app = FastAPI(title="Лицеум API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(users_router, prefix="/api")
app.include_router(chats_router, prefix="/api")
app.include_router(messages_router, prefix="/api")
app.include_router(storage_router, prefix="/api")
app.include_router(admin_router, prefix="/api")
app.include_router(ws_router, prefix="/api")


@app.get("/api/healthz")
async def healthz():
    return {"status": "ok", "backend": "python", "version": "2.0.0"}