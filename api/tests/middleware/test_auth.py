"""
Tests for authentication middleware
"""

import pytest
import jwt
from datetime import datetime, timedelta
from fastapi import FastAPI, Depends, HTTPException
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

from app.middleware.auth import UserIsolationMiddleware, get_current_user_id
from app.core.config import settings
from app.models.user import User

def create_test_app():
    """Create a test app with authentication middleware"""
    app = FastAPI()
    app.add_middleware(UserIsolationMiddleware)
    
    @app.get("/")
    def root():
        return {"message": "public endpoint"}
    
    @app.get("/protected")
    def protected_endpoint():
        return {"message": "protected endpoint"}
    
    @app.get("/user")
    def user_endpoint(user_id: str = Depends(get_current_user_id)):
        return {"user_id": user_id}
    
    @app.get("/admin")
    def admin_endpoint():
        return {"message": "admin endpoint"}
    
    @app.get("/api/meetings/{meeting_id}")
    def meeting_endpoint(meeting_id: str):
        return {"meeting_id": meeting_id}
    
    return app

def create_token(user_id: str, expires_delta: timedelta = None) -> str:
    """Create a JWT token for testing"""
    if expires_delta is None:
        expires_delta = timedelta(minutes=15)
    
    payload = {
        "sub": user_id,
        "exp": datetime.utcnow() + expires_delta,
        "iat": datetime.utcnow(),
        "type": "access",
        "iss": settings.JWT_ISSUER,
        "aud": settings.JWT_AUDIENCE
    }
    
    token = jwt.encode(
        payload,
        settings.JWT_SECRET_KEY,
        algorithm=settings.JWT_ALGORITHM
    )
    
    return token

class TestAuthMiddleware:
    """Tests for UserIsolationMiddleware"""
    
    def test_public_endpoint_no_auth(self):
        """Test that public endpoints don't require authentication"""
        app = create_test_app()
        client = TestClient(app)
        
        response = client.get("/")
        assert response.status_code == 200
    
    def test_protected_endpoint_no_auth(self):
        """Test that protected endpoints require authentication"""
        app = create_test_app()
        client = TestClient(app)
        
        response = client.get("/protected")
        assert response.status_code == 401
    
    def test_protected_endpoint_with_auth(self):
        """Test that protected endpoints work with authentication"""
        app = create_test_app()
        client = TestClient(app)
        
        # Create auth token
        user_id = "test-user-id"
        token = create_token(user_id)
        
        # Mock authentication
        with patch("app.middleware.auth.UserIsolationMiddleware._authenticate_jwt") as mock_auth:
            # Create a mock user
            mock_user = MagicMock()
            mock_user.id = user_id
            mock_user.email = "test@example.com"
            mock_user.is_active = True
            
            # Return mock user from auth method
            mock_auth.return_value = mock_user
            
            response = client.get(
                "/protected",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            assert response.status_code == 200
    
    def test_user_endpoint_with_auth(self):
        """Test that user ID is available in request state"""
        app = create_test_app()
        client = TestClient(app)
        
        # Create auth token
        user_id = "test-user-id"
        token = create_token(user_id)
        
        # Mock authentication
        with patch("app.middleware.auth.UserIsolationMiddleware._authenticate_jwt") as mock_auth:
            # Create a mock user
            mock_user = MagicMock()
            mock_user.id = user_id
            mock_user.email = "test@example.com"
            mock_user.is_active = True
            
            # Return mock user from auth method
            mock_auth.return_value = mock_user
            
            response = client.get(
                "/user",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            assert response.status_code == 200
            assert response.json() == {"user_id": user_id}
    
    def test_admin_endpoint_access_denied(self):
        """Test that admin endpoints deny access to regular users"""
        app = create_test_app()
        client = TestClient(app)
        
        # Create auth token
        user_id = "test-user-id"
        token = create_token(user_id)
        
        # Mock authentication
        with patch("app.middleware.auth.UserIsolationMiddleware._authenticate_jwt") as mock_auth:
            # Create a mock user
            mock_user = MagicMock()
            mock_user.id = user_id
            mock_user.email = "test@example.com"
            mock_user.is_active = True
            
            # Return mock user from auth method
            mock_auth.return_value = mock_user
            
            response = client.get(
                "/admin",
                headers={"Authorization": f"Bearer {token}"}
            )
            
            # Admin endpoints should deny access
            assert response.status_code == 403
    
    def test_resource_ownership_validation(self):
        """Test that resource ownership is validated"""
        app = create_test_app()
        client = TestClient(app)
        
        # Create auth token
        user_id = "test-user-id"
        token = create_token(user_id)
        
        # Mock authentication
        with patch("app.middleware.auth.UserIsolationMiddleware._authenticate_jwt") as mock_auth:
            # Create a mock user
            mock_user = MagicMock()
            mock_user.id = user_id
            mock_user.email = "test@example.com"
            mock_user.is_active = True
            
            # Return mock user from auth method
            mock_auth.return_value = mock_user
            
            # Mock resource ownership validation
            with patch("app.middleware.auth.UserIsolationMiddleware._validate_resource_ownership") as mock_validate:
                # First test: user owns resource
                mock_validate.return_value = True
                
                response = client.get(
                    "/api/meetings/test-meeting-id",
                    headers={"Authorization": f"Bearer {token}"}
                )
                
                assert response.status_code == 200
                
                # Second test: user doesn't own resource
                mock_validate.return_value = False
                
                response = client.get(
                    "/api/meetings/test-meeting-id",
                    headers={"Authorization": f"Bearer {token}"}
                )
                
                assert response.status_code == 403
    
    def test_expired_token(self):
        """Test that expired tokens are rejected"""
        app = create_test_app()
        client = TestClient(app)
        
        # Create expired token
        user_id = "test-user-id"
        token = create_token(user_id, expires_delta=timedelta(minutes=-15))
        
        response = client.get(
            "/protected",
            headers={"Authorization": f"Bearer {token}"}
        )
        
        assert response.status_code == 401