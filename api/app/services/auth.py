from datetime import datetime, timedelta
from typing import Optional, Dict, Any
import secrets
import httpx
import jwt
from jwt import PyJWKClient
from cryptography.hazmat.primitives import serialization
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload
from app.models import User, UserSession
from app.core.config import settings
from app.services.session import session_manager
import logging
import json
import base64

logger = logging.getLogger(__name__)

class AuthService:
    """
    Authentication service for Microsoft SSO and session management
    """
    
    def __init__(self):
        self.microsoft_graph_url = "https://graph.microsoft.com/v1.0"
        self.microsoft_login_url = f"https://login.microsoftonline.com/{settings.MICROSOFT_TENANT_ID}"
        self.jwks_client = PyJWKClient(settings.MICROSOFT_JWKS_URL) if settings.MICROSOFT_TENANT_ID != "common" else None
    
    async def verify_microsoft_token(self, access_token: str) -> Optional[dict]:
        """
        Verify Microsoft access token and get user information
        """
        try:
            async with httpx.AsyncClient() as client:
                headers = {"Authorization": f"Bearer {access_token}"}
                response = await client.get(f"{self.microsoft_graph_url}/me", headers=headers)
                
                if response.status_code == 200:
                    user_info = response.json()
                    return {
                        "microsoft_id": user_info.get("id"),
                        "email": user_info.get("mail") or user_info.get("userPrincipalName"),
                        "name": user_info.get("displayName"),
                        "tenant_id": settings.MICROSOFT_TENANT_ID
                    }
                else:
                    logger.error(f"Microsoft token verification failed: {response.status_code}")
                    return None
                    
        except Exception as e:
            logger.error(f"Error verifying Microsoft token: {str(e)}")
            return None
    
    async def create_or_update_user(self, user_info: dict, db: AsyncSession) -> User:
        """
        Create a new user or update existing user from Microsoft SSO info
        """
        try:
            # Check if user already exists
            stmt = select(User).where(User.microsoft_id == user_info["microsoft_id"])
            result = await db.execute(stmt)
            user = result.scalar_one_or_none()
            
            if user:
                # Update existing user
                user.email = user_info["email"]
                user.name = user_info["name"]
                user.updated_at = datetime.utcnow()
                user.is_active = True
            else:
                # Create new user
                user = User(
                    microsoft_id=user_info["microsoft_id"],
                    email=user_info["email"],
                    name=user_info["name"],
                    tenant_id=user_info["tenant_id"],
                    is_active=True
                )
                db.add(user)
            
            await db.commit()
            await db.refresh(user)
            return user
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Error creating/updating user: {str(e)}")
            raise
    
    async def create_user_session(
        self, 
        user: User, 
        db: AsyncSession,
        client_ip: str = None,
        user_agent: str = None,
        remember_me: bool = False
    ) -> Dict[str, Any]:
        """
        Create a new secure user session using the session manager
        """
        try:
            session_data = await session_manager.create_session(
                user=user,
                client_ip=client_ip,
                user_agent=user_agent,
                remember_me=remember_me,
                db=db
            )
            
            logger.info(f"Session created for user {user.id} from IP {client_ip}")
            return session_data
            
        except Exception as e:
            logger.error(f"Error creating user session: {str(e)}")
            raise
    
    async def validate_session(
        self, 
        session_token: str, 
        db: AsyncSession,
        client_ip: str = None
    ) -> Optional[User]:
        """
        Validate session token using secure session manager
        """
        try:
            user = await session_manager.validate_session(
                session_token=session_token,
                client_ip=client_ip,
                db=db
            )
            
            if user:
                logger.debug(f"Session validated for user {user.id}")
            
            return user
            
        except Exception as e:
            logger.error(f"Error validating session: {str(e)}")
            return None
    
    async def revoke_session(self, session_token: str, db: AsyncSession) -> bool:
        """
        Revoke a user session using secure session manager
        """
        try:
            result = await session_manager.revoke_session(session_token, db)
            
            if result:
                logger.info(f"Session revoked: {session_token[:10]}...")
            
            return result
            
        except Exception as e:
            logger.error(f"Error revoking session: {str(e)}")
            return False
    
    async def revoke_user_sessions(
        self, 
        user_id: str, 
        db: AsyncSession,
        except_current_session: str = None
    ) -> int:
        """
        Revoke all sessions for a user using secure session manager
        """
        try:
            count = await session_manager.revoke_user_sessions(
                user_id=user_id,
                except_session_token=except_current_session,
                db=db
            )
            
            logger.info(f"Revoked {count} sessions for user {user_id}")
            return count
            
        except Exception as e:
            logger.error(f"Error revoking user sessions: {str(e)}")
            return 0
    
    async def renew_session(
        self, 
        session_token: str, 
        db: AsyncSession
    ) -> Optional[Dict[str, Any]]:
        """
        Renew an existing session
        """
        try:
            result = await session_manager.renew_session(session_token, db=db)
            
            if result:
                logger.debug(f"Session renewed: {session_token[:10]}...")
            
            return result
            
        except Exception as e:
            logger.error(f"Error renewing session: {str(e)}")
            return None
    
    async def get_user_sessions(self, user_id: str, db: AsyncSession) -> list:
        """
        Get active sessions for a user
        """
        try:
            sessions = await session_manager.get_user_sessions(
                user_id=user_id,
                active_only=True,
                db=db
            )
            
            return sessions
            
        except Exception as e:
            logger.error(f"Error getting user sessions: {str(e)}")
            return []
    
    async def cleanup_expired_sessions(self, db: AsyncSession) -> int:
        """
        Clean up expired sessions using secure session manager
        """
        try:
            count = await session_manager.cleanup_expired_sessions(db)
            
            if count > 0:
                logger.info(f"Cleaned up {count} expired sessions")
            
            return count
            
        except Exception as e:
            logger.error(f"Error cleaning up expired sessions: {str(e)}")
            return 0
    
    def create_access_token(self, user_id: str, user_email: str) -> str:
        """
        Create JWT access token for authenticated user
        """
        try:
            now = datetime.utcnow()
            payload = {
                "sub": user_id,
                "email": user_email,
                "iat": now,
                "exp": now + timedelta(minutes=settings.JWT_EXPIRE_MINUTES),
                "iss": settings.JWT_ISSUER,
                "aud": settings.JWT_AUDIENCE,
                "type": "access"
            }
            
            return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
            
        except Exception as e:
            logger.error(f"Error creating access token: {str(e)}")
            raise
    
    def create_refresh_token(self, user_id: str) -> str:
        """
        Create JWT refresh token for token renewal
        """
        try:
            now = datetime.utcnow()
            payload = {
                "sub": user_id,
                "iat": now,
                "exp": now + timedelta(days=settings.JWT_REFRESH_EXPIRE_DAYS),
                "iss": settings.JWT_ISSUER,
                "aud": settings.JWT_AUDIENCE,
                "type": "refresh"
            }
            
            return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)
            
        except Exception as e:
            logger.error(f"Error creating refresh token: {str(e)}")
            raise
    
    def verify_jwt_token(self, token: str) -> Optional[Dict[str, Any]]:
        """
        Verify and decode JWT token
        """
        try:
            payload = jwt.decode(
                token,
                settings.JWT_SECRET_KEY,
                algorithms=[settings.JWT_ALGORITHM],
                audience=settings.JWT_AUDIENCE,
                issuer=settings.JWT_ISSUER
            )
            return payload
            
        except jwt.ExpiredSignatureError:
            logger.warning("JWT token has expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid JWT token: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Error verifying JWT token: {str(e)}")
            return None
    
    async def verify_microsoft_id_token(self, id_token: str) -> Optional[Dict[str, Any]]:
        """
        Verify Microsoft ID token using JWKS
        """
        try:
            # For common tenant, we need to get the signing key dynamically
            if settings.MICROSOFT_TENANT_ID == "common":
                # Decode header to get key ID
                unverified_header = jwt.get_unverified_header(id_token)
                kid = unverified_header.get("kid")
                
                if not kid:
                    logger.error("No key ID found in token header")
                    return None
                
                # Get the signing key
                async with httpx.AsyncClient() as client:
                    jwks_response = await client.get("https://login.microsoftonline.com/common/discovery/v2.0/keys")
                    if jwks_response.status_code != 200:
                        logger.error("Failed to fetch JWKS")
                        return None
                    
                    jwks = jwks_response.json()
                    key = None
                    for jwk in jwks.get("keys", []):
                        if jwk.get("kid") == kid:
                            key = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(jwk))
                            break
                    
                    if not key:
                        logger.error(f"Key ID {kid} not found in JWKS")
                        return None
            else:
                # For specific tenant, use the JWKS client
                signing_key = self.jwks_client.get_signing_key_from_jwt(id_token)
                key = signing_key.key
            
            # Verify and decode the token
            payload = jwt.decode(
                id_token,
                key,
                algorithms=["RS256"],
                audience=settings.MICROSOFT_CLIENT_ID,
                issuer=settings.MICROSOFT_ISSUER,
                options={"verify_exp": True}
            )
            
            return payload
            
        except jwt.ExpiredSignatureError:
            logger.warning("Microsoft ID token has expired")
            return None
        except jwt.InvalidTokenError as e:
            logger.warning(f"Invalid Microsoft ID token: {str(e)}")
            return None
        except Exception as e:
            logger.error(f"Error verifying Microsoft ID token: {str(e)}")
            return None
    
    async def authenticate_with_microsoft(self, id_token: str, access_token: str, db: AsyncSession) -> Optional[Dict[str, Any]]:
        """
        Complete authentication flow using Microsoft tokens
        """
        try:
            # Verify ID token
            id_payload = await self.verify_microsoft_id_token(id_token)
            if not id_payload:
                logger.error("Invalid Microsoft ID token")
                return None
            
            # Extract user information from ID token
            user_info = {
                "microsoft_id": id_payload.get("sub") or id_payload.get("oid"),
                "email": id_payload.get("email") or id_payload.get("preferred_username"),
                "name": id_payload.get("name"),
                "tenant_id": id_payload.get("tid", settings.MICROSOFT_TENANT_ID)
            }
            
            # Verify we have required information
            if not user_info["microsoft_id"] or not user_info["email"]:
                logger.error("Missing required user information in ID token")
                return None
            
            # Create or update user
            user = await self.create_or_update_user(user_info, db)
            
            # Create JWT tokens
            access_jwt = self.create_access_token(str(user.id), user.email)
            refresh_jwt = self.create_refresh_token(str(user.id))
            
            # Create session (for additional security)
            session_token = await self.create_user_session(user, db)
            
            return {
                "user": {
                    "id": str(user.id),
                    "email": user.email,
                    "name": user.name,
                    "microsoft_id": user.microsoft_id,
                    "is_active": user.is_active
                },
                "tokens": {
                    "access_token": access_jwt,
                    "refresh_token": refresh_jwt,
                    "token_type": "Bearer",
                    "expires_in": settings.JWT_EXPIRE_MINUTES * 60
                },
                "session_token": session_token
            }
            
        except Exception as e:
            logger.error(f"Error in Microsoft authentication: {str(e)}")
            return None