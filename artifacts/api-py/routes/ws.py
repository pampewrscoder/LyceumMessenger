from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from sqlalchemy import select

from auth import decode_access_token
from database import AsyncSessionLocal
from models import PyUser, PyChatParticipant

router = APIRouter()

connections: dict[str, list[WebSocket]] = {}


async def _get_user(websocket: WebSocket) -> PyUser | None:
    cookie = websocket.cookies.get("lyceum_session")
    if not cookie:
        return None
    payload = decode_access_token(cookie)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    async with AsyncSessionLocal() as db:
        r = await db.execute(select(PyUser).where(PyUser.id == user_id))
        return r.scalar_one_or_none()


async def _get_chat_partner_ids(user_id: str) -> list[str]:
    """Return all user IDs who share a chat with the given user."""
    async with AsyncSessionLocal() as db:
        subq = select(PyChatParticipant.chat_id).where(PyChatParticipant.user_id == user_id)
        r = await db.execute(
            select(PyChatParticipant.user_id).where(
                PyChatParticipant.chat_id.in_(subq),
                PyChatParticipant.user_id != user_id,
            )
        )
        return list(set(r.scalars().all()))


async def notify_user(user_id: str, event: dict):
    for ws in connections.get(user_id, []):
        try:
            await ws.send_json(event)
        except Exception:
            pass


async def broadcast_to_chat(chat_id: int, event: dict):
    async with AsyncSessionLocal() as db:
        r = await db.execute(
            select(PyChatParticipant).where(PyChatParticipant.chat_id == chat_id)
        )
        for p in r.scalars().all():
            await notify_user(p.user_id, event)


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    user = await _get_user(websocket)
    if not user:
        await websocket.send_json({"type": "error", "detail": "Unauthorized"})
        await websocket.close(code=4001)
        return

    uid = user.id
    connections.setdefault(uid, []).append(websocket)
    was_offline = len(connections[uid]) == 1

    if was_offline:
        partner_ids = await _get_chat_partner_ids(uid)
        # Notify partners that this user is online
        for pid in partner_ids:
            await notify_user(pid, {"type": "user_online", "user_id": uid})
        # Send snapshot of currently online partners to this user
        online_partners = [pid for pid in partner_ids if pid in connections]
        if online_partners:
            await notify_user(uid, {"type": "online_snapshot", "user_ids": online_partners})

    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_json({"type": "pong"})
    except WebSocketDisconnect:
        pass
    finally:
        if uid in connections:
            connections[uid].remove(websocket)
            if not connections[uid]:
                del connections[uid]
                # User is now fully offline
                partner_ids = await _get_chat_partner_ids(uid)
                for pid in partner_ids:
                    await notify_user(pid, {"type": "user_offline", "user_id": uid})
                # Update last_seen in DB
                async with AsyncSessionLocal() as db:
                    r = await db.execute(select(PyUser).where(PyUser.id == uid))
                    u = r.scalar_one_or_none()
                    if u:
                        u.last_seen = datetime.now(timezone.utc)
                        db.add(u)
                        await db.commit()
