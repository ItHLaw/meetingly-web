"""
Comprehensive error handling middleware for FastAPI application.
Provides centralized error handling, logging, and user-friendly error responses.
"""

import logging
import traceback
import uuid
from datetime import datetime
from typing import Any, Dict, Optional, Union
from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import SQLAlchemyError, IntegrityError, OperationalError
from pydantic import ValidationError
import asyncio

from app.core.config import settings

logger = logging.getLogger(__name__)


class ErrorHandler:
    """Centralized error handling with categorization and logging."""
    
    def __init__(self):
        self.error_categories = {
            'authentication': [401, 403],
            'validation': [400, 422],
            'not_found': [404],
            'server_error': [500, 502, 503, 504],
            'rate_limit': [429],
            'database': ['sqlalchemy', 'database'],
            'external_service': ['api', 'service', 'network']
        }
    
    def categorize_error(self, error: Exception, status_code: int = None) -> str:
        """Categorize error for better handling and reporting."""
        
        if status_code:
            for category, codes in self.error_categories.items():
                if isinstance(codes, list) and status_code in codes:
                    return category
        
        error_type = type(error).__name__.lower()
        
        if 'sql' in error_type or 'database' in error_type:
            return 'database'
        elif 'validation' in error_type or 'pydantic' in error_type:
            return 'validation'
        elif 'auth' in error_type or 'permission' in error_type:
            return 'authentication'
        elif 'network' in error_type or 'connection' in error_type:
            return 'external_service'
        else:
            return 'server_error'
    
    def generate_error_id(self) -> str:
        """Generate unique error ID for tracking."""
        return f"err_{uuid.uuid4().hex[:8]}"
    
    def log_error(
        self, 
        error: Exception, 
        request: Request, 
        error_id: str,
        category: str,
        user_id: Optional[str] = None
    ) -> None:
        """Log error with context information."""
        
        error_details = {
            'error_id': error_id,
            'category': category,
            'error_type': type(error).__name__,
            'error_message': str(error),
            'request_method': request.method,
            'request_url': str(request.url),
            'request_headers': dict(request.headers),
            'user_id': user_id,
            'timestamp': datetime.utcnow().isoformat(),
            'traceback': traceback.format_exc() if settings.ENVIRONMENT == 'development' else None
        }
        
        # Log based on severity
        if category in ['server_error', 'database']:
            logger.error(f"Critical error {error_id}: {error}", extra=error_details)
        elif category in ['authentication', 'validation']:
            logger.warning(f"Client error {error_id}: {error}", extra=error_details)
        else:
            logger.info(f"Error {error_id}: {error}", extra=error_details)
    
    def format_error_response(
        self, 
        error: Exception, 
        status_code: int,
        error_id: str,
        category: str,
        include_details: bool = False
    ) -> Dict[str, Any]:
        """Format error response for API consumers."""
        
        response = {
            'error': True,
            'error_id': error_id,
            'category': category,
            'message': self.get_user_friendly_message(error, category),
            'timestamp': datetime.utcnow().isoformat()
        }
        
        if include_details and settings.ENVIRONMENT == 'development':
            response.update({
                'details': str(error),
                'type': type(error).__name__,
                'traceback': traceback.format_exc()
            })
        
        # Add retry information for certain error types
        if category in ['external_service', 'rate_limit']:
            response['retry_after'] = self.get_retry_delay(category)
        
        # Add validation details for validation errors
        if isinstance(error, (RequestValidationError, ValidationError)):
            response['validation_errors'] = self.format_validation_errors(error)
        
        return response
    
    def get_user_friendly_message(self, error: Exception, category: str) -> str:
        """Get user-friendly error message based on category."""
        
        messages = {
            'authentication': 'Authentication failed. Please log in again.',
            'validation': 'The provided data is invalid. Please check your input.',
            'not_found': 'The requested resource was not found.',
            'database': 'A database error occurred. Please try again later.',
            'external_service': 'An external service is temporarily unavailable. Please try again.',
            'rate_limit': 'Too many requests. Please slow down and try again.',
            'server_error': 'An internal server error occurred. Our team has been notified.'
        }
        
        # Check for specific error types
        if isinstance(error, HTTPException):
            return error.detail
        
        return messages.get(category, 'An unexpected error occurred.')
    
    def get_retry_delay(self, category: str) -> Optional[int]:
        """Get recommended retry delay in seconds."""
        
        delays = {
            'external_service': 30,
            'rate_limit': 60,
            'database': 10
        }
        
        return delays.get(category)
    
    def format_validation_errors(self, error: Union[RequestValidationError, ValidationError]) -> list:
        """Format validation errors for better client understanding."""
        
        formatted_errors = []
        
        if isinstance(error, RequestValidationError):
            for err in error.errors():
                formatted_errors.append({
                    'field': '.'.join(str(x) for x in err['loc'][1:]),  # Skip 'body' prefix
                    'message': err['msg'],
                    'type': err['type'],
                    'input': err.get('input')
                })
        elif isinstance(error, ValidationError):
            for err in error.errors():
                formatted_errors.append({
                    'field': '.'.join(str(x) for x in err['loc']),
                    'message': err['msg'],
                    'type': err['type'],
                    'input': err.get('input')
                })
        
        return formatted_errors


