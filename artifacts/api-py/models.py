import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class PyUser(Base):
    __tablename__ = "py_users"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    public_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_private_key: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_salt: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_iv: Mapped[str | None] = mapped_column(Text, nullable=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    is_banned: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    participations: Mapped[list["PyChatParticipant"]] = relationship(back_populates="user")
    sent_messages: Mapped[list["PyMessage"]] = relationship(back_populates="sender", foreign_keys="PyMessage.sender_id")
    reactions: Mapped[list["PyMessageReaction"]] = relationship(back_populates="user")


class PyChat(Base):
    __tablename__ = "py_chats"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    is_group: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    created_by: Mapped[str] = mapped_column(String, ForeignKey("py_users.id", ondelete="CASCADE"), nullable=False)

    participants: Mapped[list["PyChatParticipant"]] = relationship(back_populates="chat", lazy="selectin")
    messages: Mapped[list["PyMessage"]] = relationship(back_populates="chat", order_by="PyMessage.created_at")


class PyChatParticipant(Base):
    __tablename__ = "py_chat_participants"
    __table_args__ = (UniqueConstraint("chat_id", "user_id"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    chat_id: Mapped[int] = mapped_column(Integer, ForeignKey("py_chats.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("py_users.id", ondelete="CASCADE"), nullable=False, index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    chat: Mapped["PyChat"] = relationship(back_populates="participants")
    user: Mapped["PyUser"] = relationship(back_populates="participations", lazy="selectin")


class PyMessage(Base):
    __tablename__ = "py_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    chat_id: Mapped[int] = mapped_column(Integer, ForeignKey("py_chats.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id: Mapped[str] = mapped_column(String, ForeignKey("py_users.id", ondelete="CASCADE"), nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    encrypted_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    content_iv: Mapped[str | None] = mapped_column(Text, nullable=True)
    encrypted_keys: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_name: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_type: Mapped[str | None] = mapped_column(Text, nullable=True)
    reply_to_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("py_messages.id", ondelete="SET NULL"), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_edited: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    chat: Mapped["PyChat"] = relationship(back_populates="messages")
    sender: Mapped["PyUser"] = relationship(back_populates="sent_messages", lazy="selectin", foreign_keys=[sender_id])
    reply_to: Mapped["PyMessage | None"] = relationship("PyMessage", remote_side="PyMessage.id", lazy="selectin", foreign_keys=[reply_to_id])
    reactions: Mapped[list["PyMessageReaction"]] = relationship(back_populates="message", lazy="selectin")
    reports: Mapped[list["PyReport"]] = relationship(back_populates="message", lazy="selectin")


class PyMessageReaction(Base):
    __tablename__ = "py_message_reactions"
    __table_args__ = (UniqueConstraint("message_id", "user_id", "emoji"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    message_id: Mapped[int] = mapped_column(Integer, ForeignKey("py_messages.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String, ForeignKey("py_users.id", ondelete="CASCADE"), nullable=False)
    emoji: Mapped[str] = mapped_column(String(10), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    message: Mapped["PyMessage"] = relationship(back_populates="reactions")
    user: Mapped["PyUser"] = relationship(back_populates="reactions", lazy="selectin")


class PyReport(Base):
    __tablename__ = "py_reports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    message_id: Mapped[int] = mapped_column(Integer, ForeignKey("py_messages.id", ondelete="CASCADE"), nullable=False, index=True)
    reporter_id: Mapped[str] = mapped_column(String, ForeignKey("py_users.id", ondelete="CASCADE"), nullable=False)
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    resolved_by: Mapped[str | None] = mapped_column(String, ForeignKey("py_users.id", ondelete="SET NULL"), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    message: Mapped["PyMessage"] = relationship(back_populates="reports", lazy="selectin")
    reporter: Mapped["PyUser"] = relationship(foreign_keys=[reporter_id], lazy="selectin")
    resolver: Mapped["PyUser | None"] = relationship(foreign_keys=[resolved_by], lazy="selectin")