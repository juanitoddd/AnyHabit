from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import models
from .database import SessionLocal
from .security import ACCESS_COOKIE_NAME, decode_access_token, hash_api_token, looks_like_api_token
from .time_utils import PeriodContext, utcnow

bearer_scheme = HTTPBearer(auto_error=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _user_from_api_token(db: Session, plaintext: str) -> models.User | None:
    """Resolve a personal access token to its owner.

    Returns None for anything unusable — unknown, revoked or expired — so the
    caller reports a single generic failure rather than telling an attacker
    which of those it was.
    """
    token = (
        db.query(models.ApiToken)
        .filter(models.ApiToken.token_hash == hash_api_token(plaintext))
        .first()
    )
    if token is None or token.revoked_at is not None:
        return None

    now = utcnow()
    if token.expires_at is not None and token.expires_at.replace(tzinfo=token.expires_at.tzinfo or now.tzinfo) < now:
        return None

    user = db.query(models.User).filter(models.User.id == token.user_id).first()
    if user is None or not user.is_active:
        return None

    # Lets the UI show "last used 2 hours ago", which is how you spot a token
    # you forgot you issued.
    token.last_used_at = now
    db.commit()
    return user


def get_current_user(
    request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> models.User:
    presented: str | None = None

    if credentials is not None and credentials.scheme.lower() == "bearer":
        presented = credentials.credentials
    else:
        presented = request.cookies.get(ACCESS_COOKIE_NAME)

    if not presented:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    # Personal access tokens carry their own prefix, so they never reach the
    # JWT decoder and cannot produce a confusing "invalid token" error.
    if looks_like_api_token(presented):
        user = _user_from_api_token(db, presented)
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="That API token is not valid, or has been revoked",
            )
        return user

    payload = decode_access_token(presented)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    try:
        resolved_id = int(user_id)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required") from None

    user = db.query(models.User).filter(models.User.id == resolved_id).first()
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return user


def get_period_context(current_user: models.User = Depends(get_current_user)) -> PeriodContext:
    """The calendar every analytics call for this request should use."""
    return PeriodContext.for_user(current_user)
