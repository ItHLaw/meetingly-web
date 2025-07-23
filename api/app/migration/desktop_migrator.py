"""
Desktop to Web Application Data Migration Utilities

This module provides comprehensive data migration functionality to transfer
user data from the desktop SQLite database to the new PostgreSQL web database
with proper user isolation and data integrity.
"""

import asyncio
import sqlite3
import json
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_
from app.core.database import get_db
from app.models.user import User, UserModelConfig
from app.models.meeting import Meeting, Transcript, ProcessingJob

logger = logging.getLogger(__name__)

@dataclass
class MigrationStats:
    """Statistics for migration operations"""
    meetings_migrated: int = 0
    transcripts_migrated: int = 0
    settings_migrated: int = 0
    errors: List[str] = None
    
    def __post_init__(self):
        if self.errors is None:
            self.errors = []

@dataclass
class DesktopMeeting:
    """Desktop meeting data structure"""
    id: str
    title: str
    created_at: str
    updated_at: str
    transcript_text: Optional[str] = None
    summary_data: Optional[Dict] = None
    processing_status: str = "completed"

@dataclass
class DesktopTranscript:
    """Desktop transcript data structure"""
    meeting_id: str
    transcript: str
    timestamp: str
    summary: Optional[str] = None
    action_items: Optional[str] = None
    key_points: Optional[str] = None

@dataclass
class DesktopSettings:
    """Desktop settings data structure"""
    provider: str
    model: str
    whisper_model: str
    api_keys: Dict[str, Optional[str]]

