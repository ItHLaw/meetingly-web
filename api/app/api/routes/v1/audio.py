"""
V1 Audio API - Legacy Desktop App Compatibility

This module provides backward compatibility for the original desktop application audio API.
It maintains the same endpoint structure and response format as the desktop version.
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from typing import Optional, Dict, Any

from app.core.database import get_db
from app.middleware.auth import get_current_user_id
from app.services.audio import AudioService
from app.services.meeting import MeetingService
from app.api.versioning import DeprecationWarning
import logging

logger = logging.getLogger(__name__)

router = APIRouter()
audio_service = AudioService()
meeting_service = MeetingService()

# V1 Models (Legacy format)
class V1AudioUploadResponse(BaseModel):
    success: bool
    job_id: str
    meeting_id: str
    message: str

class V1ProcessingJobResponse(BaseModel):
    id: str
    meeting_id: str
    status: str
    progress: int
    error: Optional[str] = None
    result: Optional[Dict[str, Any]] = None
    created_at: str
    updated_at: str

@router.post("/upload", response_model=V1AudioUploadResponse)
async def upload_audio_v1(
    request: Request,
    response: Response,
    file: UploadFile = File(...),
    meeting_id: Optional[str] = Form(None),
    meeting_title: Optional[str] = Form(None),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Upload audio file (V1 format) - Legacy desktop app compatibility
    """
    try:
        # Add deprecation headers
        deprecation_headers = DeprecationWarning.get_deprecation_headers("v1", "/api/audio")
        for key, value in deprecation_headers.items():
            response.headers[key] = value
        
        # Validate and save uploaded file
        file_info = await audio_service.save_uploaded_file(
            file=file,
            user_id=user_id,
            meeting_id=meeting_id
        )
        
        # Create or get meeting
        if meeting_id:
            meeting = await meeting_service.get_meeting(meeting_id, user_id, db=db)
            if not meeting:
                raise HTTPException(status_code=404, detail="Meeting not found")
        else:
            # Create new meeting with V1 format
            meeting_data = {
                "name": meeting_title or f"Audio Upload - {file.filename}",
                "description": f"Meeting created from audio upload: {file.filename}",
                "meeting_type": "audio_upload",
                "status": "in_progress"
            }
            meeting = await meeting_service.create_meeting(user_id, meeting_data, db)
            meeting_id = str(meeting.id)
        
        # Create processing job with V1 defaults
        job_config = {
            "model": "base",
            "language": "auto",
            "enable_diarization": True,
            "temperature": 0.0,
            "beam_size": 5,
            "word_timestamps": True
        }
        
        job = await audio_service.create_processing_job(
            user_id=user_id,
            meeting_id=meeting_id,
            file_path=file_info["file_path"],
            job_config=job_config,
            db=db
        )
        
        # Queue for background processing
        await audio_service.queue_audio_processing(
            job=job,
            file_info=file_info,
            db=db
        )
        
        return V1AudioUploadResponse(
            success=True,
            job_id=str(job.id),
            meeting_id=meeting_id,
            message="File uploaded successfully. Processing started."
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"V1 audio upload failed for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

@router.get("/status/{job_id}", response_model=V1ProcessingJobResponse)
async def get_processing_status_v1(
    request: Request,
    response: Response,
    job_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Get processing status (V1 format) - Legacy desktop app compatibility
    """
    try:
        # Add deprecation headers
        deprecation_headers = DeprecationWarning.get_deprecation_headers("v1", "/api/audio")
        for key, value in deprecation_headers.items():
            response.headers[key] = value
        
        job = await audio_service.get_processing_job(job_id, user_id, db)
        if not job:
            raise HTTPException(status_code=404, detail="Processing job not found")
        
        return V1ProcessingJobResponse(
            id=str(job.id),
            meeting_id=str(job.meeting_id),
            status=job.status,
            progress=job.progress or 0,
            error=job.error_message,
            result=job.result,
            created_at=job.created_at.isoformat(),
            updated_at=job.updated_at.isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"V1 processing status failed for job {job_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get processing status")

@router.get("/jobs")
async def get_processing_jobs_v1(
    request: Request,
    response: Response,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Get processing jobs (V1 format) - Legacy desktop app compatibility
    """
    try:
        # Add deprecation headers
        deprecation_headers = DeprecationWarning.get_deprecation_headers("v1", "/api/audio")
        for key, value in deprecation_headers.items():
            response.headers[key] = value
        
        jobs = await audio_service.get_user_jobs(user_id, db)
        
        # Transform to V1 format
        v1_jobs = [
            V1ProcessingJobResponse(
                id=str(job.id),
                meeting_id=str(job.meeting_id),
                status=job.status,
                progress=job.progress or 0,
                error=job.error_message,
                result=job.result,
                created_at=job.created_at.isoformat(),
                updated_at=job.updated_at.isoformat()
            )
            for job in jobs[:50]  # V1 had a limit of 50
        ]
        
        return {
            "jobs": v1_jobs,
            "total": len(v1_jobs)
        }
        
    except Exception as e:
        logger.error(f"V1 jobs fetch failed for user {user_id}: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get processing jobs")

@router.get("/formats")
async def get_supported_formats_v1(
    request: Request,
    response: Response
):
    """
    Get supported formats (V1 format) - Legacy desktop app compatibility
    """
    try:
        # Add deprecation headers
        deprecation_headers = DeprecationWarning.get_deprecation_headers("v1", "/api/audio")
        for key, value in deprecation_headers.items():
            response.headers[key] = value
        
        # V1 format was simpler
        return {
            "supported_formats": ["mp3", "wav", "m4a", "flac"],
            "max_file_size_mb": 100,
            "supported_models": ["tiny", "base", "small", "medium", "large"]
        }
        
    except Exception as e:
        logger.error(f"V1 formats fetch failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to get format information")