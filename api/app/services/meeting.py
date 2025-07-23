"""
Comprehensive meeting management service for Meetingly web application

Features:
- CRUD operations with user isolation
- Meeting list retrieval with filtering and pagination
- Meeting update and deletion functionality
- User-specific data access controls
- Meeting status management
- Integration with audio processing and transcription
"""

import uuid
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update, and_, or_, desc, asc, func, text
from sqlalchemy.orm import selectinload, joinedload
from fastapi import HTTPException, status
import logging

from app.models.meeting import Meeting, ProcessingJob, Transcript
from app.models.user import User
from app.core.database import AsyncSessionLocal
from app.core.config import settings
from app.services.websocket import websocket_service

logger = logging.getLogger(__name__)

class MeetingService:
    """
    Comprehensive meeting data management service with user isolation
    """
    
    def __init__(self):
        # Pagination defaults
        self.default_page_size = 20
        self.max_page_size = 100
        
        # Meeting configuration
        self.default_meeting_duration = timedelta(hours=2)
        self.max_meeting_name_length = 200
        
        logger.info("MeetingService initialized")
    
    async def create_meeting(
        self,
        user_id: str,
        meeting_data: Dict[str, Any],
        db: AsyncSession = None
    ) -> Meeting:
        """
        Create a new meeting with user isolation
        
        Args:
            user_id: ID of the user creating the meeting
            meeting_data: Dictionary containing meeting information
            db: Database session (optional)
            
        Returns:
            Created Meeting object
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Validate user exists and is active
            user = await self._validate_user(user_id, db)
            
            # Validate and prepare meeting data
            validated_data = self._validate_meeting_data(meeting_data)
            
            # Create meeting with user isolation
            meeting = Meeting(
                user_id=user_id,
                name=validated_data["name"],
                description=validated_data.get("description"),
                meeting_date=validated_data.get("meeting_date"),
                duration_minutes=validated_data.get("duration_minutes", 120),
                status=validated_data.get("status", "scheduled"),
                meeting_type=validated_data.get("meeting_type", "general"),
                participants=validated_data.get("participants", []),
                metadata=validated_data.get("metadata", {}),
                processing_status="pending",
                is_archived=False
            )
            
            db.add(meeting)
            await db.commit()
            await db.refresh(meeting)
            
            logger.info(f"MEETING_CREATED: {meeting.id} for user {user_id}")
            
            # Send WebSocket notification for meeting creation
            try:
                meeting_data = {
                    "id": meeting.id,
                    "name": meeting.name,
                    "description": meeting.description,
                    "status": meeting.status,
                    "processing_status": meeting.processing_status,
                    "created_at": meeting.created_at.isoformat(),
                    "participants": meeting.participants
                }
                await websocket_service.notify_meeting_created(user_id, meeting_data)
            except Exception as ws_error:
                logger.warning(f"Failed to send WebSocket notification for meeting creation {meeting.id}: {ws_error}")
            
            return meeting
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to create meeting for user {user_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to create meeting: {str(e)}"
            )
        finally:
            if should_close_db:
                await db.close()
    
    async def get_meeting(
        self,
        meeting_id: str,
        user_id: str,
        include_transcripts: bool = False,
        include_processing_jobs: bool = False,
        db: AsyncSession = None
    ) -> Optional[Meeting]:
        """
        Get a specific meeting with user isolation
        
        Args:
            meeting_id: ID of the meeting to retrieve
            user_id: ID of the user requesting the meeting
            include_transcripts: Whether to include transcript data
            include_processing_jobs: Whether to include processing job data
            db: Database session (optional)
            
        Returns:
            Meeting object if found and user has access, None otherwise
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Build query with user isolation
            query = select(Meeting).where(
                and_(
                    Meeting.id == meeting_id,
                    Meeting.user_id == user_id
                )
            )
            
            # Add optional relationships
            if include_transcripts:
                query = query.options(selectinload(Meeting.transcripts))
            
            if include_processing_jobs:
                query = query.options(selectinload(Meeting.processing_jobs))
            
            result = await db.execute(query)
            meeting = result.scalar_one_or_none()
            
            if meeting:
                logger.debug(f"MEETING_RETRIEVED: {meeting_id} for user {user_id}")
            else:
                logger.warning(f"MEETING_NOT_FOUND: {meeting_id} for user {user_id}")
            
            return meeting
            
        except Exception as e:
            logger.error(f"Failed to get meeting {meeting_id} for user {user_id}: {str(e)}")
            return None
        finally:
            if should_close_db:
                await db.close()
    
    async def get_user_meetings(
        self,
        user_id: str,
        filters: Optional[Dict[str, Any]] = None,
        page: int = 1,
        page_size: int = None,
        sort_by: str = "updated_at",
        sort_order: str = "desc",
        db: AsyncSession = None
    ) -> Dict[str, Any]:
        """
        Get meetings for a user with filtering, pagination, and sorting
        
        Args:
            user_id: ID of the user
            filters: Optional filters to apply
            page: Page number (1-based)
            page_size: Number of items per page
            sort_by: Field to sort by
            sort_order: Sort order (asc/desc)
            db: Database session (optional)
            
        Returns:
            Dictionary containing meetings, pagination info, and metadata
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Validate pagination
            page = max(1, page)
            page_size = min(page_size or self.default_page_size, self.max_page_size)
            offset = (page - 1) * page_size
            
            # Build base query with user isolation
            base_conditions = [Meeting.user_id == user_id]
            
            # Apply filters
            if filters:
                base_conditions.extend(self._build_filter_conditions(filters))
            
            # Build count query
            count_query = select(func.count(Meeting.id)).where(and_(*base_conditions))
            total_result = await db.execute(count_query)
            total_count = total_result.scalar()
            
            # Build main query
            query = select(Meeting).where(and_(*base_conditions))
            
            # Apply sorting
            query = self._apply_sorting(query, sort_by, sort_order)
            
            # Apply pagination
            query = query.offset(offset).limit(page_size)
            
            # Execute query
            result = await db.execute(query)
            meetings = result.scalars().all()
            
            # Calculate pagination metadata
            total_pages = (total_count + page_size - 1) // page_size
            has_next = page < total_pages
            has_prev = page > 1
            
            logger.info(f"MEETINGS_RETRIEVED: {len(meetings)}/{total_count} for user {user_id}")
            
            return {
                "meetings": meetings,
                "pagination": {
                    "current_page": page,
                    "page_size": page_size,
                    "total_count": total_count,
                    "total_pages": total_pages,
                    "has_next": has_next,
                    "has_prev": has_prev,
                    "next_page": page + 1 if has_next else None,
                    "prev_page": page - 1 if has_prev else None
                },
                "filters_applied": filters or {},
                "sort": {
                    "sort_by": sort_by,
                    "sort_order": sort_order
                }
            }
            
        except Exception as e:
            logger.error(f"Failed to get meetings for user {user_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to retrieve meetings: {str(e)}"
            )
        finally:
            if should_close_db:
                await db.close()
    
    async def update_meeting(
        self,
        meeting_id: str,
        user_id: str,
        update_data: Dict[str, Any],
        db: AsyncSession = None
    ) -> Optional[Meeting]:
        """
        Update a meeting with user isolation
        
        Args:
            meeting_id: ID of the meeting to update
            user_id: ID of the user updating the meeting
            update_data: Dictionary containing fields to update
            db: Database session (optional)
            
        Returns:
            Updated Meeting object if successful, None otherwise
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Get meeting with user isolation
            meeting = await self.get_meeting(meeting_id, user_id, db=db)
            
            if not meeting:
                logger.warning(f"MEETING_UPDATE_FAILED: Meeting {meeting_id} not found for user {user_id}")
                return None
            
            # Validate update data
            validated_data = self._validate_meeting_update_data(update_data)
            
            # Apply updates
            for field, value in validated_data.items():
                if hasattr(meeting, field):
                    setattr(meeting, field, value)
            
            meeting.updated_at = datetime.utcnow()
            
            await db.commit()
            await db.refresh(meeting)
            
            logger.info(f"MEETING_UPDATED: {meeting_id} for user {user_id}")
            
            # Send WebSocket notification for meeting update
            try:
                meeting_data = {
                    "id": meeting.id,
                    "name": meeting.name,
                    "description": meeting.description,
                    "status": meeting.status,
                    "processing_status": meeting.processing_status,
                    "updated_at": meeting.updated_at.isoformat(),
                    "participants": meeting.participants
                }
                await websocket_service.notify_meeting_updated(user_id, meeting_data)
            except Exception as ws_error:
                logger.warning(f"Failed to send WebSocket notification for meeting update {meeting_id}: {ws_error}")
            
            return meeting
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to update meeting {meeting_id} for user {user_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to update meeting: {str(e)}"
            )
        finally:
            if should_close_db:
                await db.close()
    
    async def delete_meeting(
        self,
        meeting_id: str,
        user_id: str,
        soft_delete: bool = True,
        db: AsyncSession = None
    ) -> bool:
        """
        Delete a meeting with user isolation
        
        Args:
            meeting_id: ID of the meeting to delete
            user_id: ID of the user deleting the meeting
            soft_delete: Whether to use soft delete (archive) or hard delete
            db: Database session (optional)
            
        Returns:
            True if deletion successful, False otherwise
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Get meeting with user isolation
            meeting = await self.get_meeting(meeting_id, user_id, db=db)
            
            if not meeting:
                logger.warning(f"MEETING_DELETE_FAILED: Meeting {meeting_id} not found for user {user_id}")
                return False
            
            if soft_delete:
                # Soft delete - mark as archived
                meeting.is_archived = True
                meeting.updated_at = datetime.utcnow()
                await db.commit()
                
                logger.info(f"MEETING_ARCHIVED: {meeting_id} for user {user_id}")
            else:
                # Hard delete - remove related data first
                await self._delete_meeting_dependencies(meeting_id, db)
                
                # Delete the meeting
                await db.delete(meeting)
                await db.commit()
                
                logger.info(f"MEETING_DELETED: {meeting_id} for user {user_id}")
            
            return True
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to delete meeting {meeting_id} for user {user_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to delete meeting: {str(e)}"
            )
        finally:
            if should_close_db:
                await db.close()
    
    async def restore_meeting(
        self,
        meeting_id: str,
        user_id: str,
        db: AsyncSession = None
    ) -> Optional[Meeting]:
        """
        Restore an archived meeting
        
        Args:
            meeting_id: ID of the meeting to restore
            user_id: ID of the user restoring the meeting
            db: Database session (optional)
            
        Returns:
            Restored Meeting object if successful, None otherwise
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Get archived meeting with user isolation
            query = select(Meeting).where(
                and_(
                    Meeting.id == meeting_id,
                    Meeting.user_id == user_id,
                    Meeting.is_archived == True
                )
            )
            
            result = await db.execute(query)
            meeting = result.scalar_one_or_none()
            
            if not meeting:
                logger.warning(f"MEETING_RESTORE_FAILED: Archived meeting {meeting_id} not found for user {user_id}")
                return None
            
            meeting.is_archived = False
            meeting.updated_at = datetime.utcnow()
            
            await db.commit()
            await db.refresh(meeting)
            
            logger.info(f"MEETING_RESTORED: {meeting_id} for user {user_id}")
            
            return meeting
            
        except Exception as e:
            await db.rollback()
            logger.error(f"Failed to restore meeting {meeting_id} for user {user_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to restore meeting: {str(e)}"
            )
        finally:
            if should_close_db:
                await db.close()
    
    async def get_meeting_statistics(
        self,
        user_id: str,
        time_range: Optional[Tuple[datetime, datetime]] = None,
        db: AsyncSession = None
    ) -> Dict[str, Any]:
        """
        Get meeting statistics for a user
        
        Args:
            user_id: ID of the user
            time_range: Optional tuple of (start_date, end_date)
            db: Database session (optional)
            
        Returns:
            Dictionary containing meeting statistics
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Base conditions
            conditions = [Meeting.user_id == user_id, Meeting.is_archived == False]
            
            # Apply time range filter if provided
            if time_range:
                start_date, end_date = time_range
                conditions.append(Meeting.created_at.between(start_date, end_date))
            
            # Count queries
            total_meetings_query = select(func.count(Meeting.id)).where(and_(*conditions))
            completed_meetings_query = select(func.count(Meeting.id)).where(
                and_(Meeting.processing_status == "completed", *conditions)
            )
            
            # Status distribution
            status_query = select(
                Meeting.status,
                func.count(Meeting.id).label('count')
            ).where(and_(*conditions)).group_by(Meeting.status)
            
            # Processing status distribution
            processing_status_query = select(
                Meeting.processing_status,
                func.count(Meeting.id).label('count')
            ).where(and_(*conditions)).group_by(Meeting.processing_status)
            
            # Execute queries
            total_result = await db.execute(total_meetings_query)
            total_meetings = total_result.scalar()
            
            completed_result = await db.execute(completed_meetings_query)
            completed_meetings = completed_result.scalar()
            
            status_result = await db.execute(status_query)
            status_distribution = {row.status: row.count for row in status_result}
            
            processing_result = await db.execute(processing_status_query)
            processing_distribution = {row.processing_status: row.count for row in processing_result}
            
            # Calculate additional metrics
            completion_rate = (completed_meetings / total_meetings * 100) if total_meetings > 0 else 0
            
            statistics = {
                "total_meetings": total_meetings,
                "completed_meetings": completed_meetings,
                "completion_rate": round(completion_rate, 2),
                "status_distribution": status_distribution,
                "processing_distribution": processing_distribution,
                "time_range": {
                    "start_date": time_range[0].isoformat() if time_range else None,
                    "end_date": time_range[1].isoformat() if time_range else None
                }
            }
            
            logger.info(f"MEETING_STATISTICS: Generated for user {user_id}")
            
            return statistics
            
        except Exception as e:
            logger.error(f"Failed to get meeting statistics for user {user_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to generate statistics: {str(e)}"
            )
        finally:
            if should_close_db:
                await db.close()
    
    # Private helper methods
    
    async def _validate_user(self, user_id: str, db: AsyncSession) -> User:
        """Validate user exists and is active"""
        query = select(User).where(and_(User.id == user_id, User.is_active == True))
        result = await db.execute(query)
        user = result.scalar_one_or_none()
        
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found or inactive"
            )
        
        return user
    
    def _validate_meeting_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate and clean meeting creation data"""
        validated = {}
        
        # Required fields
        if not data.get("name") or not data["name"].strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Meeting name is required"
            )
        
        validated["name"] = data["name"].strip()[:self.max_meeting_name_length]
        
        # Optional fields with validation
        if "description" in data and data["description"]:
            validated["description"] = data["description"].strip()
        
        if "meeting_date" in data:
            if isinstance(data["meeting_date"], str):
                try:
                    validated["meeting_date"] = datetime.fromisoformat(data["meeting_date"])
                except ValueError:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Invalid meeting date format"
                    )
            elif isinstance(data["meeting_date"], datetime):
                validated["meeting_date"] = data["meeting_date"]
        
        if "duration_minutes" in data:
            duration = data["duration_minutes"]
            if not isinstance(duration, int) or duration <= 0 or duration > 720:  # Max 12 hours
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Duration must be between 1 and 720 minutes"
                )
            validated["duration_minutes"] = duration
        
        # Validate status
        allowed_statuses = ["scheduled", "in_progress", "completed", "cancelled"]
        if "status" in data:
            if data["status"] not in allowed_statuses:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Status must be one of: {', '.join(allowed_statuses)}"
                )
            validated["status"] = data["status"]
        
        # Validate meeting type
        allowed_types = ["general", "standup", "interview", "presentation", "workshop"]
        if "meeting_type" in data:
            if data["meeting_type"] not in allowed_types:
                validated["meeting_type"] = "general"  # Default fallback
            else:
                validated["meeting_type"] = data["meeting_type"]
        
        # Handle participants list
        if "participants" in data and isinstance(data["participants"], list):
            validated["participants"] = [str(p).strip() for p in data["participants"] if p]
        
        # Handle metadata
        if "metadata" in data and isinstance(data["metadata"], dict):
            validated["metadata"] = data["metadata"]
        
        return validated
    
    def _validate_meeting_update_data(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Validate meeting update data"""
        validated = {}
        
        # Updatable fields
        updatable_fields = {
            "name", "description", "meeting_date", "duration_minutes", 
            "status", "meeting_type", "participants", "metadata"
        }
        
        for field, value in data.items():
            if field in updatable_fields and value is not None:
                if field == "name":
                    if not value.strip():
                        raise HTTPException(
                            status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Meeting name cannot be empty"
                        )
                    validated[field] = value.strip()[:self.max_meeting_name_length]
                elif field == "meeting_date":
                    if isinstance(value, str):
                        try:
                            validated[field] = datetime.fromisoformat(value)
                        except ValueError:
                            raise HTTPException(
                                status_code=status.HTTP_400_BAD_REQUEST,
                                detail="Invalid meeting date format"
                            )
                    elif isinstance(value, datetime):
                        validated[field] = value
                else:
                    validated[field] = value
        
        return validated
    
    def _build_filter_conditions(self, filters: Dict[str, Any]) -> List:
        """Build SQLAlchemy filter conditions from filter dictionary"""
        conditions = []
        
        # Status filter
        if "status" in filters:
            status_values = filters["status"]
            if isinstance(status_values, str):
                status_values = [status_values]
            conditions.append(Meeting.status.in_(status_values))
        
        # Processing status filter
        if "processing_status" in filters:
            processing_values = filters["processing_status"]
            if isinstance(processing_values, str):
                processing_values = [processing_values]
            conditions.append(Meeting.processing_status.in_(processing_values))
        
        # Date range filter
        if "date_range" in filters:
            date_range = filters["date_range"]
            if "start_date" in date_range:
                start_date = datetime.fromisoformat(date_range["start_date"])
                conditions.append(Meeting.created_at >= start_date)
            if "end_date" in date_range:
                end_date = datetime.fromisoformat(date_range["end_date"])
                conditions.append(Meeting.created_at <= end_date)
        
        # Meeting type filter
        if "meeting_type" in filters:
            meeting_types = filters["meeting_type"]
            if isinstance(meeting_types, str):
                meeting_types = [meeting_types]
            conditions.append(Meeting.meeting_type.in_(meeting_types))
        
        # Search filter (name or description)
        if "search" in filters and filters["search"]:
            search_term = f"%{filters['search']}%"
            conditions.append(
                or_(
                    Meeting.name.ilike(search_term),
                    Meeting.description.ilike(search_term)
                )
            )
        
        # Archived filter (default is non-archived)
        if "include_archived" not in filters or not filters["include_archived"]:
            conditions.append(Meeting.is_archived == False)
        
        return conditions
    
    def _apply_sorting(self, query, sort_by: str, sort_order: str):
        """Apply sorting to query"""
        # Map sort fields to model attributes
        sort_fields = {
            "name": Meeting.name,
            "created_at": Meeting.created_at,
            "updated_at": Meeting.updated_at,
            "meeting_date": Meeting.meeting_date,
            "status": Meeting.status,
            "processing_status": Meeting.processing_status
        }
        
        if sort_by not in sort_fields:
            sort_by = "updated_at"  # Default fallback
        
        sort_field = sort_fields[sort_by]
        
        if sort_order.lower() == "asc":
            return query.order_by(asc(sort_field))
        else:
            return query.order_by(desc(sort_field))
    
    async def _delete_meeting_dependencies(self, meeting_id: str, db: AsyncSession):
        """Delete related data before hard deleting meeting"""
        try:
            # Delete transcripts
            await db.execute(delete(Transcript).where(Transcript.meeting_id == meeting_id))
            
            # Delete processing jobs
            await db.execute(delete(ProcessingJob).where(ProcessingJob.meeting_id == meeting_id))
            
            logger.debug(f"MEETING_DEPENDENCIES_DELETED: {meeting_id}")
            
        except Exception as e:
            logger.error(f"Failed to delete meeting dependencies: {str(e)}")
            raise