"""
API Versioning and Compatibility Management

This module provides API versioning capabilities to maintain backward compatibility
while allowing for API evolution. It supports multiple API versions simultaneously
and provides migration paths for clients.
"""

from fastapi import Request, HTTPException, status
from typing import Dict, Any, Optional, Callable
from enum import Enum
import re
import logging

logger = logging.getLogger(__name__)

class APIVersion(Enum):
    """Supported API versions"""
    V1 = "v1"
    V2 = "v2"
    LATEST = "v2"  # Points to the latest stable version

class VersionExtractor:
    """Extract API version from request"""
    
    @staticmethod
    def from_header(request: Request) -> Optional[str]:
        """Extract version from Accept header"""
        accept_header = request.headers.get("accept", "")
        # Look for application/vnd.meetily.v1+json pattern
        match = re.search(r'application/vnd\.meetily\.v(\d+)\+json', accept_header)
        if match:
            return f"v{match.group(1)}"
        return None
    
    @staticmethod
    def from_path(request: Request) -> Optional[str]:
        """Extract version from URL path"""
        path = request.url.path
        # Look for /api/v1/ pattern
        match = re.search(r'/api/(v\d+)/', path)
        if match:
            return match.group(1)
        return None
    
    @staticmethod
    def from_query(request: Request) -> Optional[str]:
        """Extract version from query parameter"""
        return request.query_params.get("version")
    
    @staticmethod
    def get_version(request: Request) -> str:
        """Get API version from request using multiple strategies"""
        # Try different extraction methods in order of preference
        version = (
            VersionExtractor.from_header(request) or
            VersionExtractor.from_path(request) or
            VersionExtractor.from_query(request) or
            APIVersion.LATEST.value
        )
        
        # Validate version
        try:
            APIVersion(version)
            return version
        except ValueError:
            logger.warning(f"Invalid API version requested: {version}, using latest")
            return APIVersion.LATEST.value