class DesktopDataMigrator:
    """
    Handles migration of data from desktop SQLite database to web PostgreSQL database
    """
    
    def __init__(self, sqlite_db_path: str):
        self.sqlite_db_path = Path(sqlite_db_path)
        if not self.sqlite_db_path.exists():
            raise FileNotFoundError(f"SQLite database not found: {sqlite_db_path}")
    
    async def migrate_user_data(
        self, 
        user_id: str, 
        db_session: AsyncSession,
        include_settings: bool = True
    ) -> MigrationStats:
        """
        Migrate all data for a specific user from desktop to web database
        
        Args:
            user_id: Target user ID in the web database
            db_session: Database session for web database
            include_settings: Whether to migrate user settings/model configs
            
        Returns:
            MigrationStats: Statistics about the migration
        """
        stats = MigrationStats()
        
        try:
            # Verify user exists
            user = await db_session.get(User, user_id)
            if not user:
                raise ValueError(f"User {user_id} not found in web database")
            
            # Load desktop data
            desktop_data = self._load_desktop_data()
            
            # Migrate meetings and transcripts
            await self._migrate_meetings(user_id, desktop_data, db_session, stats)
            
            # Migrate settings if requested
            if include_settings and desktop_data.get('settings'):
                await self._migrate_settings(user_id, desktop_data['settings'], db_session, stats)
            
            await db_session.commit()
            logger.info(f"Migration completed for user {user_id}: {stats}")
            
        except Exception as e:
            await db_session.rollback()
            error_msg = f"Migration failed for user {user_id}: {str(e)}"
            stats.errors.append(error_msg)
            logger.error(error_msg)
            raise
        
        return stats
    
    def _load_desktop_data(self) -> Dict[str, Any]:
        """Load all data from desktop SQLite database"""
        data = {
            'meetings': [],
            'transcripts': [],
            'transcript_chunks': [],
            'summary_processes': [],
            'settings': None
        }
        
        with sqlite3.connect(self.sqlite_db_path) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            
            # Load meetings
            cursor.execute("SELECT * FROM meetings ORDER BY created_at")
            data['meetings'] = [dict(row) for row in cursor.fetchall()]
            
            # Load transcripts
            cursor.execute("SELECT * FROM transcripts ORDER BY timestamp")
            data['transcripts'] = [dict(row) for row in cursor.fetchall()]
            
            # Load transcript chunks (contains processed transcript data)
            cursor.execute("SELECT * FROM transcript_chunks")
            data['transcript_chunks'] = [dict(row) for row in cursor.fetchall()]
            
            # Load summary processes
            cursor.execute("SELECT * FROM summary_processes")
            data['summary_processes'] = [dict(row) for row in cursor.fetchall()]
            
            # Load settings
            cursor.execute("SELECT * FROM settings LIMIT 1")
            settings_row = cursor.fetchone()
            if settings_row:
                data['settings'] = dict(settings_row)
        
        return data
    
    async def _migrate_meetings(
        self, 
        user_id: str, 
        desktop_data: Dict[str, Any], 
        db_session: AsyncSession,
        stats: MigrationStats
    ):
        """Migrate meetings and associated transcripts"""
        
        # Create lookup dictionaries for efficient processing
        transcript_chunks = {tc['meeting_id']: tc for tc in desktop_data['transcript_chunks']}
        summary_processes = {sp['meeting_id']: sp for sp in desktop_data['summary_processes']}
        transcripts_by_meeting = {}
        
        # Group transcripts by meeting
        for transcript in desktop_data['transcripts']:
            meeting_id = transcript['meeting_id']
            if meeting_id not in transcripts_by_meeting:
                transcripts_by_meeting[meeting_id] = []
            transcripts_by_meeting[meeting_id].append(transcript)
        
        for meeting_data in desktop_data['meetings']:
            try:
                # Check if meeting already exists for this user
                existing_meeting = await db_session.execute(
                    select(Meeting).where(
                        and_(
                            Meeting.user_id == user_id,
                            Meeting.title == meeting_data['title']
                        )
                    )
                )
                if existing_meeting.scalar_one_or_none():
                    logger.info(f"Meeting '{meeting_data['title']}' already exists for user {user_id}, skipping")
                    continue
                
                # Create new meeting
                meeting = Meeting(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    title=meeting_data['title'],
                    created_at=self._parse_datetime(meeting_data['created_at']),
                    updated_at=self._parse_datetime(meeting_data['updated_at'])
                )
                
                # Add transcript data if available
                chunk_data = transcript_chunks.get(meeting_data['id'])
                if chunk_data:
                    meeting.transcript_text = chunk_data['transcript_text']
                    meeting.transcript_language = 'en'  # Default, could be detected
                
                # Add summary data if available
                process_data = summary_processes.get(meeting_data['id'])
                if process_data and process_data.get('result'):
                    try:
                        summary_result = json.loads(process_data['result'])
                        meeting.summary_data = summary_result
                        meeting.processing_status = process_data['status'].lower()
                        
                        if process_data.get('start_time'):
                            meeting.processing_started_at = self._parse_datetime(process_data['start_time'])
                        if process_data.get('end_time'):
                            meeting.processing_completed_at = self._parse_datetime(process_data['end_time'])
                    except json.JSONDecodeError:
                        logger.warning(f"Invalid JSON in summary result for meeting {meeting_data['id']}")
                
                db_session.add(meeting)
                await db_session.flush()  # Get the meeting ID
                
                # Migrate individual transcript segments
                meeting_transcripts = transcripts_by_meeting.get(meeting_data['id'], [])
                for i, transcript_data in enumerate(meeting_transcripts):
                    transcript = Transcript(
                        id=uuid.uuid4(),
                        meeting_id=meeting.id,
                        user_id=user_id,
                        text=transcript_data['transcript'],
                        start_time=0.0,  # Desktop app doesn't track timing
                        end_time=0.0,
                        segment_index=i,
                        created_at=self._parse_datetime(transcript_data['timestamp'])
                    )
                    db_session.add(transcript)
                    stats.transcripts_migrated += 1
                
                # Create processing job record if there was processing
                if process_data:
                    job = ProcessingJob(
                        id=uuid.uuid4(),
                        user_id=user_id,
                        meeting_id=meeting.id,
                        job_type='summarization',
                        status=process_data['status'].lower(),
                        progress=100 if process_data['status'] == 'COMPLETED' else 0,
                        created_at=self._parse_datetime(process_data['created_at']),
                        updated_at=self._parse_datetime(process_data['updated_at'])
                    )
                    
                    if process_data.get('start_time'):
                        job.started_at = self._parse_datetime(process_data['start_time'])
                    if process_data.get('end_time'):
                        job.completed_at = self._parse_datetime(process_data['end_time'])
                    if process_data.get('error'):
                        job.error_message = process_data['error']
                    if process_data.get('result'):
                        try:
                            job.result = json.loads(process_data['result'])
                        except json.JSONDecodeError:
                            pass
                    
                    db_session.add(job)
                
                stats.meetings_migrated += 1
                logger.info(f"Migrated meeting: {meeting_data['title']}")
                
            except Exception as e:
                error_msg = f"Failed to migrate meeting {meeting_data['id']}: {str(e)}"
                stats.errors.append(error_msg)
                logger.error(error_msg)
    
    async def _migrate_settings(
        self, 
        user_id: str, 
        settings_data: Dict[str, Any], 
        db_session: AsyncSession,
        stats: MigrationStats
    ):
        """Migrate user settings and model configurations"""
        
        try:
            # Check if user already has model config
            existing_config = await db_session.execute(
                select(UserModelConfig).where(
                    and_(
                        UserModelConfig.user_id == user_id,
                        UserModelConfig.provider == settings_data.get('provider', 'openai')
                    )
                )
            )
            
            if existing_config.scalar_one_or_none():
                logger.info(f"Model config already exists for user {user_id}, skipping")
                return
            
            # Create new model configuration
            config = UserModelConfig(
                id=uuid.uuid4(),
                user_id=user_id,
                provider=settings_data.get('provider', 'openai'),
                model=settings_data.get('model', 'gpt-3.5-turbo'),
                whisper_model=settings_data.get('whisperModel', 'base'),
                is_active=True
            )
            
            # Note: API keys are not migrated for security reasons
            # Users will need to re-enter their API keys in the web app
            
            db_session.add(config)
            stats.settings_migrated += 1
            logger.info(f"Migrated settings for user {user_id}")
            
        except Exception as e:
            error_msg = f"Failed to migrate settings for user {user_id}: {str(e)}"
            stats.errors.append(error_msg)
            logger.error(error_msg)
    
    def _parse_datetime(self, dt_string: str) -> datetime:
        """Parse datetime string from desktop database"""
        if not dt_string:
            return datetime.now(timezone.utc)
        
        # Try different datetime formats used in desktop app
        formats = [
            '%Y-%m-%dT%H:%M:%S.%f',  # ISO format with microseconds
            '%Y-%m-%dT%H:%M:%S',     # ISO format without microseconds
            '%Y-%m-%d %H:%M:%S',     # SQLite datetime format
            '%Y-%m-%d',              # Date only
        ]
        
        for fmt in formats:
            try:
                dt = datetime.strptime(dt_string, fmt)
                # Ensure timezone awareness
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except ValueError:
                continue
        
        # Fallback to current time if parsing fails
        logger.warning(f"Could not parse datetime: {dt_string}, using current time")
        return datetime.now(timezone.utc)

