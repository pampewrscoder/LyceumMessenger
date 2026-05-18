import json
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from auth import get_current_user
from database import get_db
from models import PyChatParticipant, PyMessage, PyMessageReaction, PyReport, PyUser
from routes.ws import broadcast_to_chat
from schemas import (
    CreateReportRequest, EditMessageRequest, MessageOut,
    ReactRequest, ReactionOut, ReplyPreviewOut,
    REPORT_REASONS, ReportOut, SendMessageRequest, UserOut,
)

router = APIRouter(prefix="/chats")

ALLOWED_EMOJIS = {"👍", "❤️", "😂", "😮", "😢", "👏", "🔥", "🎉"}


def _u(u: PyUser) -> UserOut:
    return UserOut(id=u.id, email=u.email, display_name=u.display_name, avatar_url=u.avatar_url,
                   role=u.role, is_banned=u.is_banned, last_seen=u.last_seen)


def _reactions(msg: PyMessage, current_user_id: str) -> list[ReactionOut]:
    counts: dict[str, int] = defaultdict(int)
    mine: set[str] = set()
    for r in msg.reactions:
        counts[r.emoji] += 1
        if r.user_id == current_user_id:
            mine.add(r.emoji)
    return [ReactionOut(emoji=e, count=c, reacted_by_me=e in mine) for e, c in counts.items()]


def _reply_preview(msg: PyMessage) -> ReplyPreviewOut | None:
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


def _m(msg: PyMessage, current_user_id: str) -> MessageOut:
    my_encrypted_key = None
    if msg.encrypted_keys:
        keys = json.loads(msg.encrypted_keys)
        my_encrypted_key = keys.get(current_user_id)
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
        reactions=_reactions(msg, current_user_id),
    )


async def _require_participant(db: AsyncSession, chat_id: int, user_id: str) -> PyChatParticipant:
    r = await db.execute(
        select(PyChatParticipant).where(PyChatParticipant.chat_id == chat_id, PyChatParticipant.user_id == user_id)
    )
    p = r.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=403, detail="Нет доступа к этому чату")
    return p


async def _load_message(db: AsyncSession, msg_id: int) -> PyMessage:
    r = await db.execute(
        select(PyMessage)
        .options(selectinload(PyMessage.sender), selectinload(PyMessage.reactions).selectinload(PyMessageReaction.user),
                 selectinload(PyMessage.reply_to).selectinload(PyMessage.sender))
        .where(PyMessage.id == msg_id)
    )
    msg = r.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    return msg


@router.get("/{chat_id}/messages", response_model=list[MessageOut])
async def list_messages(chat_id: int, db: AsyncSession = Depends(get_db), current_user: PyUser = Depends(get_current_user)):
    part = await _require_participant(db, chat_id, current_user.id)
    rq = await db.execute(
        select(PyMessage)
        .options(selectinload(PyMessage.sender), selectinload(PyMessage.reactions).selectinload(PyMessageReaction.user),
                 selectinload(PyMessage.reply_to).selectinload(PyMessage.sender))
        .where(PyMessage.chat_id == chat_id)
        .order_by(PyMessage.created_at.asc())
    )
    msgs = rq.scalars().all()
    part.last_read_at = datetime.now(timezone.utc)
    db.add(part)
    await db.commit()
    return [_m(m, current_user.id) for m in msgs]


@router.post("/{chat_id}/messages", response_model=MessageOut, status_code=201)
async def send_message(chat_id: int, body: SendMessageRequest, db: AsyncSession = Depends(get_db), current_user: PyUser = Depends(get_current_user)):
    await _require_participant(db, chat_id, current_user.id)
    has_content = bool(body.content and body.content.strip())
    has_encrypted = body.encrypted_content is not None
    if not has_content and not has_encrypted and not body.file_url:
        raise HTTPException(status_code=400, detail="Сообщение не может быть пустым")
    if body.reply_to_id:
        rr = await db.execute(select(PyMessage).where(PyMessage.id == body.reply_to_id, PyMessage.chat_id == chat_id))
        if not rr.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Цитируемое сообщение не найдено")
    msg = PyMessage(
        chat_id=chat_id, sender_id=current_user.id,
        content=(body.content or ""),
        encrypted_content=body.encrypted_content,
        content_iv=body.content_iv,
        encrypted_keys=body.encrypted_keys,
        file_url=body.file_url, file_name=body.file_name, file_type=body.file_type,
        reply_to_id=body.reply_to_id,
    )
    db.add(msg)
    await db.commit()
    result = _m(await _load_message(db, msg.id), current_user.id)
    await broadcast_to_chat(chat_id, {"type": "new_message", "chat_id": chat_id})
    return result


