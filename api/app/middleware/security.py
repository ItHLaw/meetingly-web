"""
Security middleware for FastAPI application.
Implements security headers, input validation, and other security measures.
"""

import logging
from typing import Callable, Dict
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.datastructures import MutableHeaders
from app.core.config import settings

logger = logging.getLogger(__name__)

class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Middleware to add security headers to all responses
    
    Implements:
    - Content-Security-Policy
    - X-Content-Type-Options
    - X-Frame-Options
    - X-XSS-Protection
    - Strict-Transport-Security
    - Referrer-Policy
    - Permissions-Policy
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        
        if settings.SECURITY_HEADERS:
            self._add_security_headers(response)
        
        return response
    
    def _add_security_headers(self, response: Response) -> None:
        """Add security headers to response"""
        headers = response.headers
        
        # Content Security Policy
        csp_directives = [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",  # Allow inline styles for UI frameworks
            "img-src 'self' data:",  # Allow data: URLs for images
            "font-src 'self'",
            "connect-src 'self'",
            "media-src 'self'",
            "object-src 'none'",
            "frame-src 'self'",
            "base-uri 'self'",
            "form-action 'self'",
            "frame-ancestors 'self'",
            "upgrade-insecure-requests"
        ]
        
        # Add CSP header
        headers["Content-Security-Policy"] = "; ".join(csp_directives)
        
        # Prevent MIME type sniffing
        headers["X-Content-Type-Options"] = "nosniff"
        
        # Prevent clickjacking
        headers["X-Frame-Options"] = "SAMEORIGIN"
        
        # Enable XSS protection
        headers["X-XSS-Protection"] = "1; mode=block"
        
        # HTTP Strict Transport Security (only in production)
        if settings.ENVIRONMENT == "production":
            headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
        
        # Control referrer information
        headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        
        # Permissions policy (formerly Feature-Policy)
        permissions = [
            "accelerometer=())",
            "camera=()",
            "geolocation=()",
            "gyroscope=()",
            "magnetometer=()",
            "microphone=()",
            "payment=()",
            "usb=()"
        ]
        headers["Permissions-Policy"] = ", ".join(permissions)


class CSRFProtectionMiddleware(BaseHTTPMiddleware):
    """
    CSRF protection middleware
    
    Validates that state-changing requests (POST, PUT, DELETE) have proper CSRF tokens
    """
    
    CSRF_METHODS = {"POST", "PUT", "DELETE", "PATCH"}
    EXEMPT_PATHS = {"/auth/microsoft/callback"}
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip CSRF check if disabled
        if not settings.CSRF_PROTECTION:
            return await call_next(request)
        
        # Skip CSRF check for exempt paths
        if request.url.path in self.EXEMPT_PATHS:
            return await call_next(request)
        
        # Only check CSRF for state-changing methods
        if request.method in self.CSRF_METHODS:
            # Check for CSRF token
            csrf_token = request.headers.get("X-CSRF-Token")
            cookie_token = request.cookies.get("csrf_token")
            
            if not csrf_token or not cookie_token or csrf_token != cookie_token:
                logger.warning(f"CSRF validation failed for {request.method} {request.url.path}")
                return Response(
                    content="CSRF token validation failed",
                    status_code=403,
                    media_type="text/plain"
                )
        
        response = await call_next(request)
        
        return response


class InputValidationMiddleware(BaseHTTPMiddleware):
    """
    Input validation and sanitization middleware
    
    Performs basic validation and sanitization of request inputs
    """
    
    # Maximum content length (10MB)
    MAX_CONTENT_LENGTH = 10 * 1024 * 1024
    
    # Blocked file extensions
    BLOCKED_EXTENSIONS = {
        ".exe", ".dll", ".bat", ".cmd", ".sh", ".js", ".php", ".jar", ".py"
    }
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Check content length
        content_length = request.headers.get("content-length")
        if content_length and int(content_length) > self.MAX_CONTENT_LENGTH:
            logger.warning(f"Request content too large: {content_length} bytes")
            return Response(
                content="Request entity too large",
                status_code=413,
                media_type="text/plain"
            )
        
        # Check for file uploads with blocked extensions
        if request.method == "POST" and "multipart/form-data" in request.headers.get("content-type", ""):
            try:
                form = await request.form()
                for field_name, field_value in form.items():
                    if hasattr(field_value, "filename") and field_value.filename:
                        filename = field_value.filename.lower()
                        extension = "." + filename.split(".")[-1] if "." in filename else ""
                        
                        if extension in self.BLOCKED_EXTENSIONS:
                            logger.warning(f"Blocked file upload with extension {extension}: {filename}")
                            return Response(
                                content=f"File type {extension} not allowed",
                                status_code=400,
                                media_type="text/plain"
                            )
            except Exception as e:
                logger.error(f"Error validating form data: {str(e)}")
        
        response = await call_next(request)
        return response