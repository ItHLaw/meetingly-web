"""
Integration tests for authentication endpoints
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock

@pytest.mark.asyncio
async def test_health_endpoint(client):
    """Test the health endpoint"""
    response = client.get("/health")
    assert response.status_code == 200
    assert "status" in response.json()
    assert response.json()["status"] == "healthy"

@pytest.mark.asyncio
async def test_protected_endpoint_no_auth(client):
    """Test that protected endpoints require authentication"""
    response = client.get("/api/meetings")
    assert response.status_code == 401

@pytest.mark.asyncio
async def test_protected_endpoint_with_auth(client, auth_headers):
    """Test that protected endpoints work with authentication"""
    # Mock the database query to return empty list
    with patch("app.api.routes.meetings.get_user_meetings") as mock_get_meetings:
        mock_get_meetings.return_value = []
        
        response = client.get("/api/meetings", headers=auth_headers)
        
        assert response.status_code == 200
        assert isinstance(response.json(), list)

@pytest.mark.asyncio
async def test_auth_me_endpoint(client, auth_headers, test_user):
    """Test the /auth/me endpoint"""
    # Mock the get_current_user dependency
    with patch("app.api.routes.auth.get_current_user") as mock_get_user:
        # Create mock user
        mock_user = MagicMock()
        mock_user.id = test_user["id"]
        mock_user.email = test_user["email"]
        mock_user.name = test_user["name"]
        mock_user.microsoft_id = test_user["microsoft_id"]
        
        # Configure the mock to return our user
        mock_get_user.return_value = mock_user
        
        response = client.get("/auth/me", headers=auth_headers)
        
        assert response.status_code == 200
        assert response.json()["id"] == test_user["id"]
        assert response.json()["email"] == test_user["email"]

@pytest.mark.asyncio
async def test_logout_endpoint(client, auth_headers):
    """Test the logout endpoint"""
    # Mock the revoke_session method
    with patch("app.services.auth.AuthService.revoke_session") as mock_revoke:
        mock_revoke.return_value = True
        
        response = client.post("/auth/logout", headers=auth_headers)
        
        assert response.status_code == 200
        assert "success" in response.json()
        assert response.json()["success"] is True