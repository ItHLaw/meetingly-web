from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime

from app.core.database import get_db
from app.models.user import User
from app.models.meeting import Meeting, ProcessingJob
from app.middleware.auth import get_current_user, get_current_user_id
from app.services.audio import AudioService
from app.services.meeting import MeetingService
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

router = APIRouter()
audio_service = AudioService()
meeting_service = MeetingService()

class AudioUploadRequest(BaseModel):
    meeting_id: Optional[str] = Field(None, description="ID of existing meeting")
    meeting_name: Optional[str] = Field(None, description="Name for new meeting if meeting_id not provided")
    enable_diarization: bool = Field(True, description="Enable speaker diarization")
    model: str = Field("base", description="Whisper model to use")
    language: str = Field("auto", description="Language for transcription")
    temperature: float = Field(0.0, ge=0.0, le=1.0, description="Temperature for model")
    beam_size: int = Field(5, ge=1, le=5, description="Beam size for search")
    word_timestamps: bool = Field(True, description="Include word-level timestamps")
    initial_prompt: Optional[str] = Field(None, description="Initial prompt for model")

class AudioUploadResponse(BaseModel):
    success: bool
    job_id: str
    meeting_id: str
    file_info: Dict[str, Any]
    processing_config: Dict[str, Any]
    estimated_duration: int
    message: str

class ProcessingJobResponse(BaseModel):
    job_id: str
    meeting_id: str
    status: str
    progress: int
    current_step: Optional[str]
    error_message: Optional[str]
    result: Optional[Dict[str, Any]]
    created_at: str
    updated_at: str
    started_at: Optional[str]
    completed_at: Optional[str]
    estimated_duration: Optional[int]
    actual_duration: Optional[int]

class JobListResponse(BaseModel):
    jobs: List[ProcessingJobResponse]
    total_count: int

