"""
Monitoring and logging utilities for the Meetily API
"""

import logging
import time
import functools
from typing import Any, Callable, Dict, Optional
from datetime import datetime
import json
import os
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

class StructuredLogger:
    """
    Structured logging utility for consistent log formatting
    """
    
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
        self.request_id = None
        self.user_id = None
    
    def set_context(self, request_id: Optional[str] = None, user_id: Optional[str] = None):
        """Set context for all subsequent log messages"""
        self.request_id = request_id
        self.user_id = user_id
    
    def _format_message(self, message: str, extra: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """Format log message with context"""
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "message": message,
            "service": "meetily-api"
        }
        
        if self.request_id:
            log_data["request_id"] = self.request_id
        
        if self.user_id:
            log_data["user_id"] = self.user_id
        
        if extra:
            log_data.update(extra)
        
        return log_data
    
    def info(self, message: str, extra: Optional[Dict[str, Any]] = None):
        """Log info message with structured format"""
        log_data = self._format_message(message, extra)
        if os.getenv("LOG_FORMAT") == "json":
            self.logger.info(json.dumps(log_data))
        else:
            self.logger.info(f"{message} {extra or ''}")
    
    def error(self, message: str, extra: Optional[Dict[str, Any]] = None, exc_info: bool = False):
        """Log error message with structured format"""
        log_data = self._format_message(message, extra)
        if os.getenv("LOG_FORMAT") == "json":
            self.logger.error(json.dumps(log_data), exc_info=exc_info)
        else:
            self.logger.error(f"{message} {extra or ''}", exc_info=exc_info)
    
    def warning(self, message: str, extra: Optional[Dict[str, Any]] = None):
        """Log warning message with structured format"""
        log_data = self._format_message(message, extra)
        if os.getenv("LOG_FORMAT") == "json":
            self.logger.warning(json.dumps(log_data))
        else:
            self.logger.warning(f"{message} {extra or ''}")
    
    def debug(self, message: str, extra: Optional[Dict[str, Any]] = None):
        """Log debug message with structured format"""
        log_data = self._format_message(message, extra)
        if os.getenv("LOG_FORMAT") == "json":
            self.logger.debug(json.dumps(log_data))
        else:
            self.logger.debug(f"{message} {extra or ''}")

# Global structured logger instance
structured_logger = StructuredLogger("meetily")

def performance_monitor(operation_name: str):
    """
    Decorator to monitor function performance
    """
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = await func(*args, **kwargs)
                duration = (time.time() - start_time) * 1000  # Convert to milliseconds
                
                structured_logger.info(
                    f"Operation completed: {operation_name}",
                    {
                        "operation": operation_name,
                        "duration_ms": round(duration, 2),
                        "status": "success"
                    }
                )
                return result
            except Exception as e:
                duration = (time.time() - start_time) * 1000
                structured_logger.error(
                    f"Operation failed: {operation_name}",
                    {
                        "operation": operation_name,
                        "duration_ms": round(duration, 2),
                        "status": "error",
                        "error": str(e),
                        "error_type": type(e).__name__
                    },
                    exc_info=True
                )
                raise
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            start_time = time.time()
            try:
                result = func(*args, **kwargs)
                duration = (time.time() - start_time) * 1000
                
                structured_logger.info(
                    f"Operation completed: {operation_name}",
                    {
                        "operation": operation_name,
                        "duration_ms": round(duration, 2),
                        "status": "success"
                    }
                )
                return result
            except Exception as e:
                duration = (time.time() - start_time) * 1000
                structured_logger.error(
                    f"Operation failed: {operation_name}",
                    {
                        "operation": operation_name,
                        "duration_ms": round(duration, 2),
                        "status": "error",
                        "error": str(e),
                        "error_type": type(e).__name__
                    },
                    exc_info=True
                )
                raise
        
        # Return appropriate wrapper based on function type
        if asyncio.iscoroutinefunction(func):
            return async_wrapper
        else:
            return sync_wrapper
    
    return decorator

@asynccontextmanager
async def monitoring_context(operation: str, user_id: Optional[str] = None, request_id: Optional[str] = None):
    """
    Context manager for monitoring operations with automatic logging
    """
    start_time = time.time()
    
    # Set context
    old_user_id = structured_logger.user_id
    old_request_id = structured_logger.request_id
    
    structured_logger.set_context(request_id=request_id, user_id=user_id)
    
    try:
        structured_logger.info(f"Starting operation: {operation}", {"operation": operation})
        yield
        
        duration = (time.time() - start_time) * 1000
        structured_logger.info(
            f"Operation completed: {operation}",
            {
                "operation": operation,
                "duration_ms": round(duration, 2),
                "status": "success"
            }
        )
        
    except Exception as e:
        duration = (time.time() - start_time) * 1000
        structured_logger.error(
            f"Operation failed: {operation}",
            {
                "operation": operation,
                "duration_ms": round(duration, 2),
                "status": "error",
                "error": str(e),
                "error_type": type(e).__name__
            },
            exc_info=True
        )
        raise
    
    finally:
        # Restore previous context
        structured_logger.set_context(request_id=old_request_id, user_id=old_user_id)