class DataExportService:
    """
    Service for exporting user data from web application
    """
    
    async def export_user_data(
        self, 
        user_id: str, 
        db_session: AsyncSession,
        format: str = 'json'
    ) -> Dict[str, Any]:
        """
        Export all user data in specified format
        
        Args:
            user_id: User ID to export data for
            db_session: Database session
            format: Export format ('json', 'csv')
            
        Returns:
            Dict containing exported data
        """
        
        # Get user info
        user = await db_session.get(User, user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")
        
        # Get all meetings
        meetings_result = await db_session.execute(
            select(Meeting).where(Meeting.user_id == user_id).order_by(Meeting.created_at)
        )
        meetings = meetings_result.scalars().all()
        
        # Get all transcripts
        transcripts_result = await db_session.execute(
            select(Transcript).where(Transcript.user_id == user_id).order_by(Transcript.created_at)
        )
        transcripts = transcripts_result.scalars().all()
        
        # Get model configs
        configs_result = await db_session.execute(
            select(UserModelConfig).where(UserModelConfig.user_id == user_id)
        )
        configs = configs_result.scalars().all()
        
        export_data = {
            'export_info': {
                'user_id': str(user_id),
                'user_email': user.email,
                'user_name': user.name,
                'export_date': datetime.now(timezone.utc).isoformat(),
                'format': format
            },
            'meetings': [
                {
                    'id': str(meeting.id),
                    'title': meeting.title,
                    'description': meeting.description,
                    'created_at': meeting.created_at.isoformat(),
                    'updated_at': meeting.updated_at.isoformat(),
                    'transcript_text': meeting.transcript_text,
                    'summary_data': meeting.summary_data,
                    'action_items': meeting.action_items,
                    'key_topics': meeting.key_topics,
                    'processing_status': meeting.processing_status
                }
                for meeting in meetings
            ],
            'transcripts': [
                {
                    'id': str(transcript.id),
                    'meeting_id': str(transcript.meeting_id),
                    'text': transcript.text,
                    'start_time': transcript.start_time,
                    'end_time': transcript.end_time,
                    'speaker_id': transcript.speaker_id,
                    'speaker_name': transcript.speaker_name,
                    'confidence_score': transcript.confidence_score,
                    'created_at': transcript.created_at.isoformat()
                }
                for transcript in transcripts
            ],
            'model_configs': [
                {
                    'provider': config.provider,
                    'model': config.model,
                    'whisper_model': config.whisper_model,
                    'is_active': config.is_active,
                    'created_at': config.created_at.isoformat()
                }
                for config in configs
            ]
        }
        
        return export_data

class DataImportService:
    """
    Service for importing user data from various formats
    """
    
    async def import_user_data(
        self,
        user_id: str,
        import_data: Dict[str, Any],
        db_session: AsyncSession,
        format: str = 'json',
        merge_strategy: str = 'skip_existing'
    ) -> Dict[str, Any]:
        """
        Import user data from exported format
        
        Args:
            user_id: Target user ID
            import_data: Data to import
            db_session: Database session
            format: Import format ('json')
            merge_strategy: How to handle existing data ('skip_existing', 'overwrite', 'merge')
            
        Returns:
            Dict with import statistics
        """
        import_stats = {
            'meetings_imported': 0,
            'transcripts_imported': 0,
            'model_configs_imported': 0,
            'errors': [],
            'warnings': []
        }
        
        try:
            # Verify user exists
            user = await db_session.get(User, user_id)
            if not user:
                raise ValueError(f"User {user_id} not found")
            
            # Import meetings
            if 'meetings' in import_data:
                for meeting_data in import_data['meetings']:
                    try:
                        await self._import_meeting(
                            user_id, meeting_data, db_session, merge_strategy, import_stats
                        )
                    except Exception as e:
                        import_stats['errors'].append(f"Failed to import meeting {meeting_data.get('title', 'Unknown')}: {str(e)}")
            
            # Import model configurations
            if 'model_configs' in import_data:
                for config_data in import_data['model_configs']:
                    try:
                        await self._import_model_config(
                            user_id, config_data, db_session, merge_strategy, import_stats
                        )
                    except Exception as e:
                        import_stats['errors'].append(f"Failed to import model config: {str(e)}")
            
            await db_session.commit()
            logger.info(f"Data import completed for user {user_id}: {import_stats}")
            
        except Exception as e:
            await db_session.rollback()
            error_msg = f"Data import failed for user {user_id}: {str(e)}"
            import_stats['errors'].append(error_msg)
            logger.error(error_msg)
            raise
        
        return import_stats
    
    async def _import_meeting(
        self,
        user_id: str,
        meeting_data: Dict[str, Any],
        db_session: AsyncSession,
        merge_strategy: str,
        import_stats: Dict[str, Any]
    ):
        """Import a single meeting"""
        # Check if meeting already exists
        existing_meeting = await db_session.execute(
            select(Meeting).where(
                and_(
                    Meeting.user_id == user_id,
                    Meeting.title == meeting_data['title']
                )
            )
        )
        existing = existing_meeting.scalar_one_or_none()
        
        if existing and merge_strategy == 'skip_existing':
            import_stats['warnings'].append(f"Meeting '{meeting_data['title']}' already exists, skipping")
            return
        
        # Create or update meeting
        if existing and merge_strategy == 'overwrite':
            meeting = existing
            meeting.description = meeting_data.get('description')
            meeting.transcript_text = meeting_data.get('transcript_text')
            meeting.summary_data = meeting_data.get('summary_data')
            meeting.action_items = meeting_data.get('action_items')
            meeting.key_topics = meeting_data.get('key_topics')
            meeting.processing_status = meeting_data.get('processing_status', 'completed')
            meeting.updated_at = datetime.now(timezone.utc)
        else:
            meeting = Meeting(
                id=uuid.uuid4(),
                user_id=user_id,
                title=meeting_data['title'],
                description=meeting_data.get('description'),
                created_at=self._parse_datetime(meeting_data['created_at']),
                updated_at=self._parse_datetime(meeting_data['updated_at']),
                transcript_text=meeting_data.get('transcript_text'),
                summary_data=meeting_data.get('summary_data'),
                action_items=meeting_data.get('action_items'),
                key_topics=meeting_data.get('key_topics'),
                processing_status=meeting_data.get('processing_status', 'completed')
            )
            db_session.add(meeting)
        
        await db_session.flush()
        import_stats['meetings_imported'] += 1
        
        # Import associated transcripts if provided
        if 'transcripts' in meeting_data:
            for transcript_data in meeting_data['transcripts']:
                transcript = Transcript(
                    id=uuid.uuid4(),
                    meeting_id=meeting.id,
                    user_id=user_id,
                    text=transcript_data['text'],
                    start_time=transcript_data.get('start_time', 0.0),
                    end_time=transcript_data.get('end_time', 0.0),
                    speaker_id=transcript_data.get('speaker_id'),
                    speaker_name=transcript_data.get('speaker_name'),
                    confidence_score=transcript_data.get('confidence_score'),
                    created_at=self._parse_datetime(transcript_data['created_at'])
                )
                db_session.add(transcript)
                import_stats['transcripts_imported'] += 1
    
    async def _import_model_config(
        self,
        user_id: str,
        config_data: Dict[str, Any],
        db_session: AsyncSession,
        merge_strategy: str,
        import_stats: Dict[str, Any]
    ):
        """Import a model configuration"""
        # Check if config already exists
        existing_config = await db_session.execute(
            select(UserModelConfig).where(
                and_(
                    UserModelConfig.user_id == user_id,
                    UserModelConfig.provider == config_data['provider']
                )
            )
        )
        existing = existing_config.scalar_one_or_none()
        
        if existing and merge_strategy == 'skip_existing':
            import_stats['warnings'].append(f"Model config for {config_data['provider']} already exists, skipping")
            return
        
        if existing and merge_strategy == 'overwrite':
            existing.model = config_data['model']
            existing.whisper_model = config_data['whisper_model']
            existing.is_active = config_data.get('is_active', True)
            existing.updated_at = datetime.now(timezone.utc)
        else:
            config = UserModelConfig(
                id=uuid.uuid4(),
                user_id=user_id,
                provider=config_data['provider'],
                model=config_data['model'],
                whisper_model=config_data['whisper_model'],
                is_active=config_data.get('is_active', True)
            )
            db_session.add(config)
        
        import_stats['model_configs_imported'] += 1
    
    def _parse_datetime(self, dt_string: str) -> datetime:
        """Parse datetime string from import data"""
        if not dt_string:
            return datetime.now(timezone.utc)
        
        # Try different datetime formats
        formats = [
            '%Y-%m-%dT%H:%M:%S.%f%z',  # ISO format with timezone
            '%Y-%m-%dT%H:%M:%S%z',     # ISO format with timezone, no microseconds
            '%Y-%m-%dT%H:%M:%S.%f',    # ISO format with microseconds
            '%Y-%m-%dT%H:%M:%S',       # ISO format without microseconds
            '%Y-%m-%d %H:%M:%S',       # SQLite datetime format
            '%Y-%m-%d',                # Date only
        ]
        
        for fmt in formats:
            try:
                dt = datetime.strptime(dt_string, fmt)
                # Ensure timezone awareness
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt
            except ValueError:
                continue
        
        # Fallback to current time if parsing fails
        logger.warning(f"Could not parse datetime: {dt_string}, using current time")
        return datetime.now(timezone.utc)

class DataCleanupService:
    """
    Service for cleaning up user data
    """
    
    async def cleanup_user_data(
        self, 
        user_id: str, 
        db_session: AsyncSession,
        older_than_days: Optional[int] = None,
        dry_run: bool = True
    ) -> Dict[str, int]:
        """
        Clean up user data based on specified criteria
        
        Args:
            user_id: User ID to clean up data for
            db_session: Database session
            older_than_days: Only delete data older than this many days
            dry_run: If True, only count what would be deleted
            
        Returns:
            Dict with counts of items that would be/were deleted
        """
        
        cleanup_stats = {
            'meetings_deleted': 0,
            'transcripts_deleted': 0,
            'processing_jobs_deleted': 0
        }
        
        # Build date filter if specified
        date_filter = None
        if older_than_days:
            cutoff_date = datetime.now(timezone.utc) - timedelta(days=older_than_days)
            date_filter = Meeting.created_at < cutoff_date
        
        # Find meetings to delete
        query = select(Meeting).where(Meeting.user_id == user_id)
        if date_filter is not None:
            query = query.where(date_filter)
        
        meetings_result = await db_session.execute(query)
        meetings_to_delete = meetings_result.scalars().all()
        
        cleanup_stats['meetings_deleted'] = len(meetings_to_delete)
        
        # Count associated transcripts and jobs
        for meeting in meetings_to_delete:
            transcripts_result = await db_session.execute(
                select(Transcript).where(Transcript.meeting_id == meeting.id)
            )
            cleanup_stats['transcripts_deleted'] += len(transcripts_result.scalars().all())
            
            jobs_result = await db_session.execute(
                select(ProcessingJob).where(ProcessingJob.meeting_id == meeting.id)
            )
            cleanup_stats['processing_jobs_deleted'] += len(jobs_result.scalars().all())
        
        # Perform actual deletion if not dry run
        if not dry_run:
            for meeting in meetings_to_delete:
                await db_session.delete(meeting)  # Cascade will handle related records
            
            await db_session.commit()
            logger.info(f"Cleaned up data for user {user_id}: {cleanup_stats}")
        else:
            logger.info(f"Dry run cleanup for user {user_id}: {cleanup_stats}")
        
        return cleanup_stats