@router.post("/upload", response_model=AudioUploadResponse)
async def upload_audio(
    file: UploadFile = File(..., description="Audio file to upload"),
    meeting_id: Optional[str] = Form(None, description="ID of existing meeting"),
    meeting_name: Optional[str] = Form(None, description="Name for new meeting"),
    enable_diarization: bool = Form(True, description="Enable speaker diarization"),
    model: str = Form("base", description="Whisper model to use"),
    language: str = Form("auto", description="Language for transcription"),
    temperature: float = Form(0.0, ge=0.0, le=1.0, description="Temperature for model"),
    beam_size: int = Form(5, ge=1, le=5, description="Beam size for search"),
    word_timestamps: bool = Form(True, description="Include word-level timestamps"),
    initial_prompt: Optional[str] = Form(None, description="Initial prompt for model"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Upload audio file for comprehensive processing with enhanced validation"""
    try:
        # Validate and save uploaded file
        file_info = await audio_service.save_uploaded_file(
            file=file,
            user_id=user_id,
            meeting_id=meeting_id
        )
        
        # Create or get meeting
        if meeting_id:
            # Verify meeting exists and user has access
            meeting = await meeting_service.get_meeting(meeting_id, user_id, db=db)
            if not meeting:
                raise HTTPException(
                    status_code=404,
                    detail="Meeting not found or access denied"
                )
        else:
            # Create new meeting
            meeting_data = {
                "name": meeting_name or f"Audio Upload - {datetime.now().strftime('%Y-%m-%d %H:%M')}",
                "description": f"Meeting created from audio upload: {file.filename}",
                "meeting_type": "audio_upload",
                "status": "in_progress"
            }
            meeting = await meeting_service.create_meeting(user_id, meeting_data, db)
            meeting_id = str(meeting.id)
        
        # Build processing configuration
        job_config = {
            "model": model,
            "language": language,
            "enable_diarization": enable_diarization,
            "temperature": temperature,
            "beam_size": beam_size,
            "word_timestamps": word_timestamps,
            "initial_prompt": initial_prompt,
            "condition_on_previous_text": True
        }
        
        # Create processing job
        job = await audio_service.create_processing_job(
            user_id=user_id,
            meeting_id=meeting_id,
            file_path=file_info["file_path"],
            job_config=job_config,
            db=db
        )
        
        # Queue for background processing
        task_id = await audio_service.queue_audio_processing(
            job=job,
            file_info=file_info,
            db=db
        )
        
        return AudioUploadResponse(
            success=True,
            job_id=str(job.id),
            meeting_id=meeting_id,
            file_info={
                "filename": file_info["filename"],
                "size_bytes": file_info["size_bytes"],
                "estimated_duration": file_info["metadata"].get("estimated_duration_minutes", 0)
            },
            processing_config=job_config,
            estimated_duration=job.estimated_duration or 300,
            message="File uploaded successfully. Processing queued."
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Audio upload failed for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail=f"Upload failed: {str(e)}"
        )

@router.get("/status/{job_id}", response_model=ProcessingJobResponse)
async def get_processing_status(
    job_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Get comprehensive processing status for a job with enhanced details"""
    try:
        job = await audio_service.get_processing_job(job_id, user_id, db)
        if not job:
            raise HTTPException(
                status_code=404, 
                detail="Processing job not found or access denied"
            )
        
        return ProcessingJobResponse(
            job_id=str(job.id),
            meeting_id=str(job.meeting_id),
            status=job.status,
            progress=job.progress or 0,
            current_step=job.current_step,
            error_message=job.error_message,
            result=job.result,
            created_at=job.created_at.isoformat(),
            updated_at=job.updated_at.isoformat(),
            started_at=job.started_at.isoformat() if job.started_at else None,
            completed_at=job.completed_at.isoformat() if job.completed_at else None,
            estimated_duration=job.estimated_duration,
            actual_duration=job.actual_duration
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get processing status for job {job_id}: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail="Failed to get processing status"
        )

@router.get("/jobs", response_model=JobListResponse)
async def get_user_jobs(
    status_filter: Optional[str] = Query(None, description="Filter jobs by status"),
    job_type: Optional[str] = Query(None, description="Filter jobs by type"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of jobs to return"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """Get processing jobs for the current user with filtering options"""
    try:
        jobs = await audio_service.get_user_jobs(user_id, db)
        
        # Apply filters
        if status_filter:
            jobs = [job for job in jobs if job.status == status_filter]
        
        if job_type:
            jobs = [job for job in jobs if job.job_type == job_type]
        
        # Apply limit
        jobs = jobs[:limit]
        
        job_responses = [
            ProcessingJobResponse(
                job_id=str(job.id),
                meeting_id=str(job.meeting_id),
                status=job.status,
                progress=job.progress or 0,
                current_step=job.current_step,
                error_message=job.error_message,
                result=job.result,
                created_at=job.created_at.isoformat(),
                updated_at=job.updated_at.isoformat(),
                started_at=job.started_at.isoformat() if job.started_at else None,
                completed_at=job.completed_at.isoformat() if job.completed_at else None,
                estimated_duration=job.estimated_duration,
                actual_duration=job.actual_duration
            )
            for job in jobs
        ]
        
        return JobListResponse(
            jobs=job_responses,
            total_count=len(job_responses)
        )
        
    except Exception as e:
        logger.error(f"Failed to get jobs for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500, 
            detail="Failed to get processing jobs"
        )

@router.get("/validate")
async def validate_audio_file(
    file: UploadFile = File(..., description="Audio file to validate"),
    user_id: str = Depends(get_current_user_id)
):
    """
    Validate audio file without uploading for processing
    """
    try:
        validation_result = await audio_service.validate_audio_file(file)
        
        return {
            "valid": validation_result["valid"],
            "errors": validation_result["errors"],
            "warnings": validation_result["warnings"],
            "metadata": validation_result["metadata"],
            "supported_formats": list(audio_service.allowed_extensions),
            "max_file_size_mb": audio_service.max_file_size / (1024 * 1024)
        }
        
    except Exception as e:
        logger.error(f"File validation failed for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="File validation failed"
        )

@router.get("/formats")
async def get_supported_formats():
    """
    Get supported audio formats and processing configurations
    """
    try:
        return {
            "supported_extensions": list(audio_service.allowed_extensions),
            "supported_mime_types": list(audio_service.allowed_mime_types),
            "max_file_size_bytes": audio_service.max_file_size,
            "max_file_size_mb": audio_service.max_file_size / (1024 * 1024),
            "supported_languages": audio_service.supported_languages,
            "available_models": ["tiny", "base", "small", "medium", "large"],
            "chunk_duration_seconds": audio_service.chunk_duration_seconds,
            "processing_features": {
                "speaker_diarization": True,
                "word_timestamps": True,
                "language_detection": True,
                "custom_prompts": True,
                "background_processing": True
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to get supported formats: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get format information"
        )

@router.get("/transcripts/{meeting_id}")
async def get_meeting_transcripts(
    meeting_id: str,
    include_segments: bool = Query(True, description="Include detailed transcript segments"),
    speaker_filter: Optional[str] = Query(None, description="Filter by specific speaker"),
    time_range_start: Optional[float] = Query(None, description="Start time filter (seconds)"),
    time_range_end: Optional[float] = Query(None, description="End time filter (seconds)"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Get transcript data for a meeting with filtering options
    """
    try:
        # Verify meeting access
        meeting = await meeting_service.get_meeting(
            meeting_id, user_id, include_transcripts=True, db=db
        )
        
        if not meeting:
            raise HTTPException(
                status_code=404,
                detail="Meeting not found or access denied"
            )
        
        if not meeting.transcripts:
            return {
                "meeting_id": meeting_id,
                "has_transcripts": False,
                "segments": [],
                "full_text": "",
                "statistics": {
                    "total_segments": 0,
                    "total_duration": 0,
                    "speakers": []
                }
            }
        
        # Filter transcripts
        transcripts = meeting.transcripts
        
        if speaker_filter:
            transcripts = [t for t in transcripts if t.speaker_id == speaker_filter]
        
        if time_range_start is not None:
            transcripts = [t for t in transcripts if t.start_time >= time_range_start]
        
        if time_range_end is not None:
            transcripts = [t for t in transcripts if t.end_time <= time_range_end]
        
        # Sort by start time
        transcripts = sorted(transcripts, key=lambda t: t.start_time)
        
        # Build response
        segments = []
        if include_segments:
            for transcript in transcripts:
                segments.append({
                    "id": str(transcript.id),
                    "start_time": transcript.start_time,
                    "end_time": transcript.end_time,
                    "text": transcript.text,
                    "speaker_id": transcript.speaker_id,
                    "confidence_score": transcript.confidence_score,
                    "segment_index": transcript.segment_index,
                    "language": transcript.language
                })
        
        # Generate full text
        full_text = " ".join([t.text for t in transcripts])
        
        # Calculate statistics
        speakers = list(set([t.speaker_id for t in transcripts if t.speaker_id]))
        total_duration = max([t.end_time for t in transcripts]) if transcripts else 0
        
        return {
            "meeting_id": meeting_id,
            "has_transcripts": True,
            "segments": segments,
            "full_text": full_text,
            "statistics": {
                "total_segments": len(transcripts),
                "total_duration": total_duration,
                "speakers": speakers,
                "language": transcripts[0].language if transcripts else None
            },
            "filters_applied": {
                "speaker_filter": speaker_filter,
                "time_range_start": time_range_start,
                "time_range_end": time_range_end
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get transcripts for meeting {meeting_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to get transcript data"
        )

@router.post("/jobs/{job_id}/retry")
async def retry_processing_job(
    job_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Retry a failed processing job
    """
    try:
        job = await audio_service.get_processing_job(job_id, user_id, db)
        if not job:
            raise HTTPException(
                status_code=404,
                detail="Processing job not found or access denied"
            )
        
        if job.status not in ["failed", "cancelled"]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot retry job with status: {job.status}"
            )
        
        # Reset job status for retry
        await audio_service.update_job_status(
            job_id=job_id,
            status="pending",
            progress=0,
            message="Queued for retry",
            db=db
        )
        
        # Re-queue for processing
        file_info = {
            "file_path": job.processing_config.get("file_path", ""),
            "filename": job.processing_config.get("filename", "unknown"),
            "size_bytes": job.processing_config.get("size_bytes", 0)
        }
        
        task_id = await audio_service.queue_audio_processing(
            job=job,
            file_info=file_info,
            db=db
        )
        
        return {
            "success": True,
            "message": "Job queued for retry",
            "job_id": job_id,
            "task_id": task_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to retry job {job_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to retry processing job"
        )

@router.delete("/jobs/{job_id}")
async def cancel_processing_job(
    job_id: str,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Cancel a running or pending processing job
    """
    try:
        job = await audio_service.get_processing_job(job_id, user_id, db)
        if not job:
            raise HTTPException(
                status_code=404,
                detail="Processing job not found or access denied"
            )
        
        if job.status in ["completed", "failed", "cancelled"]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot cancel job with status: {job.status}"
            )
        
        # Cancel the job
        await audio_service.fail_job(
            job_id=job_id,
            error_message="Cancelled by user request",
            error_code="USER_CANCELLED",
            db=db
        )
        
        # Update status to cancelled specifically
        await audio_service.update_job_status(
            job_id=job_id,
            status="cancelled",
            message="Cancelled by user",
            db=db
        )
        
        return {
            "success": True,
            "message": "Processing job cancelled",
            "job_id": job_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to cancel job {job_id}: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail="Failed to cancel processing job"
        )