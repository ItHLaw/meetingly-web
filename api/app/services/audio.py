import os
import uuid
import aiofiles
import mimetypes
import hashlib
import shutil
from pathlib import Path
from typing import Optional, List, Dict, Any, Tuple
from fastapi import UploadFile, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, update
import asyncio
import httpx
from datetime import datetime, timedelta
import logging
import json
from celery import Celery

from app.models.meeting import ProcessingJob, Meeting, Transcript
from app.models.user import User
from app.core.config import settings
from app.services.whisper import WhisperService
from app.services.file_storage import SecureFileStorage
from app.services.file_manager import FileManager
from app.core.database import AsyncSessionLocal
from app.services.websocket import websocket_service
from app.core.retry import with_database_retry, with_api_retry, with_file_retry
from app.middleware.error_handling import handle_errors

logger = logging.getLogger(__name__)

class AudioService:
    """
    Comprehensive audio processing service with file upload, validation, 
    cloud-based transcription, and job queue management
    """
    
    def __init__(self):
        self.whisper_service = WhisperService()
        self.file_storage = SecureFileStorage()
        self.file_manager = FileManager()
        
        # Legacy support for existing code
        self.upload_dir = Path(settings.UPLOAD_DIR)
        self.upload_dir.mkdir(parents=True, exist_ok=True)
        
        # File validation settings
        self.max_file_size = settings.MAX_FILE_SIZE  # bytes
        self.allowed_extensions = set(settings.ALLOWED_FILE_TYPES)
        self.allowed_mime_types = {
            'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 
            'audio/m4a', 'audio/flac', 'audio/ogg', 'audio/webm',
            'video/mp4', 'video/quicktime', 'video/x-msvideo'
        }
        
        # Processing configuration
        self.chunk_duration_seconds = 30 * 60  # 30 minutes max per chunk
        self.supported_languages = [
            'auto', 'en', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ja', 'ko', 'zh'
        ]
        
        # Initialize Celery for background processing
        self.celery_app = self._setup_celery()
        
        logger.info("AudioService initialized with Whisper integration")
    
    def _setup_celery(self) -> Optional[Celery]:
        """Setup Celery for background job processing"""
        try:
            if hasattr(settings, 'CELERY_BROKER_URL') and settings.CELERY_BROKER_URL:
                celery_app = Celery(
                    'audio_processor',
                    broker=settings.CELERY_BROKER_URL,
                    backend=settings.CELERY_RESULT_BACKEND,
                    include=['app.tasks.audio_tasks']
                )
                
                celery_app.conf.update(
                    task_serializer='json',
                    accept_content=['json'],
                    result_serializer='json',
                    timezone='UTC',
                    enable_utc=True,
                    task_track_started=True,
                    task_time_limit=3600,  # 1 hour max per task
                    task_soft_time_limit=3300,  # 55 minutes soft limit
                    worker_prefetch_multiplier=1,
                    task_acks_late=True,
                    worker_max_tasks_per_child=50
                )
                
                logger.info("Celery configured for background audio processing")
                return celery_app
            else:
                logger.warning("Celery not configured - using synchronous processing")
                return None
                
        except Exception as e:
            logger.error(f"Failed to setup Celery: {str(e)}")
            return None
    
    async def validate_audio_file(self, file: UploadFile, user_id: str = None) -> Dict[str, Any]:
        """
        Comprehensive audio file validation using SecureFileStorage
        
        Returns:
            Dict with validation results and file metadata
        """
        try:
            # Use the comprehensive file storage validation
            if user_id:
                return await self.file_storage.validate_file(file, user_id)
            else:
                # Fallback to basic validation for backward compatibility
                return await self.file_storage.validate_file(file, "temp_user", additional_checks=False)
                
        except Exception as e:
            logger.error(f"Audio file validation failed: {str(e)}")
            return {
                "valid": False,
                "errors": [f"Validation failed: {str(e)}"],
                "warnings": [],
                "metadata": {},
                "security_flags": []
            }
    
    def _estimate_duration(self, file_size: int, extension: str) -> float:
        """Estimate audio duration based on file size and format"""
        # Rough estimates in MB per minute
        bitrate_estimates = {
            '.mp3': 1.0,   # ~128kbps
            '.wav': 10.0,  # Uncompressed
            '.m4a': 1.0,   # ~128kbps
            '.flac': 5.0,  # Lossless compressed
            '.ogg': 1.0,   # ~128kbps
            '.webm': 1.0   # ~128kbps
        }
        
        mb_per_minute = bitrate_estimates.get(extension, 2.0)
        size_mb = file_size / (1024 * 1024)
        return round(size_mb / mb_per_minute, 1)
    
    @handle_errors("audio_file_save")
    @with_file_retry
    async def save_uploaded_file(
        self, 
        file: UploadFile, 
        user_id: str, 
        meeting_id: str = None
    ) -> Dict[str, Any]:
        """
        Save uploaded audio file using SecureFileStorage with comprehensive validation
        
        Returns:
            Dict containing file storage information
        """
        try:
            # Use the comprehensive file storage service
            storage_result = await self.file_storage.store_file(
                file=file,
                user_id=user_id,
                meeting_id=meeting_id,
                metadata={
                    "source": "audio_upload",
                    "processing_purpose": "transcription"
                }
            )
            
            # Create file record using file manager
            file_record = await self.file_manager.create_file_record(
                user_id=user_id,
                file_storage_info=storage_result,
                meeting_id=meeting_id,
                description=f"Audio file for processing: {file.filename}"
            )
            
            # Return compatible format for existing code
            return {
                "file_path": storage_result["storage_path"],
                "filename": storage_result["secure_filename"],
                "original_filename": storage_result["original_filename"],
                "size_bytes": storage_result["size_bytes"],
                "file_hash": storage_result["file_hash"],
                "file_id": storage_result["file_id"],
                "created_at": storage_result["stored_at"],
                "metadata": storage_result["metadata"]
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"File upload failed for user {user_id}: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"File upload failed: {str(e)}"
            )
    
    async def create_processing_job(
        self,
        user_id: str,
        meeting_id: str,
        file_path: str,
        job_config: Dict[str, Any],
        db: AsyncSession
    ) -> ProcessingJob:
        """
        Create a new audio processing job with comprehensive configuration
        """
        try:
            # Validate configuration
            config = self._validate_processing_config(job_config)
            
            # Create processing job
            job = ProcessingJob(
                user_id=user_id,
                meeting_id=meeting_id,
                job_type="transcription",
                job_queue="audio_processing",
                status="pending",
                progress=0,
                processing_config=config,
                estimated_duration=self._calculate_estimated_duration(file_path, config),
                current_step="Queued for processing"
            )
            
            db.add(job)
            await db.commit()
            await db.refresh(job)
            
            logger.info(f"PROCESSING_JOB_CREATED: {job.id} for user {user_id}")
            
            return job
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to create processing job: {str(e)}")
            raise
    
    def _validate_processing_config(self, config: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and normalize processing configuration"""
        validated_config = {
            "model": config.get("model", "base"),
            "language": config.get("language", "auto"),
            "enable_diarization": config.get("enable_diarization", True),
            "enable_timestamps": config.get("enable_timestamps", True),
            "temperature": max(0.0, min(1.0, config.get("temperature", 0.0))),
            "beam_size": max(1, min(5, config.get("beam_size", 5))),
            "best_of": max(1, min(5, config.get("best_of", 5))),
            "word_timestamps": config.get("word_timestamps", True),
            "initial_prompt": config.get("initial_prompt", ""),
            "condition_on_previous_text": config.get("condition_on_previous_text", True)
        }
        
        # Validate language
        if validated_config["language"] not in self.supported_languages:
            validated_config["language"] = "auto"
        
        # Validate model
        allowed_models = ["tiny", "base", "small", "medium", "large"]
        if validated_config["model"] not in allowed_models:
            validated_config["model"] = "base"
        
        return validated_config
    
    def _calculate_estimated_duration(self, file_path: str, config: Dict[str, Any]) -> int:
        """Calculate estimated processing time in seconds"""
        try:
            file_size = Path(file_path).stat().st_size
            size_mb = file_size / (1024 * 1024)
            
            # Base processing time per MB based on model
            model_multipliers = {
                "tiny": 0.5,
                "base": 1.0,
                "small": 2.0,
                "medium": 4.0,
                "large": 8.0
            }
            
            base_time_per_mb = 30  # seconds
            model_multiplier = model_multipliers.get(config.get("model", "base"), 1.0)
            diarization_multiplier = 1.5 if config.get("enable_diarization") else 1.0
            
            estimated_seconds = size_mb * base_time_per_mb * model_multiplier * diarization_multiplier
            
            return max(60, int(estimated_seconds))  # Minimum 1 minute
            
        except Exception:
            return 300  # Default 5 minutes
    
    async def queue_audio_processing(
        self,
        job: ProcessingJob,
        file_info: Dict[str, Any],
        db: AsyncSession = None
    ) -> str:
        """
        Queue audio processing job for background execution
        
        Returns:
            Celery task ID if using Celery, otherwise starts direct processing
        """
        try:
            # Update job with Celery task info
            if self.celery_app:
                # Use Celery for background processing
                task = self.celery_app.send_task(
                    'process_audio_task',
                    args=[str(job.id), file_info, job.processing_config],
                    queue=job.job_queue
                )
                
                # Update job with Celery task ID
                if db:
                    job.celery_task_id = task.id
                    job.status = "queued"
                    await db.commit()
                
                logger.info(f"AUDIO_QUEUED: Job {job.id} queued as task {task.id}")
                return task.id
            else:
                # Fallback to direct processing (for development/testing)
                await self._process_audio_direct(job.id, file_info, job.processing_config)
                return "direct"
                
        except Exception as e:
            logger.error(f"Failed to queue audio processing for job {job.id}: {str(e)}")
            if db:
                job.status = "failed"
                job.error_message = f"Queue error: {str(e)}"
                await db.commit()
            raise
    
    async def _process_audio_direct(
        self,
        job_id: str,
        file_info: Dict[str, Any],
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Direct audio processing without Celery (fallback method)
        """
        try:
            await self.update_job_status(job_id, "running", 5, "Starting transcription...")
            
            file_path = file_info["file_path"]
            
            # Validate file exists
            if not Path(file_path).exists():
                raise FileNotFoundError(f"Audio file not found: {file_path}")
            
            # Processing steps with progress updates
            if config.get("enable_diarization"):
                await self.update_job_status(job_id, "running", 15, "Initializing speaker diarization...")
            
            await self.update_job_status(job_id, "running", 25, "Loading audio file...")
            
            # Pre-process audio if needed
            await self.update_job_status(job_id, "running", 35, "Pre-processing audio...")
            
            # Main transcription with Whisper
            await self.update_job_status(job_id, "running", 50, "Transcribing with Whisper...")
            
            transcript_result = await self.whisper_service.transcribe_audio(
                file_path=file_path,
                model=config.get("model", "base"),
                enable_diarization=config.get("enable_diarization", True),
                language=config.get("language", "auto"),
                temperature=config.get("temperature", 0.0),
                beam_size=config.get("beam_size", 5),
                word_timestamps=config.get("word_timestamps", True),
                initial_prompt=config.get("initial_prompt", "")
            )
            
            await self.update_job_status(job_id, "running", 80, "Processing transcript segments...")
            
            # Process and structure the results
            result = await self._process_transcript_result(
                transcript_result, 
                job_id, 
                config
            )
            
            await self.update_job_status(job_id, "running", 95, "Finalizing results...")
            
            # Save structured transcript to database
            await self._save_transcript_segments(job_id, result, config)
            
            await self.complete_job(job_id, result)
            
            logger.info(f"AUDIO_PROCESSED: Job {job_id} completed successfully")
            return result
            
        except Exception as e:
            logger.error(f"Audio processing failed for job {job_id}: {str(e)}")
            await self.fail_job(job_id, str(e))
            raise
    
    async def _process_transcript_result(
        self,
        raw_result: Dict[str, Any],
        job_id: str,
        config: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Process and structure raw transcript results from Whisper
        """
        try:
            # Extract and structure transcript data
            segments = raw_result.get("segments", [])
            text = raw_result.get("text", "")
            
            # Enhanced result structure
            result = {
                "transcript_text": text,
                "language": raw_result.get("language", "en"),
                "language_probability": raw_result.get("language_probability", 0.0),
                "duration": raw_result.get("duration", 0.0),
                "segments": [],
                "speakers": {},
                "statistics": {
                    "total_segments": len(segments),
                    "total_words": len(text.split()) if text else 0,
                    "average_confidence": 0.0,
                    "speakers_detected": 0
                }
            }
            
            # Process segments with enhanced information
            speaker_stats = {}
            total_confidence = 0.0
            confidence_count = 0
            
            for i, segment in enumerate(segments):
                processed_segment = {
                    "id": i,
                    "start": segment.get("start", 0.0),
                    "end": segment.get("end", 0.0),
                    "text": segment.get("text", "").strip(),
                    "words": segment.get("words", []),
                    "confidence": segment.get("avg_logprob", 0.0),
                    "no_speech_prob": segment.get("no_speech_prob", 0.0),
                    "speaker": None,
                    "speaker_confidence": 0.0
                }
                
                # Add speaker information if diarization was enabled
                if config.get("enable_diarization") and "speaker" in segment:
                    speaker_id = segment["speaker"]
                    processed_segment["speaker"] = speaker_id
                    processed_segment["speaker_confidence"] = segment.get("speaker_confidence", 0.0)
                    
                    # Track speaker statistics
                    if speaker_id not in speaker_stats:
                        speaker_stats[speaker_id] = {
                            "total_time": 0.0,
                            "segment_count": 0,
                            "words": 0
                        }
                    
                    speaker_stats[speaker_id]["total_time"] += processed_segment["end"] - processed_segment["start"]
                    speaker_stats[speaker_id]["segment_count"] += 1
                    speaker_stats[speaker_id]["words"] += len(processed_segment["text"].split())
                
                # Aggregate confidence scores
                if processed_segment["confidence"]:
                    total_confidence += processed_segment["confidence"]
                    confidence_count += 1
                
                result["segments"].append(processed_segment)
            
            # Calculate statistics
            if confidence_count > 0:
                result["statistics"]["average_confidence"] = total_confidence / confidence_count
            
            result["statistics"]["speakers_detected"] = len(speaker_stats)
            result["speakers"] = speaker_stats
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to process transcript result: {str(e)}")
            raise
    
    async def _save_transcript_segments(
        self,
        job_id: str,
        result: Dict[str, Any],
        config: Dict[str, Any]
    ) -> None:
        """
        Save structured transcript segments to database
        """
        try:
            async with AsyncSessionLocal() as db:
                # Get job to find meeting and user
                job = await db.get(ProcessingJob, job_id)
                if not job:
                    raise ValueError(f"Job {job_id} not found")
                
                # Clear existing transcript segments for this meeting
                existing_transcripts = await db.execute(
                    select(Transcript).where(Transcript.meeting_id == job.meeting_id)
                )
                for transcript in existing_transcripts.scalars():
                    await db.delete(transcript)
                
                # Save new transcript segments
                for segment_data in result["segments"]:
                    transcript = Transcript(
                        meeting_id=job.meeting_id,
                        user_id=job.user_id,
                        text=segment_data["text"],
                        start_time=segment_data["start"],
                        end_time=segment_data["end"],
                        confidence_score=segment_data.get("confidence"),
                        speaker_id=segment_data.get("speaker"),
                        segment_index=segment_data["id"],
                        language=result.get("language")
                    )
                    db.add(transcript)
                
                await db.commit()
                logger.info(f"TRANSCRIPT_SAVED: {len(result['segments'])} segments for job {job_id}")
                
        except Exception as e:
            logger.error(f"Failed to save transcript segments: {str(e)}")
            raise
    
    @handle_errors("job_status_update")
    @with_database_retry
    async def update_job_status(
        self, 
        job_id: str, 
        status: str = None,
        progress: int = None, 
        message: str = None,
        db: AsyncSession = None
    ) -> None:
        """
        Update job status, progress and current step with enhanced tracking
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Get the job
            job = await db.get(ProcessingJob, job_id)
            if not job:
                logger.warning(f"Job {job_id} not found for status update")
                return
            
            # Update fields if provided
            if status:
                job.status = status
                if status == "running" and not job.started_at:
                    job.started_at = datetime.utcnow()
                elif status in ["completed", "failed", "cancelled"]:
                    job.completed_at = datetime.utcnow()
                    # Calculate actual duration
                    if job.started_at:
                        duration = (datetime.utcnow() - job.started_at).total_seconds()
                        job.actual_duration = int(duration)
            
            if progress is not None:
                job.progress = max(0, min(100, progress))
            
            if message:
                job.current_step = message
            
            job.updated_at = datetime.utcnow()
            
            await db.commit()
            
            # Send WebSocket update for real-time progress
            try:
                await websocket_service.notify_processing_status_update(
                    user_id=job.user_id,
                    job_id=job_id,
                    meeting_id=job.meeting_id,
                    status=job.status,
                    progress=job.progress,
                    error_message=job.error_message
                )
            except Exception as ws_error:
                logger.warning(f"Failed to send WebSocket update for job {job_id}: {ws_error}")
            
            logger.debug(f"JOB_STATUS_UPDATE: {job_id} - {status} - {progress}% - {message}")
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to update job status: {str(e)}")
            raise
        finally:
            if should_close_db:
                await db.close()
    
    # Legacy method for backward compatibility
    async def update_job_progress(self, job_id: str, progress: int, message: str = None):
        """Legacy method - use update_job_status instead"""
        await self.update_job_status(job_id, None, progress, message)
    
    async def complete_job(self, job_id: str, result: Dict[str, Any], db: AsyncSession = None):
        """
        Mark job as completed with comprehensive results and meeting updates
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Get the job
            job = await db.get(ProcessingJob, job_id)
            if not job:
                logger.error(f"Job {job_id} not found for completion")
                return
            
            # Update job status
            job.status = "completed"
            job.progress = 100
            job.result = result
            job.completed_at = datetime.utcnow()
            job.current_step = "Processing completed"
            
            # Calculate actual processing duration
            if job.started_at:
                duration = (job.completed_at - job.started_at).total_seconds()
                job.actual_duration = int(duration)
            
            # Update related meeting with comprehensive data
            if job.meeting_id:
                meeting = await db.get(Meeting, job.meeting_id)
                if meeting:
                    meeting.processing_status = "completed"
                    meeting.processing_completed_at = datetime.utcnow()
                    meeting.updated_at = datetime.utcnow()
                    
                    # Store comprehensive transcript data
                    if result.get("transcript_text"):
                        meeting.transcript_text = result["transcript_text"]
                    if result.get("language"):
                        meeting.transcript_language = result["language"]
                    
                    # Store processing statistics and metadata
                    meeting_metadata = {
                        "processing_statistics": result.get("statistics", {}),
                        "speakers": result.get("speakers", {}),
                        "language_probability": result.get("language_probability", 0.0),
                        "duration": result.get("duration", 0.0)
                    }
                    
                    # Merge with existing summary data or create new
                    if meeting.summary_data:
                        meeting.summary_data.update(meeting_metadata)
                    else:
                        meeting.summary_data = meeting_metadata
            
            await db.commit()
            
            logger.info(f"JOB_COMPLETED: {job_id} - Duration: {job.actual_duration}s")
            
            # Send WebSocket notification of completion
            try:
                await websocket_service.notify_processing_status_update(
                    user_id=job.user_id,
                    job_id=job_id,
                    meeting_id=job.meeting_id,
                    status="completed",
                    progress=100,
                    result=result
                )
                
                # Notify transcript ready
                await websocket_service.notify_transcript_ready(
                    user_id=job.user_id,
                    meeting_id=job.meeting_id,
                    transcript_data=result
                )
                
                # Send system notification to user
                await websocket_service.send_system_notification(
                    user_id=job.user_id,
                    title="Processing Complete",
                    message=f"Your meeting '{meeting.title if meeting else 'recording'}' has been successfully processed.",
                    notification_type="success"
                )
            except Exception as ws_error:
                logger.warning(f"Failed to send WebSocket notifications for job {job_id}: {ws_error}")
            
            # TODO: Trigger any post-processing tasks (summary generation, etc.)
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to complete job {job_id}: {str(e)}")
            raise
        finally:
            if should_close_db:
                await db.close()
    
    async def fail_job(self, job_id: str, error_message: str, error_code: str = None, db: AsyncSession = None):
        """
        Mark job as failed with detailed error information and retry logic
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Get the job
            job = await db.get(ProcessingJob, job_id)
            if not job:
                logger.error(f"Job {job_id} not found for failure update")
                return
            
            # Check if job should be retried
            if job.retry_count < job.max_retries:
                job.retry_count += 1
                job.status = "pending"  # Reset to pending for retry
                job.progress = 0
                job.current_step = f"Retry #{job.retry_count} - Queued"
                job.error_message = f"Retry {job.retry_count}/{job.max_retries}: {error_message}"
                
                logger.warning(f"JOB_RETRY: {job_id} - Attempt {job.retry_count}/{job.max_retries}")
                
                # TODO: Re-queue the job for processing
                
            else:
                # Mark as permanently failed
                job.status = "failed"
                job.error_message = error_message
                job.error_code = error_code or "PROCESSING_ERROR"
                job.completed_at = datetime.utcnow()
                job.current_step = "Processing failed"
                
                # Calculate actual processing duration if started
                if job.started_at:
                    duration = (datetime.utcnow() - job.started_at).total_seconds()
                    job.actual_duration = int(duration)
                
                # Update related meeting
                if job.meeting_id:
                    meeting = await db.get(Meeting, job.meeting_id)
                    if meeting:
                        meeting.processing_status = "failed"
                        meeting.updated_at = datetime.utcnow()
                        
                        # Store error information in meeting metadata
                        error_data = {
                            "error_message": error_message,
                            "error_code": error_code,
                            "failed_at": datetime.utcnow().isoformat(),
                            "retry_attempts": job.retry_count
                        }
                        
                        if meeting.summary_data:
                            meeting.summary_data["error_info"] = error_data
                        else:
                            meeting.summary_data = {"error_info": error_data}
                
                logger.error(f"JOB_FAILED: {job_id} - {error_message}")
                
                # Send WebSocket notification of failure
                try:
                    await websocket_service.notify_processing_status_update(
                        user_id=job.user_id,
                        job_id=job_id,
                        meeting_id=job.meeting_id,
                        status="failed",
                        progress=0,
                        error_message=error_message
                    )
                    
                    # Send error notification to user
                    await websocket_service.notify_error(
                        user_id=job.user_id,
                        error_type="processing_failed",
                        error_message=error_message,
                        context={"job_id": job_id, "meeting_id": job.meeting_id}
                    )
                    
                    # Send system notification to user
                    meeting = await db.get(Meeting, job.meeting_id) if job.meeting_id else None
                    await websocket_service.send_system_notification(
                        user_id=job.user_id,
                        title="Processing Failed",
                        message=f"Processing failed for '{meeting.title if meeting else 'recording'}': {error_message}",
                        notification_type="error"
                    )
                except Exception as ws_error:
                    logger.warning(f"Failed to send WebSocket failure notifications for job {job_id}: {ws_error}")
                
                # TODO: Log detailed error information for debugging
            
            job.updated_at = datetime.utcnow()
            await db.commit()
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to update job failure status: {str(e)}")
            raise
        finally:
            if should_close_db:
                await db.close()
    
    async def get_processing_job(self, job_id: str, user_id: str, db: AsyncSession) -> Optional[ProcessingJob]:
        """Get processing job by ID for user"""
        stmt = select(ProcessingJob).where(
            ProcessingJob.id == job_id,
            ProcessingJob.user_id == user_id
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_user_jobs(self, user_id: str, db: AsyncSession) -> List[ProcessingJob]:
        """Get all processing jobs for user"""
        stmt = select(ProcessingJob).where(
            ProcessingJob.user_id == user_id
        ).order_by(ProcessingJob.created_at.desc())
        result = await db.execute(stmt)
        return result.scalars().all()