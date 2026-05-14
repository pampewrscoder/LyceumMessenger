import json
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import get_current_user
from database import get_db
from models import PyChat, PyChatParticipant, PyMessage, PyMessageReaction, PyUser
from schemas import (
    ChatDetailsOut, ChatPreviewOut, ChatsSummaryOut,
    CreateChatRequest, MessageOut, ParticipantOut,
    ReactionOut, ReplyPreviewOut, TypingOut, UserOut,
)
from collections import defaultdict

router = APIRouter(prefix="/chats")


def _u(u: PyUser) -> UserOut:
    return UserOut(id=u.id, email=u.email, display_name=u.display_name, avatar_url=u.avatar_url,
                   role=u.role, is_banned=u.is_banned, last_seen=u.last_seen)


def _reactions(msg: PyMessage, uid: str) -> list[ReactionOut]:
    counts: dict[str, int] = defaultdict(int)
    mine: set[str] = set()
    for r in msg.reactions:
        counts[r.emoji] += 1
        if r.user_id == uid:
            mine.add(r.emoji)
    return [ReactionOut(emoji=e, count=c, reacted_by_me=e in mine) for e, c in counts.items()]


def _reply_preview(msg: PyMessage) -> "ReplyPreviewOut | None":
    if not msg.reply_to:
        return None
    content = msg.reply_to.content
    if not content and msg.reply_to.encrypted_content:
        content = "🔒 Зашифрованное сообщение"
    if msg.reply_to.is_deleted:
        content = "Сообщение удалено"
    return ReplyPreviewOut(
        id=msg.reply_to.id,
        content=content,
        sender_display_name=msg.reply_to.sender.display_name,
        file_name=msg.reply_to.file_name,
    )


def _m(msg: PyMessage, uid: str) -> MessageOut:
    my_encrypted_key = None
    if msg.encrypted_keys:
        keys = json.loads(msg.encrypted_keys)
        my_encrypted_key = keys.get(uid)
    return MessageOut(
        id=msg.id, chat_id=msg.chat_id,
        content=msg.content if not msg.is_deleted else "Сообщение удалено",
        encrypted_content=msg.encrypted_content if not msg.is_deleted else None,
        content_iv=msg.content_iv if not msg.is_deleted else None,
        my_encrypted_key=my_encrypted_key if not msg.is_deleted else None,
        created_at=msg.created_at, sender=_u(msg.sender),
        file_url=None if msg.is_deleted else msg.file_url,
        file_name=None if msg.is_deleted else msg.file_name,
        file_type=None if msg.is_deleted else msg.file_type,
        reply_to=_reply_preview(msg),
        is_deleted=msg.is_deleted, is_edited=msg.is_edited, edited_at=msg.edited_at,
        reactions=_reactions(msg, uid),
    )


_msg_opts = [
    selectinload(PyMessage.sender),
    selectinload(PyMessage.reactions).selectinload(PyMessageReaction.user),
    selectinload(PyMessage.reply_to).selectinload(PyMessage.sender),
]


async def _require_participant(db: AsyncSession, chat_id: int, user_id: str) -> PyChatParticipant:
    r = await db.execute(
        select(PyChatParticipant).where(PyChatParticipant.chat_id == chat_id, PyChatParticipant.user_id == user_id)
    )
    p = r.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=403, detail="Нет доступа к этому чату")
    return p


@router.get("", response_model=list[ChatPreviewOut])
async def list_chats(db: AsyncSession = Depends(get_db), current_user: PyUser = Depends(get_current_user)):
    pq = await db.execute(select(PyChatParticipant.chat_id).where(PyChatParticipant.user_id == current_user.id))
    chat_ids = [r[0] for r in pq.all()]
    if not chat_ids:
        return []

    cq = await db.execute(
        select(PyChat)
        .options(selectinload(PyChat.participants).selectinload(PyChatParticipant.user))
        .where(PyChat.id.in_(chat_ids))
        .order_by(PyChat.created_at.desc())
    )
    chats = cq.scalars().all()

    previews: list[ChatPreviewOut] = []
    for chat in chats:
        lmq = await db.execute(
            select(PyMessage).options(*_msg_opts)
            .where(PyMessage.chat_id == chat.id).order_by(PyMessage.created_at.desc()).limit(1)
        )
        last_msg = lmq.scalar_one_or_none()
        part = next((p for p in chat.participants if p.user_id == current_user.id), None)
        unread = 0
        if part and last_msg:
            uq = await db.execute(select(func.count()).where(
                PyMessage.chat_id == chat.id, PyMessage.created_at > part.last_read_at,
                PyMessage.sender_id != current_user.id))
            unread = uq.scalar_one() or 0
        previews.append(ChatPreviewOut(
            id=chat.id, name=chat.name, is_group=chat.is_group, created_at=chat.created_at,
            participants=[ParticipantOut(user=_u(p.user)) for p in chat.participants],
            last_message=_m(last_msg, current_user.id) if last_msg else None,
            unread_count=unread,
        ))
    return previews


