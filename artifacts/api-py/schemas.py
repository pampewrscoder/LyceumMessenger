from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class UserOut(CamelModel):
    id: str
    email: str
    display_name: str
    avatar_url: str | None
    role: str
    is_banned: bool
    last_seen: datetime | None
    public_key: str | None = None


class RegisterRequest(CamelModel):
    email: EmailStr
    password: str
    display_name: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Пароль должен содержать не менее 6 символов")
        return v

    @field_validator("display_name")
    @classmethod
    def name_not_empty(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("Имя не может быть пустым")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UpdateProfileRequest(CamelModel):
    display_name: str | None = None
    avatar_url: str | None = None

    @field_validator("display_name")
    @classmethod
    def name_not_empty(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError("Имя не может быть пустым")
        return v


class SaveKeysRequest(BaseModel):
    public_key: str
    encrypted_private_key: str
    key_salt: str
    key_iv: str


class MyKeysOut(BaseModel):
    public_key: str
    encrypted_private_key: str
    key_salt: str
    key_iv: str


class PublicKeyOut(BaseModel):
    public_key: str


class ReactionOut(CamelModel):
    emoji: str
    count: int
    reacted_by_me: bool


class ReplyPreviewOut(CamelModel):
    id: int
    content: str
    sender_display_name: str
    file_name: str | None


class MessageOut(CamelModel):
    id: int
    chat_id: int
    content: str
    encrypted_content: str | None = None
    content_iv: str | None = None
    my_encrypted_key: str | None = None
    created_at: datetime
    sender: UserOut
    file_url: str | None
    file_name: str | None
    file_type: str | None
    reply_to: ReplyPreviewOut | None
    is_deleted: bool
    is_edited: bool
    edited_at: datetime | None
    reactions: list[ReactionOut]


class SendMessageRequest(CamelModel):
    content: str = ""
    encrypted_content: str | None = None
    content_iv: str | None = None
    encrypted_keys: str | None = None
    file_url: str | None = None
    file_name: str | None = None
    file_type: str | None = None
    reply_to_id: int | None = None


class EditMessageRequest(CamelModel):
    content: str


class ReactRequest(CamelModel):
    emoji: str


class ParticipantOut(CamelModel):
    user: UserOut


class ChatPreviewOut(CamelModel):
    id: int
    name: str | None
    is_group: bool
    created_at: datetime
    participants: list[ParticipantOut]
    last_message: MessageOut | None
    unread_count: int


class ChatDetailsOut(CamelModel):
    id: int
    name: str | None
    is_group: bool
    created_at: datetime
    participants: list[ParticipantOut]


class ChatsSummaryOut(CamelModel):
    total_chats: int
    total_groups: int
    total_directs: int
    total_unread: int
    messages_last_7_days: int


class CreateChatRequest(CamelModel):
    participant_ids: list[str]
    name: str | None = None


class TypingOut(CamelModel):
    user_ids: list[str]
    display_names: list[str]


class AdminStatsOut(CamelModel):
    total_users: int
    active_users_24h: int
    total_chats: int
    total_messages: int
    messages_today: int
    messages_week: list[int]
    new_users_week: list[int]


REPORT_REASONS = {"spam", "harassment", "inappropriate", "other"}


class CreateReportRequest(CamelModel):
    reason: str
    description: str | None = None


class ReportOut(CamelModel):
    id: int
    message_id: int
    reporter_id: str
    reason: str
    description: str | None
    status: str
    created_at: datetime
    message_content: str
    message_sender: UserOut
    reporter: UserOut
    resolved_by: str | None
    resolved_at: datetime | None


class ResolveReportRequest(CamelModel):
    status: str


class AdminUpdateUserRequest(CamelModel):
    role: str | None = None
    is_banned: bool | None = None
    display_name: str | None = None