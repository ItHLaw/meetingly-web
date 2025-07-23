from fastapi import APIRouter, HTTPException, Depends, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime
from app.core.database import get_db
from app.middleware.auth import get_current_user_id, get_current_user
from app.models import Meeting, User
from app.services.meeting import MeetingService
from app.services.summary import SummaryService
import logging

logger = logging.getLogger(__name__)

router = APIRouter()
meeting_service = MeetingService()
summary_service = SummaryService()

class MeetingCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200, description="Meeting name")
    description: Optional[str] = Field(None, max_length=1000, description="Meeting description")
    meeting_date: Optional[datetime] = Field(None, description="Scheduled meeting date")
    duration_minutes: Optional[int] = Field(120, ge=1, le=720, description="Meeting duration in minutes")
    status: Optional[str] = Field("scheduled", description="Meeting status")
    meeting_type: Optional[str] = Field("general", description="Type of meeting")
    participants: Optional[List[str]] = Field([], description="List of participants")
    metadata: Optional[Dict[str, Any]] = Field({}, description="Additional metadata")

class MeetingUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    meeting_date: Optional[datetime] = None
    duration_minutes: Optional[int] = Field(None, ge=1, le=720)
    status: Optional[str] = None
    meeting_type: Optional[str] = None
    participants: Optional[List[str]] = None
    metadata: Optional[Dict[str, Any]] = None

class MeetingResponse(BaseModel):
    id: str
    user_id: str
    name: str
    description: Optional[str]
    meeting_date: Optional[str]
    duration_minutes: int
    status: str
    meeting_type: str
    participants: List[str]
    processing_status: str
    created_at: str
    updated_at: str
    is_archived: bool
    transcript_text: Optional[str] = None
    summary_data: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None

class MeetingListResponse(BaseModel):
    meetings: List[MeetingResponse]
    pagination: Dict[str, Any]
    filters_applied: Dict[str, Any]
    sort: Dict[str, Any]

class MeetingStatistics(BaseModel):
    total_meetings: int
    completed_meetings: int
    completion_rate: float
    status_distribution: Dict[str, int]
    processing_distribution: Dict[str, int]
    time_range: Dict[str, Optional[str]]

class SummaryRequest(BaseModel):
    summary_type: str = Field("detailed", description="Type of summary to generate")
    custom_prompt: Optional[str] = Field(None, max_length=500, description="Custom prompt for summary")
    model_preferences: Optional[Dict[str, Any]] = Field({}, description="AI model preferences")

