"""
API Versioning Middleware

This middleware automatically handles API version detection and response transformation
for all endpoints, ensuring backward compatibility across API versions.
"""

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
import json
import logging
from typing import Any, Dict

from app.api.versioning import compatibility_middleware, APIVersion, validate_api_version

logger = logging.getLogger(__name__)

class APIVersioningMiddleware(BaseHTTPMiddleware):
    """
    Middleware that automatically handles API versioning for all endpoints
    """
    
    def __init__(self, app, exclude_paths: list = None):
        super().__init__(app)
        self.exclude_paths = exclude_paths or [
            "/docs", "/redoc", "/openapi.json", "/health", "/auth"
        ]
    
    async def dispatch(self, request: Request, call_next):
        # Skip versioning for excluded paths
        if any(request.url.path.startswith(path) for path in self.exclude_paths):
            return await call_next(request)
        
        # Skip if not an API endpoint
        if not request.url.path.startswith("/api") and not request.url.path.startswith("/meetings") and not request.url.path.startswith("/audio"):
            return await call_next(request)
        
        try:
            # Get API version from request
            api_version = compatibility_middleware.get_api_version(request)
            validate_api_version(api_version)
            
            # Store version in request state for use by endpoints
            request.state.api_version = api_version
            
            # Process the request
            response = await call_next(request)
            
            # Add version headers to response
            if hasattr(response, 'headers'):
                response.headers["X-API-Version"] = api_version
                
                # Add deprecation headers for v1
                if api_version == "v1":
                    response.headers["X-API-Deprecated"] = "true"
                    response.headers["X-API-Deprecated-Version"] = "v1"
                    response.headers["X-API-Deprecated-Message"] = "API v1 is deprecated. Please migrate to v2."
                    response.headers["X-API-Migration-Guide"] = "https://docs.meetily.com/api/migration/v1-to-v2"
            
            # Transform response if needed for v1 compatibility
            if api_version == "v1" and isinstance(response, JSONResponse):
                try:
                    # Get response content
                    response_content = json.loads(response.body.decode())
                    
                    # Determine data type based on endpoint
                    data_type = self._determine_data_type(request.url.path, response_content)
                    
                    if data_type:
                        # Transform response to v1 format
                        transformed_content = compatibility_middleware.transform_response(
                            response_content, data_type, api_version
                        )
                        
                        # Create new response with transformed content
                        response = JSONResponse(
                            content=transformed_content,
                            status_code=response.status_code,
                            headers=dict(response.headers)
                        )
                
                except Exception as e:
                    logger.warning(f"Failed to transform response for v1: {str(e)}")
                    # Return original response if transformation fails
            
            return response
            
        except Exception as e:
            logger.error(f"API versioning middleware error: {str(e)}")
            # Return original response if middleware fails
            return await call_next(request)
    
    def _determine_data_type(self, path: str, content: Any) -> str:
        """
        Determine the data type based on the endpoint path and response content
        """
        if "/meetings" in path:
            if isinstance(content, dict):
                if "meetings" in content and isinstance(content["meetings"], list):
                    return "meeting_list"
                elif "id" in content and "name" in content:
                    return "meeting"
        
        elif "/audio" in path:
            if "upload" in path:
                return "audio_upload"
            elif "status" in path or "job" in path:
                return "processing_job"
        
        return None

def get_request_api_version(request: Request) -> str:
    """
    Get API version from request state (set by middleware)
    """
    return getattr(request.state, 'api_version', APIVersion.LATEST.value)