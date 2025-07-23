"""
API Compatibility Tests

Tests to ensure backward compatibility between API versions and proper
migration functionality for clients moving from v1 to v2.
"""

import pytest
import json
from httpx import AsyncClient
from unittest.mock import Mock, patch
from datetime import datetime

from app.main import app
from app.models.user import User
from app.models.meeting import Meeting
from tests.conftest import create_test_user, create_test_meeting

class TestAPIVersioning:
    """Test API version detection and handling"""
    
    @pytest.mark.asyncio
    async def test_version_from_header(self, client: AsyncClient, test_user: User):
        """Test API version detection from Accept header"""
        headers = {
            "Authorization": f"Bearer {test_user.id}",
            "Accept": "application/vnd.meetily.v1+json"
        }
        
        response = await client.get("/api/meetings", headers=headers)
        assert response.status_code == 200
        
        # Should include deprecation headers for v1
        assert "X-API-Deprecated" in response.headers
        assert response.headers["X-API-Deprecated"] == "true"
    
    @pytest.mark.asyncio
    async def test_version_from_path(self, client: AsyncClient, test_user: User):
        """Test API version detection from URL path"""
        headers = {"Authorization": f"Bearer {test_user.id}"}
        
        # v1 path
        response = await client.get("/api/v1/meetings", headers=headers)
        assert response.status_code == 200
        assert "X-API-Deprecated" in response.headers
        
        # v2 path (current)
        response = await client.get("/api/meetings", headers=headers)
        assert response.status_code == 200
        assert "X-API-Deprecated" not in response.headers
    
    @pytest.mark.asyncio
    async def test_version_from_query(self, client: AsyncClient, test_user: User):
        """Test API version detection from query parameter"""
        headers = {"Authorization": f"Bearer {test_user.id}"}
        
        response = await client.get("/api/meetings?version=v1", headers=headers)
        assert response.status_code == 200
        # Note: Query parameter version detection would need middleware implementation
    
    @pytest.mark.asyncio
    async def test_default_version(self, client: AsyncClient, test_user: User):
        """Test default API version when none specified"""
        headers = {"Authorization": f"Bearer {test_user.id}"}
        
        response = await client.get("/api/meetings", headers=headers)
        assert response.status_code == 200
        # Should use v2 (latest) by default
        assert "X-API-Deprecated" not in response.headers

class TestMeetingAPICompatibility:
    """Test meeting API compatibility between versions"""
    
    @pytest.mark.asyncio
    async def test_meeting_list_v1_format(self, client: AsyncClient, test_user: User, test_meeting: Meeting):
        """Test v1 meeting list format"""
        headers = {"Authorization": f"Bearer {test_user.id}"}
        
        response = await client.get("/api/v1/meetings", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "meetings" in data
        assert "total" in data
        assert isinstance(data["meetings"], list)
        
        if data["meetings"]:
            meeting = data["meetings"][0]
            # v1 format should have 'title' not 'name'
            assert "title" in meeting
            assert "name" not in meeting
            assert "id" in meeting
            assert "created_at" in meeting
            assert "updated_at" in meeting
    
    @pytest.mark.asyncio
    async def test_meeting_list_v2_format(self, client: AsyncClient, test_user: User, test_meeting: Meeting):
        """Test v2 meeting list format"""
        headers = {"Authorization": f"Bearer {test_user.id}"}
        
        response = await client.get("/api/meetings", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "meetings" in data
        assert "pagination" in data
        assert "filters_applied" in data
        assert "sort" in data
        
        if data["meetings"]:
            meeting = data["meetings"][0]
            # v2 format should have 'name' not 'title'
            assert "name" in meeting
            assert "title" not in meeting
            assert "user_id" in meeting
            assert "meeting_type" in meeting
            assert "status" in meeting
    
    @pytest.mark.asyncio
    async def test_meeting_create_v1_compatibility(self, client: AsyncClient, test_user: User):
        """Test v1 meeting creation compatibility"""
        headers = {
            "Authorization": f"Bearer {test_user.id}",
            "Content-Type": "application/json"
        }
        
        # v1 format uses 'title'
        meeting_data = {
            "title": "Test Meeting V1",
            "description": "Test description"
        }
        
        response = await client.post("/api/v1/meetings", headers=headers, json=meeting_data)
        assert response.status_code == 200
        
        data = response.json()
        assert data["title"] == "Test Meeting V1"
        assert data["description"] == "Test description"
        assert "id" in data
    
    @pytest.mark.asyncio
    async def test_meeting_create_v2_format(self, client: AsyncClient, test_user: User):
        """Test v2 meeting creation format"""
        headers = {
            "Authorization": f"Bearer {test_user.id}",
            "Content-Type": "application/json"
        }
        
        # v2 format uses 'name'
        meeting_data = {
            "name": "Test Meeting V2",
            "description": "Test description",
            "meeting_type": "general",
            "duration_minutes": 120
        }
        
        response = await client.post("/api/meetings", headers=headers, json=meeting_data)
        assert response.status_code == 200
        
        data = response.json()
        assert data["name"] == "Test Meeting V2"
        assert data["meeting_type"] == "general"
        assert data["duration_minutes"] == 120
        assert "user_id" in data
    
    @pytest.mark.asyncio
    async def test_meeting_update_v1_compatibility(self, client: AsyncClient, test_user: User, test_meeting: Meeting):
        """Test v1 meeting update compatibility"""
        headers = {
            "Authorization": f"Bearer {test_user.id}",
            "Content-Type": "application/json"
        }
        
        update_data = {
            "title": "Updated Title V1",
            "description": "Updated description"
        }
        
        response = await client.put(f"/api/v1/meetings/{test_meeting.id}", headers=headers, json=update_data)
        assert response.status_code == 200
        
        data = response.json()
        assert data["title"] == "Updated Title V1"
        assert data["description"] == "Updated description"

class TestAudioAPICompatibility:
    """Test audio API compatibility between versions"""
    
    @pytest.mark.asyncio
    async def test_audio_upload_v1_format(self, client: AsyncClient, test_user: User):
        """Test v1 audio upload format"""
        headers = {"Authorization": f"Bearer {test_user.id}"}
        
        # Mock file upload
        files = {"file": ("test.mp3", b"fake audio data", "audio/mpeg")}
        data = {"meeting_title": "Test Audio Meeting"}
        
        with patch('app.services.audio.AudioService.save_uploaded_file') as mock_save, \
             patch('app.services.audio.AudioService.create_processing_job') as mock_job, \
             patch('app.services.audio.AudioService.queue_audio_processing') as mock_queue:
            
            mock_save.return_value = {
                "file_path": "/tmp/test.mp3",
                "filename": "test.mp3",
                "size_bytes": 1024
            }
            
            mock_job.return_value = Mock(id="job-123")
            mock_queue.return_value = "task-123"
            
            response = await client.post("/api/v1/audio/upload", headers=headers, files=files, data=data)
            assert response.status_code == 200
            
            response_data = response.json()
            assert response_data["success"] is True
            assert "job_id" in response_data
            assert "meeting_id" in response_data
            assert "message" in response_data
            # v1 format should not have file_info or processing_config
            assert "file_info" not in response_data
            assert "processing_config" not in response_data
    
    @pytest.mark.asyncio
    async def test_processing_status_v1_format(self, client: AsyncClient, test_user: User):
        """Test v1 processing status format"""
        headers = {"Authorization": f"Bearer {test_user.id}"}
        
        with patch('app.services.audio.AudioService.get_processing_job') as mock_get_job:
            mock_job = Mock()
            mock_job.id = "job-123"
            mock_job.meeting_id = "meeting-123"
            mock_job.status = "processing"
            mock_job.progress = 50
            mock_job.error_message = None
            mock_job.result = {"transcript": "test"}
            mock_job.created_at = datetime.now()
            mock_job.updated_at = datetime.now()
            
            mock_get_job.return_value = mock_job
            
            response = await client.get("/api/v1/audio/status/job-123", headers=headers)
            assert response.status_code == 200
            
            data = response.json()
            assert data["id"] == "job-123"
            assert data["status"] == "processing"
            assert data["progress"] == 50
            assert "error" in data  # v1 uses 'error' not 'error_message'
            # v1 format should not have current_step, estimated_duration, etc.
            assert "current_step" not in data
            assert "estimated_duration" not in data

class TestDataMigrationAPI:
    """Test data migration API endpoints"""
    
    @pytest.mark.asyncio
    async def test_migration_status(self, client: AsyncClient, test_user: User):
        """Test migration status endpoint"""
        headers = {"Authorization": f"Bearer {test_user.id}"}
        
        response = await client.get("/api/migration/status", headers=headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "user_id" in data
        assert "data_summary" in data
        assert "migration_capabilities" in data
        
        capabilities = data["migration_capabilities"]
        assert capabilities["desktop_migration"] is True
        assert capabilities["data_export"] is True
        assert capabilities["data_import"] is True
        assert capabilities["data_cleanup"] is True
    
    @pytest.mark.asyncio
    async def test_data_export(self, client: AsyncClient, test_user: User, test_meeting: Meeting):
        """Test data export functionality"""
        headers = {
            "Authorization": f"Bearer {test_user.id}",
            "Content-Type": "application/json"
        }
        
        export_request = {
            "format": "json",
            "include_transcripts": True,
            "include_model_configs": True
        }
        
        response = await client.post("/api/migration/export", headers=headers, json=export_request)
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/json"
        # Should return a file download
    
    @pytest.mark.asyncio
    async def test_data_cleanup_dry_run(self, client: AsyncClient, test_user: User):
        """Test data cleanup dry run"""
        headers = {
            "Authorization": f"Bearer {test_user.id}",
            "Content-Type": "application/json"
        }
        
        cleanup_request = {
            "older_than_days": 30,
            "dry_run": True
        }
        
        response = await client.post("/api/migration/cleanup", headers=headers, json=cleanup_request)
        assert response.status_code == 200
        
        data = response.json()
        assert data["success"] is True
        assert data["dry_run"] is True
        assert "statistics" in data
        assert "message" in data

class TestBackwardCompatibility:
    """Test backward compatibility features"""
    
    @pytest.mark.asyncio
    async def test_legacy_endpoints_without_version(self, client: AsyncClient, test_user: User):
        """Test legacy endpoints without version prefix"""
        headers = {"Authorization": f"Bearer {test_user.id}"}
        
        # Legacy endpoint should work
        response = await client.get("/meetings", headers=headers)
        assert response.status_code == 200
        
        # Should include deprecation headers
        assert "X-API-Deprecated" in response.headers
        assert response.headers["X-API-Deprecated"] == "true"
    
    @pytest.mark.asyncio
    async def test_automatic_version_detection(self, client: AsyncClient, test_user: User):
        """Test automatic API version detection from different sources"""
        headers = {"Authorization": f"Bearer {test_user.id}"}
        
        # Test header-based version detection
        v1_headers = {**headers, "Accept": "application/vnd.meetily.v1+json"}
        response = await client.get("/api/meetings", headers=v1_headers)
        assert response.status_code == 200
        assert response.headers.get("X-API-Version") == "v1"
        
        # Test path-based version detection
        response = await client.get("/api/v1/meetings", headers=headers)
        assert response.status_code == 200
        assert response.headers.get("X-API-Version") == "v1"
        
        # Test default version (v2)
        response = await client.get("/api/meetings", headers=headers)
        assert response.status_code == 200
        assert response.headers.get("X-API-Version") == "v2"
    
    @pytest.mark.asyncio
    async def test_middleware_response_transformation(self, client: AsyncClient, test_user: User, test_meeting: Meeting):
        """Test that middleware automatically transforms responses"""
        headers = {"Authorization": f"Bearer {test_user.id}"}
        
        # Get same meeting with different version headers
        v1_headers = {**headers, "Accept": "application/vnd.meetily.v1+json"}
        v2_headers = {**headers, "Accept": "application/vnd.meetily.v2+json"}
        
        v1_response = await client.get(f"/api/meetings/{test_meeting.id}", headers=v1_headers)
        v2_response = await client.get(f"/api/meetings/{test_meeting.id}", headers=v2_headers)
        
        assert v1_response.status_code == 200
        assert v2_response.status_code == 200
        
        v1_data = v1_response.json()
        v2_data = v2_response.json()
        
        # V1 should have transformed field names
        assert "title" in v1_data
        assert "name" in v2_data
        assert v1_data["title"] == v2_data["name"]
    
    @pytest.mark.asyncio
    async def test_deprecation_headers(self, client: AsyncClient, test_user: User):
        """Test deprecation headers are included for v1 endpoints"""
        headers = {"Authorization": f"Bearer {test_user.id}"}
        
        response = await client.get("/api/v1/meetings", headers=headers)
        assert response.status_code == 200
        
        # Check deprecation headers
        assert response.headers.get("X-API-Deprecated") == "true"
        assert response.headers.get("X-API-Deprecated-Version") == "v1"
        assert "X-API-Deprecated-Message" in response.headers
        assert "X-API-Migration-Guide" in response.headers
    
    @pytest.mark.asyncio
    async def test_response_transformation(self, client: AsyncClient, test_user: User, test_meeting: Meeting):
        """Test automatic response transformation between versions"""
        headers = {"Authorization": f"Bearer {test_user.id}"}
        
        # Get same meeting from both versions
        v1_response = await client.get(f"/api/v1/meetings/{test_meeting.id}", headers=headers)
        v2_response = await client.get(f"/api/meetings/{test_meeting.id}", headers=headers)
        
        assert v1_response.status_code == 200
        assert v2_response.status_code == 200
        
        v1_data = v1_response.json()
        v2_data = v2_response.json()
        
        # Same meeting, different formats
        assert v1_data["id"] == v2_data["id"]
        assert v1_data["title"] == v2_data["name"]  # Field name transformation
        assert "user_id" not in v1_data  # v1 doesn't include user_id
        assert "user_id" in v2_data  # v2 includes user_id
    
    @pytest.mark.asyncio
    async def test_error_format_consistency(self, client: AsyncClient, test_user: User):
        """Test error format consistency between versions"""
        headers = {"Authorization": f"Bearer {test_user.id}"}
        
        # Try to get non-existent meeting from both versions
        v1_response = await client.get("/api/v1/meetings/non-existent", headers=headers)
        v2_response = await client.get("/api/meetings/non-existent", headers=headers)
        
        assert v1_response.status_code == 404
        assert v2_response.status_code == 404
        
        # Both should return proper error responses
        v1_error = v1_response.json()
        v2_error = v2_response.json()
        
        assert "detail" in v1_error or "message" in v1_error
        assert "detail" in v2_error or "message" in v2_error

@pytest.fixture
async def test_user(db_session):
    """Create a test user"""
    return await create_test_user(db_session, email="test@example.com")

@pytest.fixture
async def test_meeting(db_session, test_user):
    """Create a test meeting"""
    return await create_test_meeting(
        db_session, 
        user_id=str(test_user.id),
        name="Test Meeting",
        description="Test description"
    )