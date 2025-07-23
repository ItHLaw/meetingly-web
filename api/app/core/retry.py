"""
Retry mechanism utilities for handling transient failures.
Provides decorators and functions for automatic retry with exponential backoff.
"""

import asyncio
import logging
import time
import functools
from typing import Any, Callable, Optional, Type, Union, Tuple, List
from dataclasses import dataclass
from enum import Enum
import random

logger = logging.getLogger(__name__)


class RetryStrategy(Enum):
    """Available retry strategies."""
    FIXED = "fixed"
    EXPONENTIAL = "exponential"
    EXPONENTIAL_JITTER = "exponential_jitter"


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""
    max_attempts: int = 3
    base_delay: float = 1.0  # Base delay in seconds
    max_delay: float = 60.0  # Maximum delay in seconds
    strategy: RetryStrategy = RetryStrategy.EXPONENTIAL_JITTER
    backoff_multiplier: float = 2.0
    jitter_range: float = 0.1  # Jitter as fraction of delay
    exceptions: Tuple[Type[Exception], ...] = (Exception,)
    
    def calculate_delay(self, attempt: int) -> float:
        """Calculate delay for the given attempt number."""
        
        if self.strategy == RetryStrategy.FIXED:
            delay = self.base_delay
        elif self.strategy == RetryStrategy.EXPONENTIAL:
            delay = self.base_delay * (self.backoff_multiplier ** (attempt - 1))
        elif self.strategy == RetryStrategy.EXPONENTIAL_JITTER:
            exponential_delay = self.base_delay * (self.backoff_multiplier ** (attempt - 1))
            jitter = exponential_delay * self.jitter_range * (2 * random.random() - 1)
            delay = exponential_delay + jitter
        else:
            delay = self.base_delay
        
        return min(delay, self.max_delay)


class RetryError(Exception):
    """Raised when all retry attempts have been exhausted."""
    
    def __init__(self, message: str, last_exception: Exception, attempts: int):
        super().__init__(message)
        self.last_exception = last_exception
        self.attempts = attempts


def should_retry(exception: Exception, retryable_exceptions: Tuple[Type[Exception], ...]) -> bool:
    """Determine if an exception should trigger a retry."""
    
    # Don't retry certain types of errors
    non_retryable = (
        ValueError,
        TypeError,
        AttributeError,
        KeyError,
        PermissionError,
    )
    
    if isinstance(exception, non_retryable):
        return False
    
    # Don't retry HTTP client errors (4xx), but do retry server errors (5xx)
    if hasattr(exception, 'status_code'):
        status_code = exception.status_code
        if 400 <= status_code < 500:
            return False
    
    return isinstance(exception, retryable_exceptions)


async def retry_async(
    func: Callable,
    config: RetryConfig,
    *args,
    **kwargs
) -> Any:
    """Retry an async function with the given configuration."""
    
    last_exception = None
    
    for attempt in range(1, config.max_attempts + 1):
        try:
            logger.debug(f"Attempt {attempt}/{config.max_attempts} for function {func.__name__}")
            result = await func(*args, **kwargs)
            
            if attempt > 1:
                logger.info(f"Function {func.__name__} succeeded after {attempt} attempts")
            
            return result
            
        except Exception as e:
            last_exception = e
            
            if not should_retry(e, config.exceptions):
                logger.warning(f"Non-retryable exception in {func.__name__}: {e}")
                raise e
            
            if attempt == config.max_attempts:
                logger.error(f"All {config.max_attempts} retry attempts exhausted for {func.__name__}")
                break
            
            delay = config.calculate_delay(attempt)
            logger.warning(
                f"Attempt {attempt}/{config.max_attempts} failed for {func.__name__}: {e}. "
                f"Retrying in {delay:.2f} seconds..."
            )
            
            await asyncio.sleep(delay)
    
    # All attempts failed
    raise RetryError(
        f"Failed after {config.max_attempts} attempts",
        last_exception,
        config.max_attempts
    )


def retry_sync(
    func: Callable,
    config: RetryConfig,
    *args,
    **kwargs
) -> Any:
    """Retry a sync function with the given configuration."""
    
    last_exception = None
    
    for attempt in range(1, config.max_attempts + 1):
        try:
            logger.debug(f"Attempt {attempt}/{config.max_attempts} for function {func.__name__}")
            result = func(*args, **kwargs)
            
            if attempt > 1:
                logger.info(f"Function {func.__name__} succeeded after {attempt} attempts")
            
            return result
            
        except Exception as e:
            last_exception = e
            
            if not should_retry(e, config.exceptions):
                logger.warning(f"Non-retryable exception in {func.__name__}: {e}")
                raise e
            
            if attempt == config.max_attempts:
                logger.error(f"All {config.max_attempts} retry attempts exhausted for {func.__name__}")
                break
            
            delay = config.calculate_delay(attempt)
            logger.warning(
                f"Attempt {attempt}/{config.max_attempts} failed for {func.__name__}: {e}. "
                f"Retrying in {delay:.2f} seconds..."
            )
            
            time.sleep(delay)
    
    # All attempts failed
    raise RetryError(
        f"Failed after {config.max_attempts} attempts",
        last_exception,
        config.max_attempts
    )