# Global error handler instance
error_handler = ErrorHandler()


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    """Handle HTTP exceptions."""
    
    error_id = error_handler.generate_error_id()
    category = error_handler.categorize_error(exc, exc.status_code)
    
    # Extract user ID from request if available
    user_id = getattr(request.state, 'user_id', None)
    
    # Log the error
    error_handler.log_error(exc, request, error_id, category, user_id)
    
    # Format response
    response_data = error_handler.format_error_response(
        exc, 
        exc.status_code, 
        error_id, 
        category,
        include_details=settings.ENVIRONMENT == 'development'
    )
    
    return JSONResponse(
        status_code=exc.status_code,
        content=response_data
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Handle request validation errors."""
    
    error_id = error_handler.generate_error_id()
    category = 'validation'
    
    # Extract user ID from request if available
    user_id = getattr(request.state, 'user_id', None)
    
    # Log the error
    error_handler.log_error(exc, request, error_id, category, user_id)
    
    # Format response
    response_data = error_handler.format_error_response(
        exc, 
        status.HTTP_422_UNPROCESSABLE_ENTITY, 
        error_id, 
        category,
        include_details=settings.ENVIRONMENT == 'development'
    )
    
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content=response_data
    )


async def sqlalchemy_exception_handler(request: Request, exc: SQLAlchemyError) -> JSONResponse:
    """Handle SQLAlchemy database errors."""
    
    error_id = error_handler.generate_error_id()
    category = 'database'
    
    # Extract user ID from request if available
    user_id = getattr(request.state, 'user_id', None)
    
    # Determine status code based on error type
    if isinstance(exc, IntegrityError):
        status_code = status.HTTP_409_CONFLICT
        message = "Data integrity constraint violated."
    elif isinstance(exc, OperationalError):
        status_code = status.HTTP_503_SERVICE_UNAVAILABLE
        message = "Database is temporarily unavailable."
    else:
        status_code = status.HTTP_500_INTERNAL_SERVER_ERROR
        message = "Database operation failed."
    
    # Create a custom exception for formatting
    formatted_exc = Exception(message)
    
    # Log the actual error with full details
    error_handler.log_error(exc, request, error_id, category, user_id)
    
    # Format response with user-friendly message
    response_data = error_handler.format_error_response(
        formatted_exc, 
        status_code, 
        error_id, 
        category,
        include_details=False  # Never expose database details
    )
    
    return JSONResponse(
        status_code=status_code,
        content=response_data
    )


async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Handle all other uncaught exceptions."""
    
    error_id = error_handler.generate_error_id()
    category = error_handler.categorize_error(exc)
    
    # Extract user ID from request if available
    user_id = getattr(request.state, 'user_id', None)
    
    # Log the error
    error_handler.log_error(exc, request, error_id, category, user_id)
    
    # Format response
    response_data = error_handler.format_error_response(
        exc, 
        status.HTTP_500_INTERNAL_SERVER_ERROR, 
        error_id, 
        category,
        include_details=settings.ENVIRONMENT == 'development'
    )
    
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=response_data
    )


def setup_error_handlers(app: FastAPI) -> None:
    """Setup all error handlers for the FastAPI application."""
    
    # HTTP exceptions
    app.add_exception_handler(HTTPException, http_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    
    # Validation errors
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    
    # Database errors
    app.add_exception_handler(SQLAlchemyError, sqlalchemy_exception_handler)
    
    # Catch-all for other exceptions
    app.add_exception_handler(Exception, general_exception_handler)
    
    logger.info("Error handlers configured successfully")


# Utility functions for services to use
def handle_service_error(error: Exception, context: str = "") -> HTTPException:
    """Convert service errors to appropriate HTTP exceptions."""
    
    error_id = error_handler.generate_error_id()
    category = error_handler.categorize_error(error)
    
    logger.error(f"Service error {error_id} in {context}: {error}")
    
    if isinstance(error, HTTPException):
        return error
    elif isinstance(error, (ValidationError, ValueError)):
        return HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Validation error: {str(error)}"
        )
    elif isinstance(error, PermissionError):
        return HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Permission denied"
        )
    elif isinstance(error, FileNotFoundError):
        return HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resource not found"
        )
    elif isinstance(error, SQLAlchemyError):
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database operation failed"
        )
    else:
        return HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal server error"
        )


# Decorator for automatic error handling in service methods
def handle_errors(context: str = ""):
    """Decorator to automatically handle errors in service methods."""
    
    def decorator(func):
        async def async_wrapper(*args, **kwargs):
            try:
                return await func(*args, **kwargs)
            except Exception as e:
                raise handle_service_error(e, context or func.__name__)
        
        def sync_wrapper(*args, **kwargs):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                raise handle_service_error(e, context or func.__name__)
        
        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
    
    return decorator