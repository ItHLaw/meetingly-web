"""
Tests for rate limiting middleware
"""

import pytest
import time
from fastapi import FastAPI, Request
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.middleware.rate_limit import RateLimitMiddleware

def create_test_app():
    """Create a test app with rate limiting middleware"""
    app = FastAPI()
    app.add_middleware(RateLimitMiddleware)
    
    @app.get("/test")
    def test_endpoint():
        return {"message": "test"}
    
    @app.get("/health")
    def health_endpoint():
        return {"status": "healthy"}
    
    @app.get("/test-auth")
    def test_auth_endpoint(request: Request):
        # Simulate authenticated user
        request.state.user_id = "test-user"
        return {"message": "authenticated"}
    
    return app

class TestRateLimitMiddleware:
    """Tests for RateLimitMiddleware"""
    
    def test_exempt_paths_not_rate_limited(self):
        """Test that exempt paths are not rate limited"""
        app = create_test_app()
        client = TestClient(app)
        
        # Health endpoint should be exempt
        for _ in range(100):  # Make many requests
            response = client.get("/health")
            assert response.status_code == 200
    
    def test_rate_limit_exceeded(self):
        """Test that rate limit is enforced"""
        app = create_test_app()
        
        # Override rate limit for testing
        original_default_limit = RateLimitMiddleware.default_limit
        RateLimitMiddleware.default_limit = 5  # Set low limit for testing
        
        client = TestClient(app)
        
        try:
            # Make requests up to the limit
            for _ in range(5):
                response = client.get("/test")
                assert response.status_code == 200
                assert "X-RateLimit-Remaining" in response.headers
            
            # Next request should exceed the limit
            response = client.get("/test")
            assert response.status_code == 429
            assert "Retry-After" in response.headers
            assert "X-RateLimit-Limit" in response.headers
            assert "X-RateLimit-Remaining" in response.headers
            assert "X-RateLimit-Reset" in response.headers
        finally:
            # Restore original limit
            RateLimitMiddleware.default_limit = original_default_limit
    
    def test_different_rate_limit_keys(self):
        """Test that different users/IPs have separate rate limits"""
        app = create_test_app()
        
        # Override rate limit for testing
        original_default_limit = RateLimitMiddleware.default_limit
        RateLimitMiddleware.default_limit = 3  # Set low limit for testing
        
        # Create two clients with different IPs
        client1 = TestClient(app)
        client2 = TestClient(app)
        
        # Mock different IPs
        original_get_client_ip = RateLimitMiddleware._get_client_ip
        
        try:
            # Mock IP addresses
            def mock_get_client_ip_1(self, request):
                return "192.168.1.1"
            
            def mock_get_client_ip_2(self, request):
                return "192.168.1.2"
            
            # Make requests from first client up to limit
            with patch.object(RateLimitMiddleware, '_get_client_ip', mock_get_client_ip_1):
                for _ in range(3):
                    response = client1.get("/test")
                    assert response.status_code == 200
                
                # Next request should exceed limit
                response = client1.get("/test")
                assert response.status_code == 429
            
            # Second client should still be able to make requests
            with patch.object(RateLimitMiddleware, '_get_client_ip', mock_get_client_ip_2):
                for _ in range(3):
                    response = client2.get("/test")
                    assert response.status_code == 200
        finally:
            # Restore original methods
            RateLimitMiddleware._get_client_ip = original_get_client_ip
            RateLimitMiddleware.default_limit = original_default_limit
    
    def test_custom_path_limits(self):
        """Test that custom path limits are applied"""
        app = create_test_app()
        client = TestClient(app)
        
        # Override custom limits for testing
        original_custom_limits = RateLimitMiddleware.CUSTOM_LIMITS
        RateLimitMiddleware.CUSTOM_LIMITS = {"/test": 2}  # Set very low limit
        
        try:
            # Make requests up to custom limit
            for _ in range(2):
                response = client.get("/test")
                assert response.status_code == 200
            
            # Next request should exceed limit
            response = client.get("/test")
            assert response.status_code == 429
        finally:
            # Restore original limits
            RateLimitMiddleware.CUSTOM_LIMITS = original_custom_limits
    
    @pytest.mark.asyncio
    async def test_redis_integration(self):
        """Test integration with Redis for rate limiting"""
        # This would require a more complex setup with Redis
        # For simplicity, we'll mock the Redis client
        
        app = create_test_app()
        client = TestClient(app)
        
        # Mock Redis client
        mock_redis = MagicMock()
        mock_redis.zremrangebyscore = MagicMock(return_value=None)
        mock_redis.zadd = MagicMock(return_value=None)
        mock_redis.expire = MagicMock(return_value=None)
        mock_redis.zcount = MagicMock(return_value=1)  # First request
        
        # Mock get_redis_client to return our mock
        with patch("app.middleware.rate_limit.get_redis_client", return_value=mock_redis):
            response = client.get("/test")
            assert response.status_code == 200
            
            # Verify Redis methods were called
            mock_redis.zremrangebyscore.assert_called_once()
            mock_redis.zadd.assert_called_once()
            mock_redis.expire.assert_called_once()
            mock_redis.zcount.assert_called_once()