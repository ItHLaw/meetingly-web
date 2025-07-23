from fastapi import APIRouter, HTTPException, Depends, Request, Response, status
from fastapi.responses import RedirectResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from app.core.database import get_db
from app.services.auth import AuthService
from app.middleware.auth import get_current_user
from app.models import User
from app.core.config import settings
from datetime import datetime
import logging

logger = logging.getLogger(__name__)

router = APIRouter()
auth_service = AuthService()

class MicrosoftCallbackRequest(BaseModel):
    access_token: str
    id_token: str

class MicrosoftTokenRequest(BaseModel):
    id_token: str
    access_token: str

class RefreshTokenRequest(BaseModel):
    refresh_token: str

class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "Bearer"
    expires_in: int

class AuthResponse(BaseModel):
    user: UserResponse
    tokens: TokenResponse

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    tenant_id: str
    created_at: str
    is_active: bool

@router.post("/microsoft/callback")
async def microsoft_callback(
    callback_data: MicrosoftCallbackRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db)
):
    """
    Handle Microsoft SSO callback and create secure user session with HttpOnly cookies
    """
    try:
        # Get client information for secure session creation
        client_ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or \
                   request.headers.get("X-Real-IP") or \
                   (request.client.host if request.client else "unknown")
        user_agent = request.headers.get("User-Agent", "Unknown")
        
        # Verify Microsoft token and get user info
        user_info = await auth_service.verify_microsoft_token(callback_data.access_token)
        
        if not user_info:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid Microsoft token"
            )
        
        # Create or update user
        user = await auth_service.create_or_update_user(user_info, db)
        
        # Create secure session with enhanced security
        session_data = await auth_service.create_user_session(
            user=user,
            db=db,
            client_ip=client_ip,
            user_agent=user_agent,
            remember_me=False  # Default for callback
        )
        
        # Set secure HttpOnly cookie with proper security flags
        cookie_config = session_data["cookie_config"]
        response.set_cookie(
            key="session_token",
            value=session_data["session_token"],
            **cookie_config
        )
        
        logger.info(f"CALLBACK_SUCCESS: User {user.id} authenticated via Microsoft SSO")
        
        return {
            "success": True,
            "message": "Authentication successful",
            "user": UserResponse(
                id=str(user.id),
                email=user.email,
                name=user.name,
                tenant_id=user.tenant_id,
                created_at=user.created_at.isoformat(),
                is_active=user.is_active
            ),
            "session": {
                "expires_at": session_data["expires_at"].isoformat(),
                "session_id": session_data["session_id"]
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Microsoft callback error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )

@router.post("/microsoft/token", response_model=AuthResponse)
async def microsoft_token_login(
    token_data: MicrosoftTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Authenticate with Microsoft ID and access tokens, return JWT tokens
    """
    try:
        auth_result = await auth_service.authenticate_with_microsoft(
            token_data.id_token,
            token_data.access_token,
            db
        )
        
        if not auth_result:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Microsoft authentication failed"
            )
        
        return AuthResponse(
            user=UserResponse(**auth_result["user"]),
            tokens=TokenResponse(**auth_result["tokens"])
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Microsoft token authentication error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Authentication failed"
        )

@router.post("/refresh", response_model=TokenResponse)
async def refresh_access_token(
    refresh_data: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db)
):
    """
    Refresh access token using refresh token
    """
    try:
        # Verify refresh token
        payload = auth_service.verify_jwt_token(refresh_data.refresh_token)
        
        if not payload or payload.get("type") != "refresh":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid refresh token"
            )
        
        # Get user from database
        user_id = payload.get("sub")
        async with db as session:
            stmt = select(User).where(User.id == user_id)
            result = await session.execute(stmt)
            user = result.scalar_one_or_none()
            
            if not user or not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="User not found or inactive"
                )
        
        # Create new tokens
        new_access_token = auth_service.create_access_token(str(user.id), user.email)
        new_refresh_token = auth_service.create_refresh_token(str(user.id))
        
        return TokenResponse(
            access_token=new_access_token,
            refresh_token=new_refresh_token,
            expires_in=settings.JWT_EXPIRE_MINUTES * 60
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Token refresh error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Token refresh failed"
        )

@router.post("/logout")
async def logout(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Secure logout with session revocation and cookie clearing
    """
    try:
        session_token = request.cookies.get("session_token")
        client_ip = request.headers.get("X-Forwarded-For", "").split(",")[0].strip() or \
                   request.headers.get("X-Real-IP") or \
                   (request.client.host if request.client else "unknown")
        
        # Revoke session if exists
        if session_token:
            revoked = await auth_service.revoke_session(session_token, db)
            if revoked:
                logger.info(f"LOGOUT_SUCCESS: Session revoked for user {current_user.id} from IP {client_ip}")
        
        # Clear session cookie with proper security flags
        response.delete_cookie(
            key="session_token",
            httponly=True,
            secure=settings.ENVIRONMENT == "production",
            samesite="lax",
            path="/"
        )
        
        return {
            "success": True,
            "message": "Logged out successfully",
            "timestamp": datetime.utcnow().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Logout error for user {current_user.id}: {str(e)}")
        # Still clear cookie even if logout fails
        response.delete_cookie(
            key="session_token",
            httponly=True,
            secure=settings.ENVIRONMENT == "production", 
            samesite="lax",
            path="/"
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Logout failed"
        )

@router.post("/logout-all")
async def logout_all_sessions(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Logout from all sessions except current one
    """
    try:
        current_session_token = request.cookies.get("session_token")
        
        # Revoke all other sessions
        revoked_count = await auth_service.revoke_user_sessions(
            user_id=str(current_user.id),
            db=db,
            except_current_session=current_session_token
        )
        
        logger.info(f"LOGOUT_ALL: Revoked {revoked_count} sessions for user {current_user.id}")
        
        return {
            "success": True,
            "message": f"Logged out from {revoked_count} other sessions",
            "revoked_count": revoked_count
        }
        
    except Exception as e:
        logger.error(f"Logout all sessions error for user {current_user.id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to logout from other sessions"
        )

@router.post("/renew-session")
async def renew_session(
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Renew current session with extended expiry
    """
    try:
        session_token = request.cookies.get("session_token")
        
        if not session_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No session token found"
            )
        
        # Renew session
        renewal_data = await auth_service.renew_session(session_token, db)
        
        if not renewal_data:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Session not found or expired"
            )
        
        # Update cookie with new expiry
        cookie_config = renewal_data["cookie_config"]
        response.set_cookie(
            key="session_token",
            value=session_token,
            **cookie_config
        )
        
        logger.info(f"SESSION_RENEWED: User {current_user.id}")
        
        return {
            "success": True,
            "message": "Session renewed successfully",
            "expires_at": renewal_data["expires_at"].isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Session renewal error for user {current_user.id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Session renewal failed"
        )

@router.get("/sessions")
async def get_user_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Get list of active sessions for current user
    """
    try:
        sessions = await auth_service.get_user_sessions(str(current_user.id), db)
        
        return {
            "success": True,
            "sessions": sessions,
            "total_count": len(sessions)
        }
        
    except Exception as e:
        logger.error(f"Get sessions error for user {current_user.id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve sessions"
        )

@router.get("/me")
async def get_current_user_info(
    current_user: User = Depends(get_current_user)
):
    """
    Get current user information
    """
    return UserResponse(
        id=str(current_user.id),
        email=current_user.email,
        name=current_user.name,
        tenant_id=current_user.tenant_id,
        created_at=current_user.created_at.isoformat(),
        is_active=current_user.is_active
    )

@router.get("/microsoft/login")
async def microsoft_login():
    """
    Get Microsoft SSO login URL
    """
    login_url = (
        f"https://login.microsoftonline.com/{settings.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize"
        f"?client_id={settings.MICROSOFT_CLIENT_ID}"
        f"&response_type=code"
        f"&redirect_uri={settings.CORS_ORIGINS[0]}/auth/callback"
        f"&scope=openid profile email User.Read"
        f"&response_mode=query"
    )
    
    return {"login_url": login_url}