@router.patch("/{chat_id}/messages/{msg_id}", response_model=MessageOut)
async def edit_message(chat_id: int, msg_id: int, body: EditMessageRequest, db: AsyncSession = Depends(get_db), current_user: PyUser = Depends(get_current_user)):
    await _require_participant(db, chat_id, current_user.id)
    msg = await _load_message(db, msg_id)
    if msg.chat_id != chat_id:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    if msg.sender_id != current_user.id:
        raise HTTPException(status_code=403, detail="Можно редактировать только свои сообщения")
    if msg.is_deleted:
        raise HTTPException(status_code=400, detail="Нельзя редактировать удалённое сообщение")
    if msg.encrypted_content:
        raise HTTPException(status_code=400, detail="Нельзя редактировать зашифрованное сообщение")
    if not body.content.strip():
        raise HTTPException(status_code=400, detail="Текст не может быть пустым")
    msg.content = body.content.strip()
    msg.is_edited = True
    msg.edited_at = datetime.now(timezone.utc)
    db.add(msg)
    await db.commit()
    result = _m(await _load_message(db, msg.id), current_user.id)
    await broadcast_to_chat(chat_id, {"type": "message_updated", "chat_id": chat_id, "msg_id": msg_id})
    return result


@router.delete("/{chat_id}/messages/{msg_id}", response_model=MessageOut)
async def delete_message(chat_id: int, msg_id: int, db: AsyncSession = Depends(get_db), current_user: PyUser = Depends(get_current_user)):
    await _require_participant(db, chat_id, current_user.id)
    msg = await _load_message(db, msg_id)
    if msg.chat_id != chat_id:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    if msg.sender_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Нет прав для удаления этого сообщения")
    msg.is_deleted = True
    db.add(msg)
    await db.commit()
    result = _m(await _load_message(db, msg.id), current_user.id)
    await broadcast_to_chat(chat_id, {"type": "message_deleted", "chat_id": chat_id, "msg_id": msg_id})
    return result


@router.post("/{chat_id}/messages/{msg_id}/react", response_model=list[ReactionOut])
async def react_message(chat_id: int, msg_id: int, body: ReactRequest, db: AsyncSession = Depends(get_db), current_user: PyUser = Depends(get_current_user)):
    await _require_participant(db, chat_id, current_user.id)
    if body.emoji not in ALLOWED_EMOJIS:
        raise HTTPException(status_code=400, detail=f"Недопустимый emoji. Доступны: {', '.join(ALLOWED_EMOJIS)}")
    msg = await _load_message(db, msg_id)
    if msg.chat_id != chat_id or msg.is_deleted:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    existing = next((r for r in msg.reactions if r.user_id == current_user.id and r.emoji == body.emoji), None)
    if existing:
        await db.delete(existing)
    else:
        db.add(PyMessageReaction(message_id=msg_id, user_id=current_user.id, emoji=body.emoji))
    await db.commit()
    msg = await _load_message(db, msg_id)
    result = _reactions(msg, current_user.id)
    await broadcast_to_chat(chat_id, {"type": "message_reacted", "chat_id": chat_id, "msg_id": msg_id})
    return result


@router.post("/{chat_id}/messages/{msg_id}/report", status_code=201)
async def report_message(chat_id: int, msg_id: int, body: CreateReportRequest, db: AsyncSession = Depends(get_db), current_user: PyUser = Depends(get_current_user)):
    if body.reason not in REPORT_REASONS:
        raise HTTPException(status_code=400, detail=f"Недопустимая причина. Доступны: {', '.join(REPORT_REASONS)}")
    await _require_participant(db, chat_id, current_user.id)
    msg = await _load_message(db, msg_id)
    if msg.chat_id != chat_id:
        raise HTTPException(status_code=404, detail="Сообщение не найдено")
    report = PyReport(message_id=msg_id, reporter_id=current_user.id, reason=body.reason, description=body.description)
    db.add(report)
    await db.commit()
    return {"ok": True, "id": report.id}