"""
Rate limiting middleware for FastAPI application.
Implements per-user and per-IP rate limiting to prevent abuse.
"""

import time
import logging
from typing import Dict, Tuple, Optional, Set
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from starlette.status import HTTP_429_TOO_MANY_REQUESTS
from app.core.config import settings
from app.core.database import get_redis_client

logger = logging.getLogger(__name__)

class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Rate limiting middleware with Redis-based storage for distributed deployments.
    
    Features:
    - Per-user rate limiting based on authenticated user ID
    - Per-IP rate limiting for unauthenticated requests
    - Configurable rate limits for different endpoint groups
    - Redis-based storage for distributed deployments
    - Automatic cleanup of expired rate limit data
    """
    
    # Paths exempt from rate limiting
    EXEMPT_PATHS: Set[str] = {
        "/",
        "/health",
        "/health/ready",
        "/health/live",
        "/docs",
        "/redoc",
        "/openapi.json"
    }
    
    # Custom rate limits for specific paths (requests per minute)
    CUSTOM_LIMITS: Dict[str, int] = {
        "/auth/": 10,                # Login endpoints
        "/api/audio/upload": 5,      # File upload endpoints
        "/api/meetings/create": 10,  # Meeting creation
    }
    
    def __init__(self, app):
        super().__init__(app)
        self.default_limit = settings.RATE_LIMIT_PER_MINUTE
        self.window_size = 60  # 1 minute window in seconds
        
        # In-memory fallback if Redis is unavailable
        self.local_rate_limits: Dict[str, Tuple[int, float]] = {}
        
        logger.info(f"Rate limiting initialized with default limit of {self.default_limit} requests per minute")
    
    async def dispatch(self, request: Request, call_next) -> Response:
        # Skip rate limiting for exempt paths
        path = request.url.path
        if self._is_exempt_path(path):
            return await call_next(request)
        
        # Get rate limit key and limit for this request
        rate_limit_key = await self._get_rate_limit_key(request)
        rate_limit = self._get_rate_limit_for_path(path)
        
        # Check if rate limit exceeded
        exceeded, current_count, reset_time = await self._check_rate_limit(rate_limit_key, rate_limit)
        
        if exceeded:
            logger.warning(f"Rate limit exceeded for {rate_limit_key} on {request.method} {path}")
            
            # Calculate seconds until reset
            reset_seconds = max(1, int(reset_time - time.time()))
            
            # Return 429 Too Many Requests
            return JSONResponse(
                status_code=HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "Too many requests",
                    "message": f"Rate limit of {rate_limit} requests per minute exceeded",
                    "retry_after": reset_seconds
                },
                headers={
                    "Retry-After": str(reset_seconds),
                    "X-RateLimit-Limit": str(rate_limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(reset_time))
                }
            )
        
        # Process the request
        response = await call_next(request)
        
        # Add rate limit headers to response
        remaining = max(0, rate_limit - current_count)
        response.headers["X-RateLimit-Limit"] = str(rate_limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(reset_time))
        
        return response
    
    def _is_exempt_path(self, path: str) -> bool:
        """Check if path is exempt from rate limiting"""
        if path in self.EXEMPT_PATHS:
            return True
        
        # Check for exempt path patterns
        exempt_patterns = [
            "/static/",
            "/favicon.ico",
            "/.well-known/"
        ]
        
        return any(path.startswith(pattern) for pattern in exempt_patterns)
    
    def _get_rate_limit_for_path(self, path: str) -> int:
        """Get the rate limit for a specific path"""
        # Check for custom limits
        for prefix, limit in self.CUSTOM_LIMITS.items():
            if path.startswith(prefix):
                return limit
        
        # Use default limit
        return self.default_limit
    
    async def _get_rate_limit_key(self, request: Request) -> str:
        """
        Get a unique key for rate limiting based on user ID or IP address
        """
        # Use user ID if authenticated
        user_id = getattr(request.state, "user_id", None)
        if user_id:
            return f"ratelimit:user:{user_id}"
        
        # Fall back to IP address
        client_ip = self._get_client_ip(request)
        return f"ratelimit:ip:{client_ip}"
    
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
    
    async def _check_rate_limit(self, key: str, limit: int) -> Tuple[bool, int, float]:
        """
        Check if rate limit is exceeded
        
        Returns:
        - exceeded: True if rate limit exceeded
        - current_count: Current request count
        - reset_time: Timestamp when the rate limit resets
        """
        now = time.time()
        window_start = int(now - self.window_size)
        expiry = self.window_size * 2  # Keep data for twice the window size
        
        try:
            # Try to use Redis for distributed rate limiting
            redis_client = await get_redis_client()
            
            if redis_client:
                # Use Redis sorted set for sliding window rate limiting
                # Remove old entries
                await redis_client.zremrangebyscore(key, 0, window_start)
                
                # Add current request
                await redis_client.zadd(key, {str(now): now})
                
                # Set expiry on the key
                await redis_client.expire(key, expiry)
                
                # Count requests in current window
                count = await redis_client.zcount(key, window_start, "+inf")
                
                # Calculate reset time (end of current window)
                reset_time = now + self.window_size
                
                return count > limit, count, reset_time
            
            # Fall back to in-memory rate limiting if Redis is unavailable
            return self._check_rate_limit_local(key, limit, now, window_start)
            
        except Exception as e:
            logger.error(f"Error checking rate limit: {str(e)}")
            # Fall back to in-memory rate limiting
            return self._check_rate_limit_local(key, limit, now, window_start)
    
    def _check_rate_limit_local(self, key: str, limit: int, now: float, window_start: float) -> Tuple[bool, int, float]:
        """Local in-memory fallback for rate limiting"""
        # Clean up expired entries periodically
        if now % 60 < 1:  # Cleanup once per minute
            self._cleanup_expired_limits(now - self.window_size)
        
        # Initialize if key doesn't exist
        if key not in self.local_rate_limits:
            self.local_rate_limits[key] = (1, now)
            return False, 1, now + self.window_size
        
        count, last_request = self.local_rate_limits[key]
        
        # Reset counter if outside window
        if last_request < window_start:
            self.local_rate_limits[key] = (1, now)
            return False, 1, now + self.window_size
        
        # Increment counter
        count += 1
        self.local_rate_limits[key] = (count, now)
        
        # Calculate reset time
        reset_time = last_request + self.window_size
        
        return count > limit, count, reset_time
    
    def _cleanup_expired_limits(self, cutoff_time: float):
        """Clean up expired rate limit entries"""
        keys_to_remove = []
        for key, (_, timestamp) in self.local_rate_limits.items():
            if timestamp < cutoff_time:
                keys_to_remove.append(key)
        
        for key in keys_to_remove:
            del self.local_rate_limits[key]