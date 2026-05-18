from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import PyUser
from schemas import UserOut

router = APIRouter(prefix="/users")


def _u(u: PyUser) -> UserOut:
    return UserOut(id=u.id, email=u.email, display_name=u.display_name, avatar_url=u.avatar_url,
                   role=u.role, is_banned=u.is_banned, last_seen=u.last_seen)


@router.get("/search", response_model=list[UserOut])
async def search_users(
    q: str = Query(default="", min_length=1),
    db: AsyncSession = Depends(get_db),
    current_user: PyUser = Depends(get_current_user),
):
    pattern = f"%{q}%"
    result = await db.execute(
        select(PyUser)
        .where(or_(PyUser.display_name.ilike(pattern), PyUser.email.ilike(pattern)))
        .where(PyUser.id != current_user.id, PyUser.is_banned == False)
        .limit(20)
    )
    return [_u(u) for u in result.scalars().all()]


@router.post("/heartbeat")
async def heartbeat(db: AsyncSession = Depends(get_db), current_user: PyUser = Depends(get_current_user)):
    current_user.last_seen = datetime.now(timezone.utc)
    db.add(current_user)
    await db.commit()
    return {"ok": True}