@router.get("/summary", response_model=ChatsSummaryOut)
async def chats_summary(db: AsyncSession = Depends(get_db), current_user: PyUser = Depends(get_current_user)):
    pq = await db.execute(select(PyChatParticipant.chat_id).where(PyChatParticipant.user_id == current_user.id))
    chat_ids = [r[0] for r in pq.all()]
    if not chat_ids:
        return ChatsSummaryOut(total_chats=0, total_groups=0, total_directs=0, total_unread=0, messages_last_7_days=0)
    cq = await db.execute(select(PyChat).where(PyChat.id.in_(chat_ids)))
    chats = cq.scalars().all()
    total_groups = sum(1 for c in chats if c.is_group)
    parts_q = await db.execute(select(PyChatParticipant).where(
        PyChatParticipant.chat_id.in_(chat_ids), PyChatParticipant.user_id == current_user.id))
    part_map = {p.chat_id: p for p in parts_q.scalars().all()}
    total_unread = 0
    for cid in chat_ids:
        p = part_map.get(cid)
        if p:
            uq = await db.execute(select(func.count()).where(
                PyMessage.chat_id == cid, PyMessage.created_at > p.last_read_at,
                PyMessage.sender_id != current_user.id))
            total_unread += uq.scalar_one() or 0
    wq = await db.execute(select(func.count()).where(
        PyMessage.chat_id.in_(chat_ids),
        PyMessage.created_at >= datetime.now(timezone.utc) - timedelta(days=7)))
    return ChatsSummaryOut(
        total_chats=len(chats), total_groups=total_groups, total_directs=len(chats) - total_groups,
        total_unread=total_unread, messages_last_7_days=wq.scalar_one() or 0,
    )


@router.get("/typing/{chat_id}", response_model=TypingOut)
async def get_typing(chat_id: int, request: Request, db: AsyncSession = Depends(get_db), current_user: PyUser = Depends(get_current_user)):
    await _require_participant(db, chat_id, current_user.id)
    now = datetime.now(timezone.utc)
    typing: dict[str, Any] = request.app.state.typing.get(chat_id, {})
    active_ids = [uid for uid, ts in typing.items() if (now - ts).total_seconds() < 5 and uid != current_user.id]
    if not active_ids:
        return TypingOut(user_ids=[], display_names=[])
    uq = await db.execute(select(PyUser).where(PyUser.id.in_(active_ids)))
    users = {u.id: u for u in uq.scalars().all()}
    names = [users[uid].display_name for uid in active_ids if uid in users]
    return TypingOut(user_ids=active_ids, display_names=names)


@router.post("/typing/{chat_id}")
async def set_typing(chat_id: int, request: Request, db: AsyncSession = Depends(get_db), current_user: PyUser = Depends(get_current_user)):
    await _require_participant(db, chat_id, current_user.id)
    if chat_id not in request.app.state.typing:
        request.app.state.typing[chat_id] = {}
    request.app.state.typing[chat_id][current_user.id] = datetime.now(timezone.utc)
    return {"ok": True}


@router.post("", response_model=ChatDetailsOut, status_code=201)
async def create_chat(body: CreateChatRequest, db: AsyncSession = Depends(get_db), current_user: PyUser = Depends(get_current_user)):
    all_ids = list({current_user.id, *body.participant_ids})
    if len(all_ids) < 2:
        raise HTTPException(status_code=400, detail="Нужен хотя бы один собеседник")
    is_group = len(all_ids) > 2
    uq = await db.execute(select(PyUser).where(PyUser.id.in_(all_ids)))
    users = {u.id: u for u in uq.scalars().all()}
    if missing := [uid for uid in all_ids if uid not in users]:
        raise HTTPException(status_code=400, detail=f"Пользователи не найдены: {missing}")
    if not is_group:
        other_id = next(uid for uid in all_ids if uid != current_user.id)
        my_q = await db.execute(select(PyChatParticipant.chat_id).where(PyChatParticipant.user_id == current_user.id))
        for cid in [r[0] for r in my_q.all()]:
            op = await db.execute(select(PyChatParticipant).where(PyChatParticipant.chat_id == cid, PyChatParticipant.user_id == other_id))
            if op.scalar_one_or_none():
                ec = await db.execute(
                    select(PyChat).options(selectinload(PyChat.participants).selectinload(PyChatParticipant.user))
                    .where(PyChat.id == cid, PyChat.is_group == False))
                existing = ec.scalar_one_or_none()
                if existing and len(existing.participants) == 2:
                    return ChatDetailsOut(id=existing.id, name=existing.name, is_group=existing.is_group,
                                          created_at=existing.created_at,
                                          participants=[ParticipantOut(user=_u(p.user)) for p in existing.participants])
    chat = PyChat(name=body.name, is_group=is_group, created_by=current_user.id)
    db.add(chat)
    await db.flush()
    for uid in all_ids:
        db.add(PyChatParticipant(chat_id=chat.id, user_id=uid))
    await db.commit()
    rq = await db.execute(
        select(PyChat).options(selectinload(PyChat.participants).selectinload(PyChatParticipant.user)).where(PyChat.id == chat.id))
    chat = rq.scalar_one()
    return ChatDetailsOut(id=chat.id, name=chat.name, is_group=chat.is_group, created_at=chat.created_at,
                          participants=[ParticipantOut(user=_u(p.user)) for p in chat.participants])


@router.get("/{chat_id}", response_model=ChatDetailsOut)
async def get_chat(chat_id: int, db: AsyncSession = Depends(get_db), current_user: PyUser = Depends(get_current_user)):
    await _require_participant(db, chat_id, current_user.id)
    rq = await db.execute(
        select(PyChat).options(selectinload(PyChat.participants).selectinload(PyChatParticipant.user)).where(PyChat.id == chat_id))
    chat = rq.scalar_one_or_none()
    if not chat:
        raise HTTPException(status_code=404, detail="Чат не найден")
    return ChatDetailsOut(id=chat.id, name=chat.name, is_group=chat.is_group, created_at=chat.created_at,
                          participants=[ParticipantOut(user=_u(p.user)) for p in chat.participants])
