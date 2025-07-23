"""
End-to-end tests for user workflows
"""

import pytest
from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
import json
import uuid
from datetime import datetime

@pytest.mark.asyncio
async def test_meeting_creation_workflow(client, auth_headers):
    """Test the complete meeting creation workflow"""
    # Mock the database operations
    with patch("app.services.meeting.MeetingService.create_meeting") as mock_create:
        # Create mock meeting
        meeting_id = str(uuid.uuid4())
        mock_meeting = MagicMock()
        mock_meeting.id = meeting_id
        mock_meeting.title = "Test Meeting"
        mock_meeting.created_at = datetime.utcnow()
        mock_meeting.user_id = "test-user-id"
        mock_meeting.processing_status = "pending"
        
        # Configure mock to return our meeting
        mock_create.return_value = mock_meeting
        
        # Step 1: Create a new meeting
        response = client.post(
            "/api/meetings",
            json={"title": "Test Meeting"},
            headers=auth_headers
        )
        
        assert response.status_code == 201
        assert "id" in response.json()
        created_meeting_id = response.json()["id"]
        
        # Step 2: Mock file upload
        with patch("app.services.audio.AudioService.upload_audio") as mock_upload:
            # Mock file processing job
            job_id = str(uuid.uuid4())
            mock_upload.return_value = {
                "job_id": job_id,
                "file_id": str(uuid.uuid4()),
                "status": "pending"
            }
            
            # Create test file content
            file_content = b"test audio content"
            
            # Upload audio file
            response = client.post(
                f"/api/audio/upload?meeting_id={created_meeting_id}",
                files={"file": ("test.mp3", file_content, "audio/mpeg")},
                headers=auth_headers
            )
            
            assert response.status_code == 200
            assert "job_id" in response.json()
            job_id = response.json()["job_id"]
            
            # Step 3: Check processing status
            with patch("app.services.audio.AudioService.get_processing_status") as mock_status:
                # Mock processing status
                mock_status.return_value = {
                    "status": "completed",
                    "progress": 100,
                    "meeting_id": created_meeting_id,
                    "transcript_available": True
                }
                
                response = client.get(
                    f"/api/audio/status/{job_id}",
                    headers=auth_headers
                )
                
                assert response.status_code == 200
                assert response.json()["status"] == "completed"
                
                # Step 4: Get meeting details with transcript
                with patch("app.services.meeting.MeetingService.get_meeting_by_id") as mock_get:
                    # Mock meeting with transcript
                    mock_meeting.transcript_text = "This is a test transcript."
                    mock_meeting.processing_status = "completed"
                    mock_get.return_value = mock_meeting
                    
                    response = client.get(
                        f"/api/meetings/{created_meeting_id}",
                        headers=auth_headers
                    )
                    
                    assert response.status_code == 200
                    assert response.json()["id"] == created_meeting_id
                    assert "transcript_text" in response.json()
                    
                    # Step 5: Generate summary
                    with patch("app.services.summary.SummaryService.generate_summary") as mock_summary:
                        # Mock summary job
                        summary_job_id = str(uuid.uuid4())
                        mock_summary.return_value = {
                            "job_id": summary_job_id,
                            "status": "pending"
                        }
                        
                        response = client.post(
                            f"/api/meetings/{created_meeting_id}/summary",
                            headers=auth_headers
                        )
                        
                        assert response.status_code == 200
                        assert "job_id" in response.json()
                        
                        # Step 6: Check summary status
                        with patch("app.services.summary.SummaryService.get_summary_status") as mock_sum_status:
                            # Mock summary status
                            mock_sum_status.return_value = {
                                "status": "completed",
                                "progress": 100,
                                "meeting_id": created_meeting_id
                            }
                            
                            response = client.get(
                                f"/api/meetings/{created_meeting_id}/summary/status",
                                headers=auth_headers
                            )
                            
                            assert response.status_code == 200
                            assert response.json()["status"] == "completed"

@pytest.mark.asyncio
async def test_user_authentication_workflow(client):
    """Test the user authentication workflow"""
    # This would be a complex test involving Microsoft SSO
    # For simplicity, we'll mock the key parts
    
    # Mock the Microsoft auth callback
    with patch("app.services.auth.AuthService.handle_microsoft_callback") as mock_callback:
        # Mock user data
        user_id = str(uuid.uuid4())
        mock_user = MagicMock()
        mock_user.id = user_id
        mock_user.email = "test@example.com"
        mock_user.name = "Test User"
        
        # Mock tokens
        access_token = "mock-access-token"
        refresh_token = "mock-refresh-token"
        
        # Configure mock to return user and tokens
        mock_callback.return_value = (mock_user, access_token, refresh_token)
        
        # Step 1: Handle Microsoft callback
        response = client.get(
            "/auth/microsoft/callback?code=test-code&state=test-state"
        )
        
        # Should redirect to frontend with tokens
        assert response.status_code == 307  # Temporary redirect
        
        # Step 2: Use tokens to access protected endpoint
        with patch("app.middleware.auth.UserIsolationMiddleware._authenticate_jwt") as mock_auth:
            # Configure mock to return our user
            mock_auth.return_value = mock_user
            
            response = client.get(
                "/api/meetings",
                headers={"Authorization": f"Bearer {access_token}"}
            )
            
            assert response.status_code == 200
            
            # Step 3: Test logout
            with patch("app.services.auth.AuthService.revoke_session") as mock_revoke:
                mock_revoke.return_value = True
                
                response = client.post(
                    "/auth/logout",
                    headers={"Authorization": f"Bearer {access_token}"}
                )
                
                assert response.status_code == 200
                assert response.json()["success"] is True