class MetricsCollector:
    """
    Simple metrics collector for monitoring application performance
    """
    
    def __init__(self):
        self.metrics = {}
        self.counters = {}
    
    def increment_counter(self, name: str, value: int = 1, tags: Optional[Dict[str, str]] = None):
        """Increment a counter metric"""
        key = f"{name}:{tags}" if tags else name
        self.counters[key] = self.counters.get(key, 0) + value
    
    def record_gauge(self, name: str, value: float, tags: Optional[Dict[str, str]] = None):
        """Record a gauge metric"""
        key = f"{name}:{tags}" if tags else name
        self.metrics[key] = value
    
    def record_timing(self, name: str, duration_ms: float, tags: Optional[Dict[str, str]] = None):
        """Record a timing metric"""
        key = f"{name}_timing:{tags}" if tags else f"{name}_timing"
        if key not in self.metrics:
            self.metrics[key] = []
        self.metrics[key].append(duration_ms)
    
    def get_metrics(self) -> Dict[str, Any]:
        """Get all collected metrics"""
        return {
            "counters": self.counters,
            "gauges": {k: v for k, v in self.metrics.items() if not isinstance(v, list)},
            "timings": {k: {
                "count": len(v),
                "avg": sum(v) / len(v) if v else 0,
                "min": min(v) if v else 0,
                "max": max(v) if v else 0
            } for k, v in self.metrics.items() if isinstance(v, list)}
        }
    
    def reset(self):
        """Reset all metrics"""
        self.metrics.clear()
        self.counters.clear()

# Global metrics collector
metrics = MetricsCollector()

def log_user_action(action: str, user_id: str, details: Optional[Dict[str, Any]] = None):
    """Log user actions for audit and analytics"""
    structured_logger.info(
        f"User action: {action}",
        {
            "action": action,
            "user_id": user_id,
            "details": details or {},
            "category": "user_action"
        }
    )
    
    # Increment counter
    metrics.increment_counter("user_actions", tags={"action": action})

def log_api_request(method: str, path: str, status_code: int, duration_ms: float, user_id: Optional[str] = None):
    """Log API requests for monitoring"""
    structured_logger.info(
        f"API request: {method} {path}",
        {
            "method": method,
            "path": path,
            "status_code": status_code,
            "duration_ms": duration_ms,
            "user_id": user_id,
            "category": "api_request"
        }
    )
    
    # Record metrics
    metrics.increment_counter("api_requests", tags={"method": method, "status": str(status_code)})
    metrics.record_timing("api_response_time", duration_ms, tags={"method": method, "path": path})

def log_error(error: Exception, context: Optional[Dict[str, Any]] = None, user_id: Optional[str] = None):
    """Log errors with context for debugging"""
    structured_logger.error(
        f"Application error: {str(error)}",
        {
            "error": str(error),
            "error_type": type(error).__name__,
            "context": context or {},
            "user_id": user_id,
            "category": "application_error"
        },
        exc_info=True
    )
    
    # Increment error counter
    metrics.increment_counter("errors", tags={"error_type": type(error).__name__})

def log_security_event(event_type: str, severity: str, details: Dict[str, Any], user_id: Optional[str] = None, client_ip: Optional[str] = None):
    """
    Log security-related events for monitoring and alerting
    
    Args:
        event_type: Type of security event (auth_failure, rate_limit, access_denied, etc.)
        severity: Severity level (info, warning, critical)
        details: Additional details about the event
        user_id: User ID if authenticated
        client_ip: Client IP address
    """
    log_data = {
        "event_type": event_type,
        "severity": severity,
        "details": details,
        "category": "security_event"
    }
    
    if user_id:
        log_data["user_id"] = user_id
    
    if client_ip:
        log_data["client_ip"] = client_ip
    
    if severity == "critical":
        structured_logger.error(f"Security event: {event_type}", log_data)
    elif severity == "warning":
        structured_logger.warning(f"Security event: {event_type}", log_data)
    else:
        structured_logger.info(f"Security event: {event_type}", log_data)
    
    # Increment security event counter
    metrics.increment_counter("security_events", tags={"event_type": event_type, "severity": severity})

def log_input_validation_failure(field: str, value: str, validation_type: str, user_id: Optional[str] = None, client_ip: Optional[str] = None):
    """
    Log input validation failures for security monitoring
    
    Args:
        field: Field that failed validation
        value: Value that failed (may be redacted for sensitive fields)
        validation_type: Type of validation that failed
        user_id: User ID if authenticated
        client_ip: Client IP address
    """
    # Redact sensitive values
    sensitive_fields = {"password", "token", "api_key", "secret", "credit_card"}
    if any(sensitive in field.lower() for sensitive in sensitive_fields):
        value = "[REDACTED]"
    
    log_security_event(
        event_type="input_validation_failure",
        severity="warning",
        details={
            "field": field,
            "value": value,
            "validation_type": validation_type
        },
        user_id=user_id,
        client_ip=client_ip
    )

# Import asyncio at the end to avoid circular imports
import asyncio