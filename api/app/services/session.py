"""
Secure session management service for Meetily web application

Features:
- Secure session token generation and storage
- HttpOnly cookie management with proper security flags
- Session expiration and renewal
- Multi-device session tracking
- Session invalidation and cleanup
- Security audit logging
"""

import secrets
import hashlib
import base64
from datetime import datetime, timedelta
from typing import Optional, Dict, Any, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_, or_, update
from sqlalchemy.orm import selectinload

from app.models import User, UserSession
from app.core.config import settings
from app.core.database import AsyncSessionLocal
import logging

logger = logging.getLogger(__name__)

class SecureSessionManager:
    """
    Comprehensive session management with security features
    """
    
    def __init__(self):
        # Session configuration
        self.session_lifetime = timedelta(hours=settings.SESSION_EXPIRE_HOURS)
        self.renewal_threshold = timedelta(hours=1)  # Renew if expires within 1 hour
        self.max_sessions_per_user = 10  # Limit concurrent sessions
        self.token_length = 32  # 256-bit tokens
        self.remember_me_lifetime = timedelta(days=30)
        
        # Security settings
        self.secure_cookies = settings.ENVIRONMENT == "production"
        self.same_site = "lax"  # CSRF protection
        self.http_only = True   # XSS protection
    
    def _generate_secure_token(self) -> str:
        """
        Generate cryptographically secure session token
        """
        return secrets.token_urlsafe(self.token_length)
    
    def _hash_token(self, token: str) -> str:
        """
        Hash token for secure storage (optional additional layer)
        """
        return hashlib.sha256(token.encode()).hexdigest()
    
    def _get_session_expiry(self, remember_me: bool = False) -> datetime:
        """
        Calculate session expiry based on remember_me preference
        """
        if remember_me:
            return datetime.utcnow() + self.remember_me_lifetime
        return datetime.utcnow() + self.session_lifetime
    
    async def create_session(
        self, 
        user: User, 
        client_ip: str = None,
        user_agent: str = None,
        remember_me: bool = False,
        db: AsyncSession = None
    ) -> Dict[str, Any]:
        """
        Create a new secure session for user
        
        Returns:
            Dict containing session_token, expires_at, and cookie settings
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Generate secure token
            session_token = self._generate_secure_token()
            expires_at = self._get_session_expiry(remember_me)
            
            # Cleanup old sessions if user has too many
            await self._cleanup_user_sessions(user.id, db)
            
            # Create session record
            session = UserSession(
                user_id=user.id,
                session_token=session_token,
                expires_at=expires_at,
                ip_address=client_ip,
                user_agent=user_agent[:500] if user_agent else None,  # Truncate long user agents
                is_revoked=False
            )
            
            db.add(session)
            await db.commit()
            
            logger.info(f"SESSION_CREATED: User {user.id} from IP {client_ip}, expires {expires_at}")
            
            return {
                "session_token": session_token,
                "expires_at": expires_at,
                "cookie_config": self._get_cookie_config(expires_at, remember_me),
                "session_id": str(session.id)
            }
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Error creating session for user {user.id}: {str(e)}")
            raise
        finally:
            if should_close_db:
                await db.close()
    
    async def validate_session(
        self, 
        session_token: str, 
        client_ip: str = None,
        db: AsyncSession = None
    ) -> Optional[User]:
        """
        Validate session token and return user if valid
        
        Includes additional security checks:
        - Token expiration
        - User active status
        - Session revocation status
        - Optional IP validation
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Find valid session
            stmt = (
                select(UserSession)
                .options(selectinload(UserSession.user))
                .where(
                    and_(
                        UserSession.session_token == session_token,
                        UserSession.expires_at > datetime.utcnow(),
                        UserSession.is_revoked == False
                    )
                )
            )
            
            result = await db.execute(stmt)
            session = result.scalar_one_or_none()
            
            if not session or not session.user:
                logger.debug(f"SESSION_INVALID: Token not found or expired")
                return None
            
            # Check user active status
            if not session.user.is_active:
                logger.warning(f"SESSION_BLOCKED: User {session.user.id} is inactive")
                await self._revoke_session_by_token(session_token, db)
                return None
            
            # Optional IP validation (can be enabled for high security)
            if settings.ENVIRONMENT == "production" and hasattr(settings, 'VALIDATE_SESSION_IP'):
                if settings.VALIDATE_SESSION_IP and session.ip_address and client_ip:
                    if session.ip_address != client_ip:
                        logger.warning(f"SESSION_IP_MISMATCH: Expected {session.ip_address}, got {client_ip}")
                        # Optionally revoke session on IP mismatch
                        # await self._revoke_session_by_token(session_token, db)
                        # return None
            
            # Check if session needs renewal
            if self._should_renew_session(session.expires_at):
                await self._renew_session(session, db)
            
            logger.debug(f"SESSION_VALID: User {session.user.id}")
            return session.user
            
        except Exception as e:
            logger.error(f"Error validating session: {str(e)}")
            return None
        finally:
            if should_close_db:
                await db.close()
    
    async def renew_session(
        self, 
        session_token: str,
        extend_expiry: bool = True,
        db: AsyncSession = None
    ) -> Optional[Dict[str, Any]]:
        """
        Renew existing session with new expiry time
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Find session
            stmt = select(UserSession).where(
                and_(
                    UserSession.session_token == session_token,
                    UserSession.is_revoked == False
                )
            )
            
            result = await db.execute(stmt)
            session = result.scalar_one_or_none()
            
            if not session:
                return None
            
            if extend_expiry:
                # Extend expiry time
                new_expires_at = datetime.utcnow() + self.session_lifetime
                session.expires_at = new_expires_at
                
                await db.commit()
                
                logger.info(f"SESSION_RENEWED: Session {session.id} extended to {new_expires_at}")
                
                return {
                    "expires_at": new_expires_at,
                    "cookie_config": self._get_cookie_config(new_expires_at)
                }
            
            return {"expires_at": session.expires_at}
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Error renewing session: {str(e)}")
            return None
        finally:
            if should_close_db:
                await db.close()
    
    async def revoke_session(
        self, 
        session_token: str,
        db: AsyncSession = None
    ) -> bool:
        """
        Revoke a specific session
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            return await self._revoke_session_by_token(session_token, db)
        finally:
            if should_close_db:
                await db.close()
    
    async def revoke_user_sessions(
        self, 
        user_id: str,
        except_session_token: str = None,
        db: AsyncSession = None
    ) -> int:
        """
        Revoke all sessions for a user, optionally except current session
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            conditions = [UserSession.user_id == user_id]
            
            if except_session_token:
                conditions.append(UserSession.session_token != except_session_token)
            
            # Mark sessions as revoked instead of deleting for audit trail
            stmt = (
                update(UserSession)
                .where(and_(*conditions))
                .values(is_revoked=True)
            )
            
            result = await db.execute(stmt)
            await db.commit()
            
            revoked_count = result.rowcount
            logger.info(f"SESSIONS_REVOKED: {revoked_count} sessions revoked for user {user_id}")
            
            return revoked_count
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Error revoking user sessions: {str(e)}")
            return 0
        finally:
            if should_close_db:
                await db.close()
    
    async def get_user_sessions(
        self, 
        user_id: str,
        active_only: bool = True,
        db: AsyncSession = None
    ) -> List[Dict[str, Any]]:
        """
        Get list of user sessions for management
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            conditions = [UserSession.user_id == user_id]
            
            if active_only:
                conditions.extend([
                    UserSession.expires_at > datetime.utcnow(),
                    UserSession.is_revoked == False
                ])
            
            stmt = (
                select(UserSession)
                .where(and_(*conditions))
                .order_by(UserSession.created_at.desc())
            )
            
            result = await db.execute(stmt)
            sessions = result.scalars().all()
            
            return [
                {
                    "id": str(session.id),
                    "created_at": session.created_at,
                    "expires_at": session.expires_at,
                    "ip_address": session.ip_address,
                    "user_agent": session.user_agent,
                    "is_revoked": session.is_revoked,
                    "is_expired": session.expires_at < datetime.utcnow(),
                    "is_current": False  # This would need to be determined by caller
                }
                for session in sessions
            ]
            
        except Exception as e:
            logger.error(f"Error getting user sessions: {str(e)}")
            return []
        finally:
            if should_close_db:
                await db.close()
    
    async def cleanup_expired_sessions(self, db: AsyncSession = None) -> int:
        """
        Clean up expired and revoked sessions
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Delete expired or revoked sessions older than 7 days
            cutoff_date = datetime.utcnow() - timedelta(days=7)
            
            stmt = delete(UserSession).where(
                or_(
                    and_(
                        UserSession.expires_at < datetime.utcnow(),
                        UserSession.created_at < cutoff_date
                    ),
                    and_(
                        UserSession.is_revoked == True,
                        UserSession.created_at < cutoff_date
                    )
                )
            )
            
            result = await db.execute(stmt)
            await db.commit()
            
            cleaned_count = result.rowcount
            logger.info(f"SESSION_CLEANUP: Cleaned {cleaned_count} expired/revoked sessions")
            
            return cleaned_count
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Error cleaning up sessions: {str(e)}")
            return 0
        finally:
            if should_close_db:
                await db.close()
    
    # Private helper methods
    
    def _should_renew_session(self, expires_at: datetime) -> bool:
        """Check if session should be automatically renewed"""
        return expires_at - datetime.utcnow() < self.renewal_threshold
    
    async def _renew_session(self, session: UserSession, db: AsyncSession):
        """Automatically renew session"""
        session.expires_at = datetime.utcnow() + self.session_lifetime
        await db.commit()
        logger.debug(f"SESSION_AUTO_RENEWED: Session {session.id}")
    
    async def _revoke_session_by_token(self, session_token: str, db: AsyncSession) -> bool:
        """Internal method to revoke session by token"""
        try:
            stmt = (
                update(UserSession)
                .where(UserSession.session_token == session_token)
                .values(is_revoked=True)
            )
            
            result = await db.execute(stmt)
            await db.commit()
            
            if result.rowcount > 0:
                logger.info(f"SESSION_REVOKED: Token {session_token[:10]}...")
                return True
            return False
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Error revoking session: {str(e)}")
            return False
    
    async def _cleanup_user_sessions(self, user_id: str, db: AsyncSession):
        """Clean up old sessions if user has too many"""
        try:
            # Count active sessions
            count_stmt = select(UserSession).where(
                and_(
                    UserSession.user_id == user_id,
                    UserSession.expires_at > datetime.utcnow(),
                    UserSession.is_revoked == False
                )
            )
            
            result = await db.execute(count_stmt)
            active_sessions = result.scalars().all()
            
            if len(active_sessions) >= self.max_sessions_per_user:
                # Revoke oldest sessions
                sessions_to_revoke = len(active_sessions) - self.max_sessions_per_user + 1
                oldest_sessions = sorted(active_sessions, key=lambda s: s.created_at)[:sessions_to_revoke]
                
                for session in oldest_sessions:
                    session.is_revoked = True
                
                await db.commit()
                logger.info(f"SESSION_LIMIT: Revoked {sessions_to_revoke} old sessions for user {user_id}")
                
        except Exception as e:
            logger.error(f"Error cleaning up user sessions: {str(e)}")
    
    def _get_cookie_config(self, expires_at: datetime, remember_me: bool = False) -> Dict[str, Any]:
        """Get cookie configuration for secure session management"""
        return {
            "httponly": self.http_only,
            "secure": self.secure_cookies,
            "samesite": self.same_site,
            "max_age": int((expires_at - datetime.utcnow()).total_seconds()),
            "expires": expires_at,
            "path": "/",
            "domain": None  # Let browser determine
        }

# Global session manager instance
session_manager = SecureSessionManager()