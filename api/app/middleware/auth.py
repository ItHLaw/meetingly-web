from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.core.database import AsyncSessionLocal
from app.models import User, UserSession
from app.services.auth import AuthService
from app.core.config import settings
import logging
import time
import re
from datetime import datetime
from typing import Set, Optional
from urllib.parse import unquote
import json

logger = logging.getLogger(__name__)

class UserIsolationMiddleware(BaseHTTPMiddleware):
    """
    Enhanced authentication and user isolation middleware
    
    Features:
    - User authentication via JWT tokens and session cookies
    - User isolation enforcement on all database operations
    - Comprehensive access logging and audit trail
    - Authorization checks for resource access
    - Rate limiting and security monitoring
    """
    
    # Routes that don't require authentication
    EXEMPT_PATHS: Set[str] = {
        "/",
        "/health",
        "/docs",
        "/redoc",
        "/openapi.json",
        "/auth/microsoft/callback",
        "/auth/microsoft/login",
        "/auth/microsoft/token",
        "/auth/refresh"
    }
    
    # Routes that require additional authorization checks
    ADMIN_PATHS: Set[str] = {
        "/api/admin",
        "/api/system"
    }
    
    # Resource patterns that require user ownership validation
    USER_RESOURCE_PATTERNS = [
        re.compile(r"/api/meetings/([a-f0-9\-]{36})"),
        re.compile(r"/api/audio/([a-f0-9\-]{36})"),
        re.compile(r"/api/transcripts/([a-f0-9\-]{36})"),
        re.compile(r"/api/config/user/([a-f0-9\-]{36})")
    ]
    
    def __init__(self, app):
        super().__init__(app)
        self.auth_service = AuthService()
        
        # Security monitoring
        self.failed_attempts = {}  # Simple in-memory tracking
        self.max_failed_attempts = 5
        self.lockout_duration = 300  # 5 minutes
    
    async def dispatch(self, request: Request, call_next) -> Response:
        start_time = time.time()
        
        # Extract client information for logging
        client_ip = self._get_client_ip(request)
        user_agent = request.headers.get("User-Agent", "Unknown")
        path = request.url.path
        method = request.method
        
        # Log all access attempts (except health checks)
        if path not in {"/", "/health"}:
            logger.info(f"ACCESS_ATTEMPT: {method} {path} from {client_ip}")
        
        try:
            # Skip authentication for exempt paths
            if self._is_exempt_path(path):
                response = await call_next(request)
                self._log_request(request, response, start_time, "EXEMPT")
                return response
            
            # Skip authentication for OPTIONS requests (CORS preflight)
            if method == "OPTIONS":
                response = await call_next(request)
                self._log_request(request, response, start_time, "CORS_PREFLIGHT")
                return response
            
            # Check for IP-based rate limiting/lockout
            if self._is_ip_locked(client_ip):
                logger.warning(f"BLOCKED_IP: {client_ip} - too many failed attempts")
                return JSONResponse(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    content={
                        "error": "Too many failed attempts",
                        "message": "IP temporarily blocked due to security concerns"
                    }
                )
            
            # Authenticate user
            user = await self._authenticate_user(request, client_ip, user_agent)
            
            if not user:
                self._record_failed_attempt(client_ip)
                logger.warning(f"AUTH_FAILED: {method} {path} from {client_ip}")
                return JSONResponse(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    content={
                        "error": "Authentication required",
                        "message": "Valid authentication token required"
                    }
                )
            
            # Clear failed attempts on successful auth
            self._clear_failed_attempts(client_ip)
            
            # Set user context in request state
            request.state.user = user
            request.state.user_id = str(user.id)
            request.state.tenant_id = user.tenant_id
            
            # Perform authorization checks
            if not await self._authorize_request(request, user):
                logger.warning(f"AUTHORIZATION_DENIED: {method} {path} for user {user.id}")
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={
                        "error": "Access denied",
                        "message": "Insufficient permissions for this resource"
                    }
                )
            
            # Log successful authentication
            logger.info(f"AUTH_SUCCESS: User {user.id} ({user.email}) accessing {method} {path}")
            
            # Process request
            response = await call_next(request)
            
            # Log successful request
            self._log_request(request, response, start_time, "SUCCESS")
            
            return response
            
        except Exception as e:
            logger.error(f"USER_ISOLATION_ERROR: {str(e)} for {method} {path} from {client_ip}")
            return JSONResponse(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                content={
                    "error": "Internal server error",
                    "message": "Request processing failed"
                }
            )
    
    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP address from request headers"""
        # Check for forwarded headers (Railway, CloudFlare, etc.)
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()
        
        forwarded = request.headers.get("X-Forwarded")
        if forwarded:
            return forwarded.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        # Fallback to client host
        return request.client.host if request.client else "unknown"
    
    def _is_exempt_path(self, path: str) -> bool:
        """Check if path is exempt from authentication"""
        if path in self.EXEMPT_PATHS:
            return True
        
        # Check for exempt path patterns
        exempt_patterns = [
            "/static/",
            "/favicon.ico",
            "/.well-known/"
        ]
        
        return any(path.startswith(pattern) for pattern in exempt_patterns)
    
    def _is_ip_locked(self, client_ip: str) -> bool:
        """Check if IP is temporarily locked due to failed attempts"""
        if client_ip not in self.failed_attempts:
            return False
        
        attempts, last_attempt = self.failed_attempts[client_ip]
        
        # Clear old attempts
        if time.time() - last_attempt > self.lockout_duration:
            del self.failed_attempts[client_ip]
            return False
        
        return attempts >= self.max_failed_attempts
    
    def _record_failed_attempt(self, client_ip: str):
        """Record failed authentication attempt"""
        now = time.time()
        if client_ip in self.failed_attempts:
            attempts, _ = self.failed_attempts[client_ip]
            self.failed_attempts[client_ip] = (attempts + 1, now)
        else:
            self.failed_attempts[client_ip] = (1, now)
    
    def _clear_failed_attempts(self, client_ip: str):
        """Clear failed attempts for successful authentication"""
        if client_ip in self.failed_attempts:
            del self.failed_attempts[client_ip]
    
    async def _authenticate_user(self, request: Request, client_ip: str, user_agent: str) -> Optional[User]:
        """Authenticate user via JWT token or session cookie"""
        user = None
        auth_method = None
        
        # Try JWT token first (preferred method)
        auth_header = request.headers.get("Authorization")
        if auth_header and auth_header.startswith("Bearer "):
            jwt_token = auth_header[7:]  # Remove "Bearer " prefix
            user = await self._authenticate_jwt(jwt_token)
            if user:
                auth_method = "JWT"
        
        # Fallback to session cookie
        if not user:
            session_token = request.cookies.get("session_token")
            if session_token:
                user = await self._authenticate_session(session_token, client_ip, user_agent)
                if user:
                    auth_method = "SESSION"
        
        if user and auth_method:
            logger.debug(f"AUTH_METHOD: {auth_method} for user {user.id}")
            
            # Update last login time periodically (not on every request)
            if not user.last_login_at or (time.time() - user.last_login_at.timestamp()) > 3600:  # 1 hour
                await self._update_last_login(user)
        
        return user
    
    async def _authenticate_jwt(self, jwt_token: str) -> Optional[User]:
        """Authenticate user via JWT token"""
        try:
            jwt_payload = self.auth_service.verify_jwt_token(jwt_token)
            
            if not jwt_payload or jwt_payload.get("type") != "access":
                return None
            
            # Get user from database
            async with AsyncSessionLocal() as db:
                stmt = select(User).where(
                    and_(
                        User.id == jwt_payload.get("sub"),
                        User.is_active == True
                    )
                )
                result = await db.execute(stmt)
                return result.scalar_one_or_none()
                
        except Exception as e:
            logger.debug(f"JWT authentication failed: {str(e)}")
            return None
    
    async def _authenticate_session(self, session_token: str, client_ip: str, user_agent: str) -> Optional[User]:
        """Authenticate user via session cookie"""
        try:
            async with AsyncSessionLocal() as db:
                user = await self.auth_service.validate_session(
                    session_token=session_token, 
                    db=db,
                    client_ip=client_ip
                )
                
                return user
                
        except Exception as e:
            logger.debug(f"Session authentication failed: {str(e)}")
            return None
    
    async def _update_last_login(self, user: User):
        """Update user's last login timestamp"""
        try:
            async with AsyncSessionLocal() as db:
                user_query = select(User).where(User.id == user.id)
                result = await db.execute(user_query)
                db_user = result.scalar_one_or_none()
                
                if db_user:
                    db_user.last_login_at = datetime.utcnow()
                    await db.commit()
                    
        except Exception as e:
            logger.error(f"Failed to update last login: {str(e)}")
    
    async def _authorize_request(self, request: Request, user: User) -> bool:
        """Perform authorization checks for the request"""
        path = request.url.path
        method = request.method
        
        # Check admin paths
        if any(path.startswith(admin_path) for admin_path in self.ADMIN_PATHS):
            # TODO: Implement admin role checking
            logger.warning(f"ADMIN_ACCESS_ATTEMPT: User {user.id} trying to access {path}")
            return False
        
        # Check resource ownership for user-specific resources
        if method in {"GET", "PUT", "PATCH", "DELETE"}:
            resource_id = self._extract_resource_id(path)
            if resource_id:
                return await self._validate_resource_ownership(user.id, path, resource_id)
        
        return True
    
    def _extract_resource_id(self, path: str) -> Optional[str]:
        """Extract resource ID from URL path"""
        for pattern in self.USER_RESOURCE_PATTERNS:
            match = pattern.search(path)
            if match:
                return match.group(1)
        return None
    
    async def _validate_resource_ownership(self, user_id: str, path: str, resource_id: str) -> bool:
        """Validate that user owns the requested resource"""
        try:
            async with AsyncSessionLocal() as db:
                # Check meeting ownership
                if "/api/meetings/" in path:
                    from app.models import Meeting
                    stmt = select(Meeting).where(
                        and_(Meeting.id == resource_id, Meeting.user_id == user_id)
                    )
                    result = await db.execute(stmt)
                    return result.scalar_one_or_none() is not None
                
                # Add other resource ownership checks as needed
                # TODO: Implement for transcripts, audio files, etc.
                
        except Exception as e:
            logger.error(f"Resource ownership validation failed: {str(e)}")
            return False
        
        return True
    
    def _log_request(self, request: Request, response: Response, start_time: float, status: str):
        """Log request details for audit trail"""
        if request.url.path in {"/health"}:
            return  # Skip health check logging
        
        duration = round((time.time() - start_time) * 1000, 2)  # milliseconds
        
        user_id = getattr(request.state, 'user_id', 'anonymous')
        client_ip = self._get_client_ip(request)
        
        logger.info(
            f"REQUEST_LOG: {status} | "
            f"{request.method} {request.url.path} | "
            f"User: {user_id} | "
            f"IP: {client_ip} | "
            f"Status: {response.status_code} | "
            f"Duration: {duration}ms"
        )

# Legacy alias for backward compatibility
AuthMiddleware = UserIsolationMiddleware

# Enhanced dependency functions with user isolation support

async def get_current_user(request: Request) -> User:
    """
    Dependency to get the current authenticated user from request state
    """
    if not hasattr(request.state, 'user'):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    return request.state.user

async def get_current_user_id(request: Request) -> str:
    """
    Dependency to get the current authenticated user ID from request state
    """
    if not hasattr(request.state, 'user_id'):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    return request.state.user_id

async def get_current_tenant_id(request: Request) -> str:
    """
    Dependency to get the current user's tenant ID for multi-tenant isolation
    """
    if not hasattr(request.state, 'tenant_id'):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required"
        )
    return request.state.tenant_id

def require_user_isolation(func):
    """
    Decorator to ensure user isolation in service methods
    Usage: @require_user_isolation on service methods that need user filtering
    """
    def wrapper(*args, user_id: str = None, **kwargs):
        if not user_id:
            raise ValueError("user_id is required for user-isolated operations")
        return func(*args, user_id=user_id, **kwargs)
    return wrapper