@router.get("/", response_model=MeetingListResponse)
async def get_user_meetings(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Number of items per page"),
    sort_by: str = Query("updated_at", description="Field to sort by"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="Sort order"),
    status: Optional[str] = Query(None, description="Filter by status"),
    processing_status: Optional[str] = Query(None, description="Filter by processing status"),
    meeting_type: Optional[str] = Query(None, description="Filter by meeting type"),
    search: Optional[str] = Query(None, description="Search in name and description"),
    include_archived: bool = Query(False, description="Include archived meetings"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Get meetings for the current user with comprehensive filtering, pagination, and sorting
    """
    try:
        # Build filters
        filters = {}
        if status:
            filters["status"] = status
        if processing_status:
            filters["processing_status"] = processing_status
        if meeting_type:
            filters["meeting_type"] = meeting_type
        if search:
            filters["search"] = search
        if include_archived:
            filters["include_archived"] = True
        
        # Get meetings using service
        result = await meeting_service.get_user_meetings(
            user_id=user_id,
            filters=filters,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_order=sort_order,
            db=db
        )
        
        # Convert meetings to response format
        meeting_responses = [
            MeetingResponse(
                id=str(meeting.id),
                user_id=str(meeting.user_id),
                name=meeting.name or "Untitled Meeting",
                description=meeting.description,
                meeting_date=meeting.meeting_date.isoformat() if meeting.meeting_date else None,
                duration_minutes=meeting.duration_minutes or 120,
                status=meeting.status or "scheduled",
                meeting_type=meeting.meeting_type or "general",
                participants=meeting.participants or [],
                processing_status=meeting.processing_status or "pending",
                created_at=meeting.created_at.isoformat(),
                updated_at=meeting.updated_at.isoformat(),
                is_archived=meeting.is_archived or False,
                transcript_text=meeting.transcript_text,
                summary_data=meeting.summary_data,
                metadata=meeting.metadata
            )
            for meeting in result["meetings"]
        ]
        
        return MeetingListResponse(
            meetings=meeting_responses,
            pagination=result["pagination"],
            filters_applied=result["filters_applied"],
            sort=result["sort"]
        )
        
    except Exception as e:
        logger.error(f"Error fetching meetings for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch meetings"
        )

@router.post("/", response_model=MeetingResponse)
async def create_meeting(
    meeting_data: MeetingCreate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Create a new meeting for the current user with comprehensive validation
    """
    try:
        # Convert Pydantic model to dict
        meeting_dict = meeting_data.dict(exclude_unset=True)
        
        # Create meeting using service
        meeting = await meeting_service.create_meeting(
            user_id=user_id,
            meeting_data=meeting_dict,
            db=db
        )
        
        return MeetingResponse(
            id=str(meeting.id),
            user_id=str(meeting.user_id),
            name=meeting.name,
            description=meeting.description,
            meeting_date=meeting.meeting_date.isoformat() if meeting.meeting_date else None,
            duration_minutes=meeting.duration_minutes,
            status=meeting.status,
            meeting_type=meeting.meeting_type,
            participants=meeting.participants or [],
            processing_status=meeting.processing_status,
            created_at=meeting.created_at.isoformat(),
            updated_at=meeting.updated_at.isoformat(),
            is_archived=meeting.is_archived,
            transcript_text=meeting.transcript_text,
            summary_data=meeting.summary_data,
            metadata=meeting.metadata
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating meeting for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to create meeting"
        )

@router.get("/{meeting_id}", response_model=MeetingResponse)
async def get_meeting(
    meeting_id: str,
    include_transcripts: bool = Query(False, description="Include transcript data"),
    include_processing_jobs: bool = Query(False, description="Include processing job data"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Get a specific meeting by ID with user isolation and optional related data
    """
    try:
        meeting = await meeting_service.get_meeting(
            meeting_id=meeting_id,
            user_id=user_id,
            include_transcripts=include_transcripts,
            include_processing_jobs=include_processing_jobs,
            db=db
        )
        
        if not meeting:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Meeting not found or access denied"
            )
        
        return MeetingResponse(
            id=str(meeting.id),
            user_id=str(meeting.user_id),
            name=meeting.name,
            description=meeting.description,
            meeting_date=meeting.meeting_date.isoformat() if meeting.meeting_date else None,
            duration_minutes=meeting.duration_minutes,
            status=meeting.status,
            meeting_type=meeting.meeting_type,
            participants=meeting.participants or [],
            processing_status=meeting.processing_status,
            created_at=meeting.created_at.isoformat(),
            updated_at=meeting.updated_at.isoformat(),
            is_archived=meeting.is_archived,
            transcript_text=meeting.transcript_text,
            summary_data=meeting.summary_data,
            metadata=meeting.metadata
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching meeting {meeting_id} for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to fetch meeting"
        )

@router.put("/{meeting_id}", response_model=MeetingResponse)
async def update_meeting(
    meeting_id: str,
    meeting_data: MeetingUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Update a meeting with comprehensive validation and user isolation
    """
    try:
        # Convert Pydantic model to dict, excluding unset values
        update_dict = meeting_data.dict(exclude_unset=True)
        
        # Update meeting using service
        meeting = await meeting_service.update_meeting(
            meeting_id=meeting_id,
            user_id=user_id,
            update_data=update_dict,
            db=db
        )
        
        if not meeting:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Meeting not found or access denied"
            )
        
        return MeetingResponse(
            id=str(meeting.id),
            user_id=str(meeting.user_id),
            name=meeting.name,
            description=meeting.description,
            meeting_date=meeting.meeting_date.isoformat() if meeting.meeting_date else None,
            duration_minutes=meeting.duration_minutes,
            status=meeting.status,
            meeting_type=meeting.meeting_type,
            participants=meeting.participants or [],
            processing_status=meeting.processing_status,
            created_at=meeting.created_at.isoformat(),
            updated_at=meeting.updated_at.isoformat(),
            is_archived=meeting.is_archived,
            transcript_text=meeting.transcript_text,
            summary_data=meeting.summary_data,
            metadata=meeting.metadata
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating meeting {meeting_id} for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update meeting"
        )

@router.delete("/{meeting_id}")
async def delete_meeting(
    meeting_id: str,
    hard_delete: bool = Query(False, description="Permanently delete (true) or archive (false)"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Delete or archive a meeting with user isolation
    """
    try:
        success = await meeting_service.delete_meeting(
            meeting_id=meeting_id,
            user_id=user_id,
            soft_delete=not hard_delete,
            db=db
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Meeting not found or access denied"
            )
        
        action = "deleted permanently" if hard_delete else "archived"
        return {
            "success": True, 
            "message": f"Meeting {action} successfully",
            "meeting_id": meeting_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting meeting {meeting_id} for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete meeting"
        )

@router.post("/{meeting_id}/restore", response_model=MeetingResponse)
async def restore_meeting(
    meeting_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Restore an archived meeting
    """
    try:
        meeting = await meeting_service.restore_meeting(
            meeting_id=meeting_id,
            user_id=user_id,
            db=db
        )
        
        if not meeting:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Archived meeting not found or access denied"
            )
        
        return MeetingResponse(
            id=str(meeting.id),
            user_id=str(meeting.user_id),
            name=meeting.name,
            description=meeting.description,
            meeting_date=meeting.meeting_date.isoformat() if meeting.meeting_date else None,
            duration_minutes=meeting.duration_minutes,
            status=meeting.status,
            meeting_type=meeting.meeting_type,
            participants=meeting.participants or [],
            processing_status=meeting.processing_status,
            created_at=meeting.created_at.isoformat(),
            updated_at=meeting.updated_at.isoformat(),
            is_archived=meeting.is_archived,
            transcript_text=meeting.transcript_text,
            summary_data=meeting.summary_data,
            metadata=meeting.metadata
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error restoring meeting {meeting_id} for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to restore meeting"
        )

@router.get("/statistics/overview", response_model=MeetingStatistics)
async def get_meeting_statistics(
    start_date: Optional[datetime] = Query(None, description="Start date for statistics"),
    end_date: Optional[datetime] = Query(None, description="End date for statistics"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Get meeting statistics for the current user
    """
    try:
        time_range = None
        if start_date and end_date:
            time_range = (start_date, end_date)
        
        statistics = await meeting_service.get_meeting_statistics(
            user_id=user_id,
            time_range=time_range,
            db=db
        )
        
        return MeetingStatistics(**statistics)
        
    except Exception as e:
        logger.error(f"Error getting meeting statistics for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get meeting statistics"
        )

@router.post("/{meeting_id}/summary/generate")
async def generate_meeting_summary(
    meeting_id: str,
    summary_request: SummaryRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Generate AI summary for a meeting
    """
    try:
        result = await summary_service.generate_summary(
            meeting_id=meeting_id,
            user_id=user_id,
            summary_type=summary_request.summary_type,
            custom_prompt=summary_request.custom_prompt,
            model_preferences=summary_request.model_preferences,
            db=db
        )
        
        return {
            "success": True,
            "message": "Summary generated successfully",
            "summary": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating summary for meeting {meeting_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to generate summary"
        )

@router.post("/{meeting_id}/summary/regenerate")
async def regenerate_meeting_summary(
    meeting_id: str,
    summary_request: SummaryRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Regenerate AI summary for a meeting with new parameters
    """
    try:
        result = await summary_service.regenerate_summary(
            meeting_id=meeting_id,
            user_id=user_id,
            summary_type=summary_request.summary_type,
            custom_prompt=summary_request.custom_prompt,
            model_preferences=summary_request.model_preferences,
            db=db
        )
        
        return {
            "success": True,
            "message": "Summary regenerated successfully",
            "summary": result
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error regenerating summary for meeting {meeting_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to regenerate summary"
        )

@router.get("/{meeting_id}/summary/status")
async def get_summary_status(
    meeting_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Get current summary processing status for a meeting
    """
    try:
        status_info = await summary_service.get_summary_status(
            meeting_id=meeting_id,
            user_id=user_id,
            db=db
        )
        
        return status_info
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting summary status for meeting {meeting_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get summary status"
        )

@router.get("/summary/types")
async def get_available_summary_types():
    """
    Get available summary types and their configurations
    """
    try:
        return await summary_service.get_available_summary_types()
        
    except Exception as e:
        logger.error(f"Error getting summary types: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get summary types"
        )