def with_retry(config: Optional[RetryConfig] = None):
    """Decorator to add retry logic to functions."""
    
    if config is None:
        config = RetryConfig()
    
    def decorator(func: Callable) -> Callable:
        if asyncio.iscoroutinefunction(func):
            @functools.wraps(func)
            async def async_wrapper(*args, **kwargs):
                return await retry_async(func, config, *args, **kwargs)
            return async_wrapper
        else:
            @functools.wraps(func)
            def sync_wrapper(*args, **kwargs):
                return retry_sync(func, config, *args, **kwargs)
            return sync_wrapper
    
    return decorator


# Predefined retry configurations for common scenarios
DATABASE_RETRY_CONFIG = RetryConfig(
    max_attempts=3,
    base_delay=1.0,
    max_delay=10.0,
    strategy=RetryStrategy.EXPONENTIAL_JITTER,
    exceptions=(Exception,)  # Will be filtered by should_retry
)

API_RETRY_CONFIG = RetryConfig(
    max_attempts=5,
    base_delay=2.0,
    max_delay=30.0,
    strategy=RetryStrategy.EXPONENTIAL_JITTER,
    exceptions=(Exception,)  # Will be filtered by should_retry
)

FILE_OPERATION_RETRY_CONFIG = RetryConfig(
    max_attempts=3,
    base_delay=0.5,
    max_delay=5.0,
    strategy=RetryStrategy.EXPONENTIAL,
    exceptions=(OSError, IOError)
)

NETWORK_RETRY_CONFIG = RetryConfig(
    max_attempts=4,
    base_delay=1.0,
    max_delay=20.0,
    strategy=RetryStrategy.EXPONENTIAL_JITTER,
    exceptions=(ConnectionError, TimeoutError)
)


# Convenience decorators
def with_database_retry(func: Callable) -> Callable:
    """Decorator for database operations."""
    return with_retry(DATABASE_RETRY_CONFIG)(func)


def with_api_retry(func: Callable) -> Callable:
    """Decorator for API calls."""
    return with_retry(API_RETRY_CONFIG)(func)


def with_file_retry(func: Callable) -> Callable:
    """Decorator for file operations."""
    return with_retry(FILE_OPERATION_RETRY_CONFIG)(func)


def with_network_retry(func: Callable) -> Callable:
    """Decorator for network operations."""
    return with_retry(NETWORK_RETRY_CONFIG)(func)


# Circuit breaker pattern for repeated failures
@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker."""
    failure_threshold: int = 5
    recovery_timeout: float = 60.0  # seconds
    expected_exception: Type[Exception] = Exception


class CircuitBreakerState(Enum):
    CLOSED = "closed"
    OPEN = "open"  
    HALF_OPEN = "half_open"


class CircuitBreaker:
    """Circuit breaker implementation to prevent cascading failures."""
    
    def __init__(self, config: CircuitBreakerConfig):
        self.config = config
        self.state = CircuitBreakerState.CLOSED
        self.failure_count = 0
        self.last_failure_time = 0
        self.success_count = 0
    
    def can_execute(self) -> bool:
        """Check if the circuit breaker allows execution."""
        
        if self.state == CircuitBreakerState.CLOSED:
            return True
        elif self.state == CircuitBreakerState.OPEN:
            if time.time() - self.last_failure_time >= self.config.recovery_timeout:
                self.state = CircuitBreakerState.HALF_OPEN
                self.success_count = 0
                return True
            return False
        elif self.state == CircuitBreakerState.HALF_OPEN:
            return True
        
        return False
    
    def record_success(self):
        """Record a successful execution."""
        
        if self.state == CircuitBreakerState.HALF_OPEN:
            self.success_count += 1
            if self.success_count >= 2:  # Require 2 successes to close
                self.state = CircuitBreakerState.CLOSED
                self.failure_count = 0
        elif self.state == CircuitBreakerState.CLOSED:
            self.failure_count = 0
    
    def record_failure(self, exception: Exception):
        """Record a failed execution."""
        
        if isinstance(exception, self.config.expected_exception):
            self.failure_count += 1
            self.last_failure_time = time.time()
            
            if self.failure_count >= self.config.failure_threshold:
                self.state = CircuitBreakerState.OPEN
                logger.warning(f"Circuit breaker opened after {self.failure_count} failures")


def with_circuit_breaker(config: Optional[CircuitBreakerConfig] = None):
    """Decorator to add circuit breaker pattern to functions."""
    
    if config is None:
        config = CircuitBreakerConfig()
    
    circuit_breaker = CircuitBreaker(config)
    
    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def async_wrapper(*args, **kwargs):
            if not circuit_breaker.can_execute():
                raise Exception("Circuit breaker is open")
            
            try:
                result = await func(*args, **kwargs)
                circuit_breaker.record_success()
                return result
            except Exception as e:
                circuit_breaker.record_failure(e)
                raise
        
        @functools.wraps(func)
        def sync_wrapper(*args, **kwargs):
            if not circuit_breaker.can_execute():
                raise Exception("Circuit breaker is open")
            
            try:
                result = func(*args, **kwargs)
                circuit_breaker.record_success()
                return result
            except Exception as e:
                circuit_breaker.record_failure(e)
                raise
        
        return async_wrapper if asyncio.iscoroutinefunction(func) else sync_wrapper
    
    return decorator