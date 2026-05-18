from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from auth import COOKIE_NAME, ACCESS_TOKEN_EXPIRE_DAYS, create_access_token, get_current_user, hash_password, verify_password
from database import get_db
from models import PyUser
from schemas import (
    LoginRequest, RegisterRequest, UpdateProfileRequest, UserOut,
    SaveKeysRequest, MyKeysOut, PublicKeyOut,
)

router = APIRouter(prefix="/auth")


def _u(u: PyUser) -> UserOut:
    return UserOut(id=u.id, email=u.email, display_name=u.display_name, avatar_url=u.avatar_url,
                   role=u.role, is_banned=u.is_banned, last_seen=u.last_seen)


def _set_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME, value=token, httponly=True, samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_DAYS * 86400, secure=False,
    )


@router.post("/register", response_model=UserOut, status_code=201)
async def register(body: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(PyUser).where(PyUser.email == body.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Пользователь с таким email уже существует")
    count = (await db.execute(select(func.count()).select_from(PyUser))).scalar_one()
    role = "admin" if count == 0 else "user"
    user = PyUser(
        email=body.email.lower(), password_hash=hash_password(body.password),
        display_name=body.display_name.strip(), role=role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    token = create_access_token({"sub": user.id})
    _set_cookie(response, token)
    return _u(user)


@router.post("/login", response_model=UserOut)
async def login(body: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PyUser).where(PyUser.email == body.email.lower()))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    if user.is_banned:
        raise HTTPException(status_code=403, detail="Аккаунт заблокирован администратором")
    token = create_access_token({"sub": user.id})
    _set_cookie(response, token)
    return _u(user)


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie(COOKIE_NAME)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(current_user: PyUser = Depends(get_current_user)):
    return _u(current_user)


@router.patch("/profile", response_model=UserOut)
async def update_profile(
    body: UpdateProfileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: PyUser = Depends(get_current_user),
):
    if body.display_name is not None:
        current_user.display_name = body.display_name
    if "avatar_url" in body.model_fields_set:
        current_user.avatar_url = body.avatar_url
    db.add(current_user)
    await db.commit()
    await db.refresh(current_user)
    return _u(current_user)


@router.put("/keys", status_code=200)
async def save_keys(
    body: SaveKeysRequest,
    db: AsyncSession = Depends(get_db),
    current_user: PyUser = Depends(get_current_user),
):
    current_user.public_key = body.public_key
    current_user.encrypted_private_key = body.encrypted_private_key
    current_user.key_salt = body.key_salt
    current_user.key_iv = body.key_iv
    db.add(current_user)
    await db.commit()
    return {"ok": True}


@router.get("/keys/me", response_model=MyKeysOut | None)
async def get_my_keys(
    current_user: PyUser = Depends(get_current_user),
):
    if not current_user.encrypted_private_key:
        return None
    return MyKeysOut(
        public_key=current_user.public_key,
        encrypted_private_key=current_user.encrypted_private_key,
        key_salt=current_user.key_salt,
        key_iv=current_user.key_iv,
    )


@router.get("/keys/{user_id}", response_model=PublicKeyOut | None)
async def get_public_key(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: PyUser = Depends(get_current_user),
):
    result = await db.execute(select(PyUser).where(PyUser.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.public_key:
        return None
    return PublicKeyOut(public_key=user.public_key)