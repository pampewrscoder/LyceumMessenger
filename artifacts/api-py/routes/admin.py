from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import get_current_user
from database import get_db
from models import PyChat, PyChatParticipant, PyMessage, PyReport, PyUser
from schemas import AdminStatsOut, AdminUpdateUserRequest, ReportOut, ResolveReportRequest, UserOut

router = APIRouter(prefix="/admin")


def _u(u: PyUser) -> UserOut:
    return UserOut(id=u.id, email=u.email, display_name=u.display_name, avatar_url=u.avatar_url,
                   role=u.role, is_banned=u.is_banned, last_seen=u.last_seen)


async def require_admin(current_user: PyUser = Depends(get_current_user)) -> PyUser:
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Требуются права администратора")
    return current_user


@router.get("/stats", response_model=AdminStatsOut)
async def get_stats(db: AsyncSession = Depends(get_db), _: PyUser = Depends(require_admin)):
    now = datetime.now(timezone.utc)
    total_users = (await db.execute(select(func.count()).select_from(PyUser))).scalar_one()
    active_24h = (await db.execute(
        select(func.count()).select_from(PyUser).where(PyUser.last_seen >= now - timedelta(hours=24))
    )).scalar_one()
    total_chats = (await db.execute(select(func.count()).select_from(PyChat))).scalar_one()
    total_messages = (await db.execute(select(func.count()).select_from(PyMessage))).scalar_one()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    messages_today = (await db.execute(
        select(func.count()).select_from(PyMessage).where(PyMessage.created_at >= today_start)
    )).scalar_one()

    # messages per day for last 7 days
    msgs_week = []
    for i in range(6, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        c = (await db.execute(
            select(func.count()).select_from(PyMessage)
            .where(PyMessage.created_at >= day_start, PyMessage.created_at < day_end)
        )).scalar_one()
        msgs_week.append(c)

    # new users per day for last 7 days
    users_week = []
    for i in range(6, -1, -1):
        day_start = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        day_end = day_start + timedelta(days=1)
        c = (await db.execute(
            select(func.count()).select_from(PyUser)
            .where(PyUser.created_at >= day_start, PyUser.created_at < day_end)
        )).scalar_one()
        users_week.append(c)

    return AdminStatsOut(
        total_users=total_users, active_users_24h=active_24h,
        total_chats=total_chats, total_messages=total_messages,
        messages_today=messages_today, messages_week=msgs_week, new_users_week=users_week,
    )


@router.get("/reports", response_model=list[ReportOut])
async def list_reports(status: str | None = None, db: AsyncSession = Depends(get_db), _: PyUser = Depends(require_admin)):
    q = select(PyReport).order_by(PyReport.created_at.desc())
    if status:
        q = q.where(PyReport.status == status)
    r = await db.execute(q)
    reports = r.scalars().all()
    out = []
    for rep in reports:
        msg = rep.message
        out.append(ReportOut(
            id=rep.id, message_id=rep.message_id, reporter_id=rep.reporter_id,
            reason=rep.reason, description=rep.description, status=rep.status,
            created_at=rep.created_at,
            message_content=msg.content if not msg.is_deleted else "(удалено)",
            message_sender=_u(msg.sender),
            reporter=_u(rep.reporter),
            resolved_by=rep.resolved_by, resolved_at=rep.resolved_at,
        ))
    return out


@router.patch("/reports/{report_id}")
async def resolve_report(report_id: int, body: ResolveReportRequest, db: AsyncSession = Depends(get_db), current_admin: PyUser = Depends(require_admin)):
    if body.status not in ("resolved", "dismissed"):
        raise HTTPException(status_code=400, detail="Статус должен быть resolved или dismissed")
    r = await db.execute(select(PyReport).where(PyReport.id == report_id))
    rep = r.scalar_one_or_none()
    if not rep:
        raise HTTPException(status_code=404, detail="Жалоба не найдена")
    rep.status = body.status
    rep.resolved_by = current_admin.id
    rep.resolved_at = datetime.now(timezone.utc)
    db.add(rep)
    await db.commit()
    return {"ok": True}


@router.get("/users", response_model=list[UserOut])
async def list_users(db: AsyncSession = Depends(get_db), _: PyUser = Depends(require_admin)):
    r = await db.execute(select(PyUser).order_by(PyUser.created_at.desc()))
    return [_u(u) for u in r.scalars().all()]


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_user(
    user_id: str,
    body: AdminUpdateUserRequest,
    db: AsyncSession = Depends(get_db),
    current_admin: PyUser = Depends(require_admin),
):
    r = await db.execute(select(PyUser).where(PyUser.id == user_id))
    user = r.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Пользователь не найден")
    if user.id == current_admin.id and body.role == "user":
        raise HTTPException(status_code=400, detail="Нельзя снять права администратора у себя")
    if body.role is not None:
        if body.role not in ("user", "admin"):
            raise HTTPException(status_code=400, detail="Неверная роль")
        user.role = body.role
    if body.is_banned is not None:
        user.is_banned = body.is_banned
    if body.display_name is not None:
        user.display_name = body.display_name.strip()
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return _u(user)


@router.get("/chats", response_model=list[dict])
async def list_all_chats(db: AsyncSession = Depends(get_db), _: PyUser = Depends(require_admin)):
    from sqlalchemy.orm import selectinload
    r = await db.execute(
        select(PyChat)
        .options(selectinload(PyChat.participants).selectinload(PyChatParticipant.user))
        .order_by(PyChat.created_at.desc())
    )
    chats = r.scalars().all()
    result = []
    for c in chats:
        msg_count = (await db.execute(select(func.count()).select_from(PyMessage).where(PyMessage.chat_id == c.id))).scalar_one()
        result.append({
            "id": c.id, "name": c.name, "isGroup": c.is_group,
            "createdAt": c.created_at.isoformat(),
            "participantCount": len(c.participants),
            "messageCount": msg_count,
            "participants": [{"id": p.user.id, "displayName": p.user.display_name} for p in c.participants],
        })
    return result


@router.delete("/chats/{chat_id}")
async def delete_chat(chat_id: int, db: AsyncSession = Depends(get_db), _: PyUser = Depends(require_admin)):
    r = await db.execute(select(PyChat).where(PyChat.id == chat_id))
    chat = r.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Чат не найден")
    await db.delete(chat)
    await db.commit()
    return {"ok": True}


@router.delete("/users/{user_id}/messages")
async def clear_user_messages(user_id: str, db: AsyncSession = Depends(get_db), _: PyUser = Depends(require_admin)):
    """Soft-delete all messages from a user."""
    r = await db.execute(select(PyMessage).where(PyMessage.sender_id == user_id, PyMessage.is_deleted == False))
    msgs = r.scalars().all()
    for m in msgs:
        m.is_deleted = True
        db.add(m)
    await db.commit()
    return {"deleted": len(msgs)}
