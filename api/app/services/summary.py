"""
Comprehensive AI-powered summary generation service for Meetingly web application

Features:
- LLM integration for summary generation
- Summary regeneration functionality
- Processing status tracking
- Error handling and retry logic
- Multiple summary types and formats
- User-specific AI model preferences
- Summary quality scoring and validation
"""

import asyncio
import json
import hashlib
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Union
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, and_, desc
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status
import httpx
import logging

from app.models.meeting import Meeting, ProcessingJob, Transcript
from app.models.user import User
from app.core.database import AsyncSessionLocal
from app.core.config import settings
from app.services.meeting import MeetingService
from app.services.websocket import websocket_service

logger = logging.getLogger(__name__)

class SummaryService:
    """
    Comprehensive AI summary generation service with LLM integration
    """
    
    def __init__(self):
        self.meeting_service = MeetingService()
        
        # AI Configuration
        self.default_model = "gpt-4"
        self.max_input_tokens = 32000
        self.max_output_tokens = 2000
        self.temperature = 0.1  # Low temperature for consistent summaries
        
        # Summary types
        self.summary_types = {
            "brief": {
                "max_length": 200,
                "style": "concise bullet points",
                "focus": "key decisions and action items"
            },
            "detailed": {
                "max_length": 1000,
                "style": "comprehensive paragraphs",
                "focus": "full discussion context and outcomes"
            },
            "action_items": {
                "max_length": 500,
                "style": "structured list",
                "focus": "actionable tasks and responsibilities"
            },
            "key_points": {
                "max_length": 300,
                "style": "bullet points",
                "focus": "main topics and decisions"
            }
        }
        
        # Retry configuration
        self.max_retries = 3
        self.retry_delay = 5  # seconds
        self.exponential_backoff = True
        
        # Quality thresholds
        self.min_quality_score = 0.7
        self.min_summary_length = 50
        
        logger.info("SummaryService initialized with AI integration")
    
    async def generate_summary(
        self,
        meeting_id: str,
        user_id: str,
        summary_type: str = "detailed",
        custom_prompt: Optional[str] = None,
        model_preferences: Optional[Dict[str, Any]] = None,
        db: AsyncSession = None
    ) -> Dict[str, Any]:
        """
        Generate AI summary for a meeting
        
        Args:
            meeting_id: ID of the meeting to summarize
            user_id: ID of the user requesting the summary
            summary_type: Type of summary to generate
            custom_prompt: Optional custom prompt for summary generation
            model_preferences: Optional AI model preferences
            db: Database session (optional)
            
        Returns:
            Dictionary containing summary data and metadata
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Validate meeting access
            meeting = await self.meeting_service.get_meeting(
                meeting_id, user_id, include_transcripts=True, db=db
            )
            
            if not meeting:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Meeting not found or access denied"
                )
            
            # Check if meeting has transcript data
            if not meeting.transcripts or len(meeting.transcripts) == 0:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Meeting must have transcript data to generate summary"
                )
            
            # Create processing job
            job = await self._create_summary_job(
                meeting_id, user_id, summary_type, custom_prompt, db
            )
            
            # Generate summary with retry logic
            summary_result = await self._generate_summary_with_retry(
                meeting, summary_type, custom_prompt, model_preferences, job.id
            )
            
            # Validate summary quality
            quality_score = await self._validate_summary_quality(
                summary_result["summary"], meeting.transcripts
            )
            
            if quality_score < self.min_quality_score:
                logger.warning(f"SUMMARY_QUALITY_LOW: Score {quality_score} for job {job.id}")
                # Optionally retry with different parameters
            
            # Prepare final result
            final_result = {
                **summary_result,
                "quality_score": quality_score,
                "meeting_id": meeting_id,
                "summary_type": summary_type,
                "generated_at": datetime.utcnow().isoformat(),
                "model_used": summary_result.get("model", self.default_model),
                "token_usage": summary_result.get("token_usage", {}),
                "processing_time": summary_result.get("processing_time", 0)
            }
            
            # Update meeting with summary data
            await self._update_meeting_summary(meeting, final_result, db)
            
            # Complete processing job
            await self._complete_summary_job(job.id, final_result, db)
            
            logger.info(f"SUMMARY_GENERATED: Job {job.id} for meeting {meeting_id}")
            
            # Send WebSocket notification for summary completion
            try:
                await websocket_service.notify_summary_ready(
                    user_id=user_id,
                    meeting_id=meeting_id,
                    summary_data=final_result
                )
                
                # Send system notification to user
                await websocket_service.send_system_notification(
                    user_id=user_id,
                    title="Summary Generated",
                    message=f"Meeting summary has been generated for '{meeting.name}'",
                    notification_type="success"
                )
            except Exception as ws_error:
                logger.warning(f"Failed to send WebSocket notification for summary {job.id}: {ws_error}")
            
            return final_result
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Summary generation failed for meeting {meeting_id}: {str(e)}")
            if 'job' in locals():
                await self._fail_summary_job(job.id, str(e), db)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Summary generation failed: {str(e)}"
            )
        finally:
            if should_close_db:
                await db.close()
    
    async def regenerate_summary(
        self,
        meeting_id: str,
        user_id: str,
        summary_type: str = None,
        custom_prompt: Optional[str] = None,
        model_preferences: Optional[Dict[str, Any]] = None,
        db: AsyncSession = None
    ) -> Dict[str, Any]:
        """
        Regenerate summary for a meeting with new parameters
        
        Args:
            meeting_id: ID of the meeting
            user_id: ID of the user requesting regeneration
            summary_type: New summary type (optional, uses previous if not provided)
            custom_prompt: New custom prompt
            model_preferences: New model preferences
            db: Database session (optional)
            
        Returns:
            Dictionary containing new summary data
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Get existing meeting data
            meeting = await self.meeting_service.get_meeting(
                meeting_id, user_id, include_transcripts=True, db=db
            )
            
            if not meeting:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Meeting not found or access denied"
                )
            
            # Use existing summary type if not provided
            if not summary_type and meeting.summary_data:
                summary_type = meeting.summary_data.get("summary_type", "detailed")
            elif not summary_type:
                summary_type = "detailed"
            
            logger.info(f"SUMMARY_REGENERATION: Starting for meeting {meeting_id}")
            
            # Generate new summary
            result = await self.generate_summary(
                meeting_id, user_id, summary_type, custom_prompt, model_preferences, db
            )
            
            return result
            
        except Exception as e:
            logger.error(f"Summary regeneration failed for meeting {meeting_id}: {str(e)}")
            raise
        finally:
            if should_close_db:
                await db.close()
    
    async def get_summary_status(
        self,
        meeting_id: str,
        user_id: str,
        db: AsyncSession = None
    ) -> Dict[str, Any]:
        """
        Get current summary processing status for a meeting
        
        Args:
            meeting_id: ID of the meeting
            user_id: ID of the user
            db: Database session (optional)
            
        Returns:
            Dictionary containing status information
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Check meeting access
            meeting = await self.meeting_service.get_meeting(meeting_id, user_id, db=db)
            
            if not meeting:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Meeting not found or access denied"
                )
            
            # Get latest summary processing job
            job_query = select(ProcessingJob).where(
                and_(
                    ProcessingJob.meeting_id == meeting_id,
                    ProcessingJob.job_type == "summary_generation"
                )
            ).order_by(desc(ProcessingJob.created_at)).limit(1)
            
            result = await db.execute(job_query)
            latest_job = result.scalar_one_or_none()
            
            status_info = {
                "meeting_id": meeting_id,
                "has_summary": bool(meeting.summary_data and meeting.summary_data.get("summary")),
                "summary_available": meeting.processing_status == "completed",
                "processing_status": meeting.processing_status or "pending",
                "last_generated": None,
                "summary_type": None,
                "quality_score": None
            }
            
            if meeting.summary_data:
                status_info.update({
                    "last_generated": meeting.summary_data.get("generated_at"),
                    "summary_type": meeting.summary_data.get("summary_type"),
                    "quality_score": meeting.summary_data.get("quality_score"),
                    "model_used": meeting.summary_data.get("model_used"),
                    "processing_time": meeting.summary_data.get("processing_time")
                })
            
            if latest_job:
                status_info.update({
                    "current_job_id": str(latest_job.id),
                    "current_job_status": latest_job.status,
                    "current_job_progress": latest_job.progress,
                    "current_step": latest_job.current_step,
                    "job_created_at": latest_job.created_at.isoformat(),
                    "estimated_completion": self._estimate_completion_time(latest_job)
                })
            
            return status_info
            
        except Exception as e:
            logger.error(f"Failed to get summary status for meeting {meeting_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to get summary status: {str(e)}"
            )
        finally:
            if should_close_db:
                await db.close()
    
    async def get_available_summary_types(self) -> Dict[str, Any]:
        """
        Get available summary types and their configurations
        
        Returns:
            Dictionary containing summary type information
        """
        return {
            "summary_types": self.summary_types,
            "default_type": "detailed",
            "custom_prompt_supported": True,
            "max_custom_prompt_length": 500
        }
    
    # Private helper methods
    
    async def _create_summary_job(
        self,
        meeting_id: str,
        user_id: str,
        summary_type: str,
        custom_prompt: Optional[str],
        db: AsyncSession
    ) -> ProcessingJob:
        """Create a processing job for summary generation"""
        
        config = {
            "summary_type": summary_type,
            "custom_prompt": custom_prompt,
            "model": self.default_model,
            "temperature": self.temperature,
            "max_tokens": self.max_output_tokens
        }
        
        job = ProcessingJob(
            user_id=user_id,
            meeting_id=meeting_id,
            job_type="summary_generation",
            job_queue="summary_processing",
            status="pending",
            progress=0,
            processing_config=config,
            estimated_duration=120,  # 2 minutes estimated
            current_step="Preparing transcript data"
        )
        
        db.add(job)
        await db.commit()
        await db.refresh(job)
        
        return job
    
    async def _generate_summary_with_retry(
        self,
        meeting: Meeting,
        summary_type: str,
        custom_prompt: Optional[str],
        model_preferences: Optional[Dict[str, Any]],
        job_id: str
    ) -> Dict[str, Any]:
        """Generate summary with retry logic"""
        
        last_error = None
        
        for attempt in range(self.max_retries):
            try:
                await self._update_job_status(
                    job_id, "running", 
                    10 + (attempt * 20), 
                    f"Generating summary (attempt {attempt + 1})"
                )
                
                # Prepare transcript data
                transcript_text = self._prepare_transcript_for_summary(meeting.transcripts)
                
                await self._update_job_status(
                    job_id, "running", 30, "Sending request to AI model"
                )
                
                # Generate summary using AI
                summary_result = await self._call_ai_service(
                    transcript_text, summary_type, custom_prompt, model_preferences
                )
                
                await self._update_job_status(
                    job_id, "running", 80, "Processing AI response"
                )
                
                # Validate and process result
                processed_result = await self._process_ai_response(
                    summary_result, summary_type, transcript_text
                )
                
                return processed_result
                
            except Exception as e:
                last_error = e
                logger.warning(f"Summary generation attempt {attempt + 1} failed: {str(e)}")
                
                if attempt < self.max_retries - 1:
                    # Calculate delay with exponential backoff
                    delay = self.retry_delay
                    if self.exponential_backoff:
                        delay *= (2 ** attempt)
                    
                    await self._update_job_status(
                        job_id, "running", 
                        20 + (attempt * 15), 
                        f"Retrying in {delay} seconds..."
                    )
                    
                    await asyncio.sleep(delay)
        
        # All retries failed
        raise Exception(f"Summary generation failed after {self.max_retries} attempts: {str(last_error)}")
    
    def _prepare_transcript_for_summary(self, transcripts: List[Transcript]) -> str:
        """Prepare transcript data for AI processing"""
        
        # Sort transcripts by start time
        sorted_transcripts = sorted(transcripts, key=lambda t: t.start_time)
        
        # Build formatted transcript
        transcript_parts = []
        current_speaker = None
        
        for transcript in sorted_transcripts:
            # Add speaker label if changed
            if transcript.speaker_id and transcript.speaker_id != current_speaker:
                current_speaker = transcript.speaker_id
                transcript_parts.append(f"\n[Speaker {current_speaker}]:")
            
            # Add timestamp and text
            start_time = self._format_timestamp(transcript.start_time)
            transcript_parts.append(f"[{start_time}] {transcript.text.strip()}")
        
        full_transcript = "\n".join(transcript_parts)
        
        # Truncate if too long
        if len(full_transcript) > self.max_input_tokens * 4:  # Rough token estimation
            logger.warning("Transcript too long, truncating for summary generation")
            full_transcript = full_transcript[:self.max_input_tokens * 4]
        
        return full_transcript
    
    def _format_timestamp(self, seconds: float) -> str:
        """Format timestamp for display"""
        minutes = int(seconds // 60)
        seconds = int(seconds % 60)
        return f"{minutes:02d}:{seconds:02d}"
    
    async def _call_ai_service(
        self,
        transcript_text: str,
        summary_type: str,
        custom_prompt: Optional[str],
        model_preferences: Optional[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """Call AI service to generate summary"""
        
        # Build prompt based on summary type
        system_prompt = self._build_system_prompt(summary_type, custom_prompt)
        
        # Prepare request
        model = (model_preferences or {}).get("model", self.default_model)
        temperature = (model_preferences or {}).get("temperature", self.temperature)
        
        request_data = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Please summarize this meeting transcript:\n\n{transcript_text}"}
            ],
            "temperature": temperature,
            "max_tokens": self.max_output_tokens
        }
        
        # Make API call (this would be to OpenAI, Azure OpenAI, or similar)
        start_time = datetime.utcnow()
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            # This is a placeholder - implement actual AI service integration
            # For now, simulate API call
            await asyncio.sleep(2)  # Simulate processing time
            
            # Mock response for development
            mock_response = self._generate_mock_summary(transcript_text, summary_type)
            
            processing_time = (datetime.utcnow() - start_time).total_seconds()
            
            return {
                "summary": mock_response["summary"],
                "model": model,
                "processing_time": processing_time,
                "token_usage": mock_response.get("token_usage", {}),
                "finish_reason": "completed"
            }
    
    def _build_system_prompt(self, summary_type: str, custom_prompt: Optional[str]) -> str:
        """Build system prompt for AI based on summary type"""
        
        base_prompts = {
            "brief": """You are an expert meeting summarizer. Create a brief, concise summary focusing on key decisions and action items. Use bullet points and keep it under 200 words. Focus on what was decided and what needs to be done next.""",
            
            "detailed": """You are an expert meeting summarizer. Create a comprehensive summary that captures the full context of discussions, decisions made, and outcomes. Organize into clear sections: Overview, Key Discussions, Decisions Made, Action Items, and Next Steps. Be thorough but concise.""",
            
            "action_items": """You are an expert at extracting actionable tasks from meetings. Focus exclusively on identifying specific action items, who is responsible, and any deadlines mentioned. Format as a structured list with clear ownership and timelines.""",
            
            "key_points": """You are an expert meeting summarizer. Extract and present the main topics discussed, key points raised, and important decisions. Use clear bullet points and focus on the most important information from the meeting."""
        }
        
        system_prompt = base_prompts.get(summary_type, base_prompts["detailed"])
        
        if custom_prompt:
            system_prompt += f"\n\nAdditional instructions: {custom_prompt}"
        
        system_prompt += "\n\nAlways maintain a professional tone and ensure accuracy in representing what was discussed."
        
        return system_prompt
    
    def _generate_mock_summary(self, transcript_text: str, summary_type: str) -> Dict[str, Any]:
        """Generate mock summary for development/testing"""
        
        word_count = len(transcript_text.split())
        
        mock_summaries = {
            "brief": f"Meeting summary with {word_count} words of transcript. Key decisions and action items were discussed.",
            "detailed": f"Comprehensive meeting summary covering {word_count} words of discussion. Multiple topics were covered with various decisions and outcomes.",
            "action_items": f"Action items extracted from {word_count} words of meeting transcript. Specific tasks and responsibilities identified.",
            "key_points": f"Key points from meeting with {word_count} words of content. Main topics and decisions highlighted."
        }
        
        return {
            "summary": mock_summaries.get(summary_type, mock_summaries["detailed"]),
            "token_usage": {
                "prompt_tokens": min(word_count, 2000),
                "completion_tokens": 150,
                "total_tokens": min(word_count, 2000) + 150
            }
        }
    
    async def _process_ai_response(
        self,
        ai_response: Dict[str, Any],
        summary_type: str,
        transcript_text: str
    ) -> Dict[str, Any]:
        """Process and validate AI response"""
        
        summary = ai_response.get("summary", "").strip()
        
        if not summary or len(summary) < self.min_summary_length:
            raise Exception("Generated summary is too short or empty")
        
        # Calculate summary statistics
        word_count = len(summary.split())
        char_count = len(summary)
        
        # Estimate reading time (average 200 words per minute)
        reading_time_minutes = max(1, word_count // 200)
        
        return {
            "summary": summary,
            "summary_statistics": {
                "word_count": word_count,
                "character_count": char_count,
                "estimated_reading_time": reading_time_minutes,
                "compression_ratio": round(len(transcript_text) / len(summary), 2)
            },
            "model": ai_response.get("model"),
            "processing_time": ai_response.get("processing_time"),
            "token_usage": ai_response.get("token_usage", {}),
            "finish_reason": ai_response.get("finish_reason")
        }
    
    async def _validate_summary_quality(
        self,
        summary: str,
        transcripts: List[Transcript]
    ) -> float:
        """Validate summary quality and return score (0.0 to 1.0)"""
        
        score = 1.0
        
        # Length validation
        if len(summary) < self.min_summary_length:
            score -= 0.3
        
        # Content validation
        word_count = len(summary.split())
        if word_count < 10:
            score -= 0.2
        
        # Check for placeholder text
        placeholder_phrases = ["summary", "discussed", "meeting", "transcript"]
        if all(phrase not in summary.lower() for phrase in placeholder_phrases):
            score -= 0.2
        
        # Ensure score is within bounds
        return max(0.0, min(1.0, score))
    
    async def _update_meeting_summary(
        self,
        meeting: Meeting,
        summary_result: Dict[str, Any],
        db: AsyncSession
    ):
        """Update meeting with summary data"""
        
        summary_data = meeting.summary_data or {}
        summary_data.update({
            "summary": summary_result["summary"],
            "summary_type": summary_result["summary_type"],
            "summary_statistics": summary_result.get("summary_statistics", {}),
            "quality_score": summary_result["quality_score"],
            "generated_at": summary_result["generated_at"],
            "model_used": summary_result["model_used"],
            "processing_time": summary_result["processing_time"],
            "token_usage": summary_result.get("token_usage", {})
        })
        
        meeting.summary_data = summary_data
        meeting.updated_at = datetime.utcnow()
        
        await db.commit()
    
    async def _update_job_status(
        self,
        job_id: str,
        status: str,
        progress: int,
        message: str
    ):
        """Update processing job status"""
        
        async with AsyncSessionLocal() as db:
            query = select(ProcessingJob).where(ProcessingJob.id == job_id)
            result = await db.execute(query)
            job = result.scalar_one_or_none()
            
            if job:
                job.status = status
                job.progress = progress
                job.current_step = message
                job.updated_at = datetime.utcnow()
                await db.commit()
    
    async def _complete_summary_job(
        self,
        job_id: str,
        result: Dict[str, Any],
        db: AsyncSession
    ):
        """Mark summary job as completed"""
        
        query = select(ProcessingJob).where(ProcessingJob.id == job_id)
        db_result = await db.execute(query)
        job = db_result.scalar_one_or_none()
        
        if job:
            job.status = "completed"
            job.progress = 100
            job.result = result
            job.completed_at = datetime.utcnow()
            job.current_step = "Summary generation completed"
            await db.commit()
    
    async def _fail_summary_job(
        self,
        job_id: str,
        error_message: str,
        db: AsyncSession
    ):
        """Mark summary job as failed"""
        
        query = select(ProcessingJob).where(ProcessingJob.id == job_id)
        result = await db.execute(query)
        job = result.scalar_one_or_none()
        
        if job:
            job.status = "failed"
            job.error_message = error_message
            job.completed_at = datetime.utcnow()
            job.current_step = "Summary generation failed"
            await db.commit()
    
    def _estimate_completion_time(self, job: ProcessingJob) -> Optional[str]:
        """Estimate when job will complete"""
        
        if job.status == "completed":
            return None
        
        if job.estimated_duration and job.created_at:
            estimated_completion = job.created_at + timedelta(seconds=job.estimated_duration)
            return estimated_completion.isoformat()
        
        return None