class ResponseTransformer:
    """Transform responses between API versions"""
    
    def __init__(self):
        self.transformers: Dict[str, Dict[str, Callable]] = {
            "v1": {
                "meeting": self._transform_meeting_to_v1,
                "meeting_list": self._transform_meeting_list_to_v1,
                "audio_upload": self._transform_audio_upload_to_v1,
                "processing_job": self._transform_processing_job_to_v1,
            },
            "v2": {
                "meeting": self._transform_meeting_to_v2,
                "meeting_list": self._transform_meeting_list_to_v2,
                "audio_upload": self._transform_audio_upload_to_v2,
                "processing_job": self._transform_processing_job_to_v2,
            }
        }
    
    def transform(self, data: Any, data_type: str, target_version: str) -> Any:
        """Transform data to target API version format"""
        if target_version not in self.transformers:
            logger.warning(f"No transformers for version {target_version}")
            return data
        
        transformer = self.transformers[target_version].get(data_type)
        if not transformer:
            logger.warning(f"No transformer for {data_type} in version {target_version}")
            return data
        
        try:
            return transformer(data)
        except Exception as e:
            logger.error(f"Transformation failed for {data_type} to {target_version}: {str(e)}")
            return data
    
    def _transform_meeting_to_v1(self, meeting_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform meeting data to v1 format (legacy desktop app compatibility)"""
        # V1 format matches the original desktop app structure
        transformed = {
            "id": meeting_data.get("id"),
            "title": meeting_data.get("name"),  # V1 used 'title' instead of 'name'
            "created_at": meeting_data.get("created_at"),
            "updated_at": meeting_data.get("updated_at"),
            "transcript_text": meeting_data.get("transcript_text"),
            "summary_data": meeting_data.get("summary_data"),
            "processing_status": meeting_data.get("processing_status", "completed")
        }
        
        # Remove None values
        return {k: v for k, v in transformed.items() if v is not None}
    
    def _transform_meeting_to_v2(self, meeting_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform meeting data to v2 format (current web app format)"""
        # V2 is the current format, no transformation needed
        return meeting_data
    
    def _transform_meeting_list_to_v1(self, meeting_list_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform meeting list to v1 format"""
        meetings = meeting_list_data.get("meetings", [])
        transformed_meetings = [
            self._transform_meeting_to_v1(meeting) for meeting in meetings
        ]
        
        # V1 format was simpler - just return the meetings array
        return {
            "meetings": transformed_meetings,
            "total": len(transformed_meetings)
        }
    
    def _transform_meeting_list_to_v2(self, meeting_list_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform meeting list to v2 format"""
        return meeting_list_data
    
    def _transform_audio_upload_to_v1(self, upload_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform audio upload response to v1 format"""
        # V1 format was simpler
        return {
            "success": upload_data.get("success", True),
            "job_id": upload_data.get("job_id"),
            "meeting_id": upload_data.get("meeting_id"),
            "message": upload_data.get("message", "Upload successful")
        }
    
    def _transform_audio_upload_to_v2(self, upload_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform audio upload response to v2 format"""
        return upload_data
    
    def _transform_processing_job_to_v1(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform processing job to v1 format"""
        # V1 format used different field names
        return {
            "id": job_data.get("job_id"),
            "meeting_id": job_data.get("meeting_id"),
            "status": job_data.get("status"),
            "progress": job_data.get("progress", 0),
            "error": job_data.get("error_message"),
            "result": job_data.get("result"),
            "created_at": job_data.get("created_at"),
            "updated_at": job_data.get("updated_at")
        }
    
    def _transform_processing_job_to_v2(self, job_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform processing job to v2 format"""
        return job_data

class RequestTransformer:
    """Transform requests between API versions"""
    
    def __init__(self):
        self.transformers: Dict[str, Dict[str, Callable]] = {
            "v1": {
                "meeting_create": self._transform_meeting_create_from_v1,
                "meeting_update": self._transform_meeting_update_from_v1,
                "audio_upload": self._transform_audio_upload_from_v1,
            },
            "v2": {
                "meeting_create": self._transform_meeting_create_from_v2,
                "meeting_update": self._transform_meeting_update_from_v2,
                "audio_upload": self._transform_audio_upload_from_v2,
            }
        }
    
    def transform(self, data: Any, data_type: str, source_version: str) -> Any:
        """Transform request data from source API version to current format"""
        if source_version not in self.transformers:
            return data
        
        transformer = self.transformers[source_version].get(data_type)
        if not transformer:
            return data
        
        try:
            return transformer(data)
        except Exception as e:
            logger.error(f"Request transformation failed for {data_type} from {source_version}: {str(e)}")
            return data
    
    def _transform_meeting_create_from_v1(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform meeting creation request from v1 to current format"""
        # V1 used 'title' instead of 'name'
        transformed = request_data.copy()
        if "title" in transformed:
            transformed["name"] = transformed.pop("title")
        
        # Set default values for new fields
        transformed.setdefault("meeting_type", "general")
        transformed.setdefault("status", "scheduled")
        transformed.setdefault("duration_minutes", 120)
        
        return transformed
    
    def _transform_meeting_create_from_v2(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform meeting creation request from v2 (no transformation needed)"""
        return request_data
    
    def _transform_meeting_update_from_v1(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform meeting update request from v1 to current format"""
        transformed = request_data.copy()
        if "title" in transformed:
            transformed["name"] = transformed.pop("title")
        return transformed
    
    def _transform_meeting_update_from_v2(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform meeting update request from v2 (no transformation needed)"""
        return request_data
    
    def _transform_audio_upload_from_v1(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform audio upload request from v1 to current format"""
        # V1 had simpler upload parameters
        transformed = request_data.copy()
        
        # Set default values for new parameters
        transformed.setdefault("enable_diarization", True)
        transformed.setdefault("model", "base")
        transformed.setdefault("language", "auto")
        transformed.setdefault("temperature", 0.0)
        transformed.setdefault("beam_size", 5)
        transformed.setdefault("word_timestamps", True)
        
        return transformed
    
    def _transform_audio_upload_from_v2(self, request_data: Dict[str, Any]) -> Dict[str, Any]:
        """Transform audio upload request from v2 (no transformation needed)"""
        return request_data

class CompatibilityMiddleware:
    """Middleware to handle API version compatibility"""
    
    def __init__(self):
        self.response_transformer = ResponseTransformer()
        self.request_transformer = RequestTransformer()
    
    def get_api_version(self, request: Request) -> str:
        """Get API version from request"""
        return VersionExtractor.get_version(request)
    
    def transform_request(self, request_data: Any, data_type: str, version: str) -> Any:
        """Transform incoming request to current format"""
        return self.request_transformer.transform(request_data, data_type, version)
    
    def transform_response(self, response_data: Any, data_type: str, version: str) -> Any:
        """Transform outgoing response to requested version format"""
        return self.response_transformer.transform(response_data, data_type, version)
    
    def add_version_headers(self, response: Any, version: str, endpoint: str) -> None:
        """Add version-related headers to response"""
        # Add current API version header
        response.headers["X-API-Version"] = version
        
        # Add deprecation headers if needed
        deprecation_headers = DeprecationWarning.get_deprecation_headers(version, endpoint)
        for key, value in deprecation_headers.items():
            response.headers[key] = value

# Global compatibility middleware instance
compatibility_middleware = CompatibilityMiddleware()

def get_api_version(request: Request) -> str:
    """Dependency to get API version from request"""
    return compatibility_middleware.get_api_version(request)

def validate_api_version(version: str) -> None:
    """Validate that the requested API version is supported"""
    try:
        APIVersion(version)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported API version: {version}. Supported versions: {[v.value for v in APIVersion]}"
        )

def versioned_endpoint(data_type: str):
    """
    Decorator to add automatic API versioning to endpoints
    
    Args:
        data_type: Type of data being returned (e.g., 'meeting', 'meeting_list', 'audio_upload')
    """
    def decorator(func):
        from functools import wraps
        
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # Extract request and response from kwargs
            request = None
            response = None
            
            for arg in args:
                if hasattr(arg, 'url') and hasattr(arg, 'headers'):
                    request = arg
                    break
            
            for key, value in kwargs.items():
                if hasattr(value, 'url') and hasattr(value, 'headers'):
                    request = value
                elif hasattr(value, 'headers') and hasattr(value, 'status_code'):
                    response = value
            
            if not request:
                # If no request found, call function normally
                return await func(*args, **kwargs)
            
            # Get API version from request
            api_version = compatibility_middleware.get_api_version(request)
            validate_api_version(api_version)
            
            # Call the original function
            result = await func(*args, **kwargs)
            
            # Transform response if needed
            if api_version != APIVersion.LATEST.value:
                result = compatibility_middleware.transform_response(result, data_type, api_version)
            
            # Add version headers if response object is available
            if response:
                compatibility_middleware.add_version_headers(response, api_version, request.url.path)
            
            return result
        
        return wrapper
    return decorator

class DeprecationWarning:
    """Handle API deprecation warnings"""
    
    DEPRECATED_ENDPOINTS = {
        "v1": {
            "/api/meetings": {
                "deprecated_in": "v2",
                "removal_in": "v3",
                "message": "Use /api/v2/meetings instead",
                "migration_guide": "https://docs.meetily.com/api/migration/v1-to-v2"
            }
        }
    }
    
    @staticmethod
    def get_deprecation_headers(version: str, endpoint: str) -> Dict[str, str]:
        """Get deprecation headers for response"""
        headers = {}
        
        if version in DeprecationWarning.DEPRECATED_ENDPOINTS:
            endpoint_info = DeprecationWarning.DEPRECATED_ENDPOINTS[version].get(endpoint)
            if endpoint_info:
                headers.update({
                    "X-API-Deprecated": "true",
                    "X-API-Deprecated-Version": version,
                    "X-API-Deprecated-Message": endpoint_info["message"],
                    "X-API-Migration-Guide": endpoint_info["migration_guide"]
                })
        
        return headers