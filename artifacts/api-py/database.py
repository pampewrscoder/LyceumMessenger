import os
import re
import ssl
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text

_raw = os.environ["DATABASE_URL"]
_url = re.sub(r"^postgresql?://", "postgresql+asyncpg://", _raw)
_url = re.sub(r"[?&]sslmode=[^&]*", "", _url)

_connect_args: dict = {}
if "sslmode=require" in _raw or "sslmode=prefer" in _raw:
    _ctx = ssl.create_default_context()
    _ctx.check_hostname = False
    _ctx.verify_mode = ssl.CERT_NONE
    _connect_args["ssl"] = _ctx

engine = create_async_engine(_url, echo=False, pool_pre_ping=True, connect_args=_connect_args)
AsyncSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


_MIGRATIONS = [
    "ALTER TABLE py_users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'",
    "ALTER TABLE py_users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE py_users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ",
    "ALTER TABLE py_messages ADD COLUMN IF NOT EXISTS reply_to_id INTEGER REFERENCES py_messages(id) ON DELETE SET NULL",
    "ALTER TABLE py_messages ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE py_messages ADD COLUMN IF NOT EXISTS is_edited BOOLEAN NOT NULL DEFAULT FALSE",
    "ALTER TABLE py_messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ",
]

_REPORT_MIGRATIONS = [
    "CREATE TABLE IF NOT EXISTS py_reports ("
    "  id SERIAL PRIMARY KEY,"
    "  message_id INTEGER NOT NULL REFERENCES py_messages(id) ON DELETE CASCADE,"
    "  reporter_id VARCHAR NOT NULL REFERENCES py_users(id) ON DELETE CASCADE,"
    "  reason VARCHAR(50) NOT NULL,"
    "  description TEXT,"
    "  status VARCHAR(20) NOT NULL DEFAULT 'pending',"
    "  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),"
    "  resolved_by VARCHAR REFERENCES py_users(id) ON DELETE SET NULL,"
    "  resolved_at TIMESTAMPTZ"
    ")",
    "CREATE INDEX IF NOT EXISTS idx_py_reports_message_id ON py_reports(message_id)",
    "CREATE INDEX IF NOT EXISTS idx_py_reports_status ON py_reports(status)",
]


async def init_db():
    import models  # noqa: F401
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Safe migrations: one statement per execute (asyncpg limitation)
        for stmt in _MIGRATIONS:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass
        for stmt in _REPORT_MIGRATIONS:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass
