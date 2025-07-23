"""
V1 Meetings API - Legacy Desktop App Compatibility

This module provides backward compatibility for the original desktop application API.
It maintains the same endpoint structure and response format as the desktop version
while internally using the new web application services.
"""

from fastapi import APIRouter, HTTPException, Depends, Query, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

from app.core.database import get_db
from app.middleware.auth import get_current_user_id
from app.services.meeting import MeetingService
from app.services.summary import SummaryService
from app.api.versioning import compatibility_middleware, DeprecationWarning
import logging

logger = logging.getLogger(__name__)

router = APIRouter()
meeting_service = MeetingService()
summary_service = SummaryService()

# V1 Models (Legacy format)
class V1MeetingCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)

class V1MeetingUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)

class V1MeetingResponse(BaseModel):
    id: str
    title: str
    description: Optional[str]
    created_at: str
    updated_at: str
    transcript_text: Optional[str] = None
    summary_data: Optional[Dict[str, Any]] = None
    processing_status: str = "completed"

class V1MeetingListResponse(BaseModel):
    meetings: List[V1MeetingResponse]
    total: int

@router.get("/meetings", response_model=V1MeetingListResponse)
async def get_meetings_v1(
    request: Request,
    response: Response,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Get meetings (V1 format) - Legacy desktop app compatibility
    """
    try:
        # Add deprecation headers
        deprecation_headers = DeprecationWarning.get_deprecation_headers("v1", "/api/meetings")
        for key, value in deprecation_headers.items():
            response.headers[key] = value
        
        # Use new service but transform to V1 format
        result = await meeting_service.get_user_meetings(
            user_id=user_id,
            filters={},
            page=offset // limit + 1,
            page_size=limit,
            sort_by="updated_at",
            sort_order="desc",
            db=db
        )
        
        # Transform to V1 format
        v1_meetings = []
        for meeting in result["meetings"]:
            v1_meeting = V1MeetingResponse(
                id=str(meeting.id),
                title=meeting.name or "Untitled Meeting",
                description=meeting.description,
                created_at=meeting.created_at.isoformat(),
                updated_at=meeting.updated_at.isoformat(),
                transcript_text=meeting.transcript_text,
                summary_data=meeting.summary_data,
                processing_status=meeting.processing_status or "completed"
            )
            v1_meetings.append(v1_meeting)
        
        return V1MeetingListResponse(
            meetings=v1_meetings,
            total=result["pagination"]["total_items"]
        )
        
    except Exception as e:
        logger.error(f"V1 meetings fetch failed for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch meetings")

@router.post("/meetings", response_model=V1MeetingResponse)
async def create_meeting_v1(
    request: Request,
    response: Response,
    meeting_data: V1MeetingCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Create meeting (V1 format) - Legacy desktop app compatibility
    """
    try:
        # Add deprecation headers
        deprecation_headers = DeprecationWarning.get_deprecation_headers("v1", "/api/meetings")
        for key, value in deprecation_headers.items():
            response.headers[key] = value
        
        # Transform V1 request to current format
        current_format = {
            "name": meeting_data.title,  # V1 used 'title', V2 uses 'name'
            "description": meeting_data.description,
            "meeting_type": "general",
            "status": "scheduled",
            "duration_minutes": 120
        }
        
        # Create meeting using current service
        meeting = await meeting_service.create_meeting(
            user_id=user_id,
            meeting_data=current_format,
            db=db
        )
        
        # Transform response to V1 format
        return V1MeetingResponse(
            id=str(meeting.id),
            title=meeting.name,
            description=meeting.description,
            created_at=meeting.created_at.isoformat(),
            updated_at=meeting.updated_at.isoformat(),
            transcript_text=meeting.transcript_text,
            summary_data=meeting.summary_data,
            processing_status=meeting.processing_status or "completed"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"V1 meeting creation failed for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to create meeting")

@router.get("/meetings/{meeting_id}", response_model=V1MeetingResponse)
async def get_meeting_v1(
    request: Request,
    response: Response,
    meeting_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Get specific meeting (V1 format) - Legacy desktop app compatibility
    """
    try:
        # Add deprecation headers
        deprecation_headers = DeprecationWarning.get_deprecation_headers("v1", "/api/meetings")
        for key, value in deprecation_headers.items():
            response.headers[key] = value
        
        meeting = await meeting_service.get_meeting(
            meeting_id=meeting_id,
            user_id=user_id,
            include_transcripts=True,
            db=db
        )
        
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        return V1MeetingResponse(
            id=str(meeting.id),
            title=meeting.name,
            description=meeting.description,
            created_at=meeting.created_at.isoformat(),
            updated_at=meeting.updated_at.isoformat(),
            transcript_text=meeting.transcript_text,
            summary_data=meeting.summary_data,
            processing_status=meeting.processing_status or "completed"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"V1 meeting fetch failed for meeting {meeting_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch meeting")

@router.put("/meetings/{meeting_id}", response_model=V1MeetingResponse)
async def update_meeting_v1(
    request: Request,
    response: Response,
    meeting_id: str,
    meeting_data: V1MeetingUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Update meeting (V1 format) - Legacy desktop app compatibility
    """
    try:
        # Add deprecation headers
        deprecation_headers = DeprecationWarning.get_deprecation_headers("v1", "/api/meetings")
        for key, value in deprecation_headers.items():
            response.headers[key] = value
        
        # Transform V1 request to current format
        update_dict = {}
        if meeting_data.title is not None:
            update_dict["name"] = meeting_data.title
        if meeting_data.description is not None:
            update_dict["description"] = meeting_data.description
        
        meeting = await meeting_service.update_meeting(
            meeting_id=meeting_id,
            user_id=user_id,
            update_data=update_dict,
            db=db
        )
        
        if not meeting:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        return V1MeetingResponse(
            id=str(meeting.id),
            title=meeting.name,
            description=meeting.description,
            created_at=meeting.created_at.isoformat(),
            updated_at=meeting.updated_at.isoformat(),
            transcript_text=meeting.transcript_text,
            summary_data=meeting.summary_data,
            processing_status=meeting.processing_status or "completed"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"V1 meeting update failed for meeting {meeting_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to update meeting")

@router.delete("/meetings/{meeting_id}")
async def delete_meeting_v1(
    request: Request,
    response: Response,
    meeting_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete meeting (V1 format) - Legacy desktop app compatibility
    """
    try:
        # Add deprecation headers
        deprecation_headers = DeprecationWarning.get_deprecation_headers("v1", "/api/meetings")
        for key, value in deprecation_headers.items():
            response.headers[key] = value
        
        success = await meeting_service.delete_meeting(
            meeting_id=meeting_id,
            user_id=user_id,
            soft_delete=False,  # V1 did hard deletes
            db=db
        )
        
        if not success:
            raise HTTPException(status_code=404, detail="Meeting not found")
        
        return {"success": True, "message": "Meeting deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"V1 meeting deletion failed for meeting {meeting_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to delete meeting")

# Legacy summary endpoints
@router.post("/meetings/{meeting_id}/summary")
async def generate_summary_v1(
    request: Request,
    response: Response,
    meeting_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate summary (V1 format) - Legacy desktop app compatibility
    """
    try:
        # Add deprecation headers
        deprecation_headers = DeprecationWarning.get_deprecation_headers("v1", "/api/meetings")
        for key, value in deprecation_headers.items():
            response.headers[key] = value
        
        result = await summary_service.generate_summary(
            meeting_id=meeting_id,
            user_id=user_id,
            summary_type="detailed",
            custom_prompt=None,
            model_preferences={},
            db=db
        )
        
        # V1 format was simpler
        return {
            "success": True,
            "summary": result,
            "meeting_id": meeting_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"V1 summary generation failed for meeting {meeting_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate summary")

@router.get("/meetings/{meeting_id}/summary/status")
async def get_summary_status_v1(
    request: Request,
    response: Response,
    meeting_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Get summary status (V1 format) - Legacy desktop app compatibility
    """
    try:
        # Add deprecation headers
        deprecation_headers = DeprecationWarning.get_deprecation_headers("v1", "/api/meetings")
        for key, value in deprecation_headers.items():
            response.headers[key] = value
        
        status_info = await summary_service.get_summary_status(
            meeting_id=meeting_id,
            user_id=user_id,
            db=db
        )
        
        # Transform to V1 format
        return {
            "meeting_id": meeting_id,
            "status": status_info.get("status", "completed"),
            "progress": status_info.get("progress", 100),
            "error": status_info.get("error_message")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"V1 summary status failed for meeting {meeting_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get summary status")