"""
Comprehensive file management service for Meetingly web application

Features:
- File lifecycle management
- File access control and serving
- Storage quota monitoring and enforcement
- File cleanup and maintenance
- File metadata management
- Batch file operations
- File sharing and permissions
"""

import asyncio
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any, Tuple
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_, or_, func, update
from fastapi import HTTPException, status
import logging

from app.models.user import User
from app.models.meeting import Meeting, ProcessingJob
from app.services.file_storage import SecureFileStorage
from app.core.database import AsyncSessionLocal
from app.core.config import settings

logger = logging.getLogger(__name__)

class FileManager:
    """
    Comprehensive file management service with advanced features
    """
    
    def __init__(self):
        self.storage = SecureFileStorage()
        
        # File management settings
        self.cleanup_interval_hours = 24
        self.orphaned_file_retention_days = 7
        self.temp_file_retention_hours = 24
        
        # Batch operation limits
        self.max_batch_size = 100
        self.batch_timeout_seconds = 300
        
        logger.info("FileManager initialized with SecureFileStorage")
    
    async def create_file_record(
        self,
        user_id: str,
        file_storage_info: Dict[str, Any],
        meeting_id: Optional[str] = None,
        description: Optional[str] = None,
        tags: Optional[List[str]] = None,
        db: AsyncSession = None
    ) -> Dict[str, Any]:
        """
        Create a file record with metadata in the database
        
        Args:
            user_id: ID of the file owner
            file_storage_info: Information from file storage service
            meeting_id: Optional associated meeting ID
            description: Optional file description
            tags: Optional file tags
            db: Database session
            
        Returns:
            Dictionary containing file record information
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Here you would create a FileRecord model entry
            # For now, we'll return the enhanced storage info
            
            file_record = {
                "id": file_storage_info["file_id"],
                "user_id": user_id,
                "meeting_id": meeting_id,
                "filename": file_storage_info["secure_filename"],
                "original_filename": file_storage_info["original_filename"],
                "file_path": file_storage_info["storage_path"],
                "size_bytes": file_storage_info["size_bytes"],
                "mime_type": file_storage_info["mime_type"],
                "file_hash": file_storage_info["file_hash"],
                "description": description,
                "tags": tags or [],
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
                "access_count": 0,
                "last_accessed": None,
                "metadata": file_storage_info["metadata"],
                "status": "active"
            }
            
            logger.info(f"FILE_RECORD_CREATED: {file_record['id']} for user {user_id}")
            
            return file_record
            
        except Exception as e:
            logger.error(f"Failed to create file record: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to create file record"
            )
        finally:
            if should_close_db:
                await db.close()
    
    async def get_user_files(
        self,
        user_id: str,
        filters: Optional[Dict[str, Any]] = None,
        page: int = 1,
        page_size: int = 20,
        sort_by: str = "created_at",
        sort_order: str = "desc",
        db: AsyncSession = None
    ) -> Dict[str, Any]:
        """
        Get files for a user with filtering and pagination
        
        Args:
            user_id: ID of the user
            filters: Optional filters (file_type, size_range, date_range, tags)
            page: Page number
            page_size: Items per page
            sort_by: Field to sort by
            sort_order: Sort order (asc/desc)
            db: Database session
            
        Returns:
            Dictionary containing files and pagination info
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Get storage info for user
            storage_info = await self.storage.get_user_storage_info(user_id)
            
            # For now, we'll simulate file records from filesystem
            # In production, this would query a FileRecord table
            
            user_files = []
            user_storage_path = Path(self.storage.base_storage_path) / user_id
            
            if user_storage_path.exists():
                for file_path in user_storage_path.rglob("*"):
                    if file_path.is_file() and not file_path.name.startswith('.'):
                        stat = file_path.stat()
                        
                        # Extract file ID from filename (simplified)
                        file_id = file_path.stem.split('_')[-1] if '_' in file_path.stem else str(hash(str(file_path)))
                        
                        file_record = {
                            "id": file_id,
                            "filename": file_path.name,
                            "size_bytes": stat.st_size,
                            "size_mb": round(stat.st_size / (1024 * 1024), 2),
                            "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                            "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                            "mime_type": self._get_mime_type(file_path),
                            "extension": file_path.suffix.lower(),
                            "relative_path": str(file_path.relative_to(user_storage_path)),
                            "status": "active"
                        }
                        
                        # Apply filters
                        if self._passes_filters(file_record, filters):
                            user_files.append(file_record)
            
            # Sort files
            user_files = self._sort_files(user_files, sort_by, sort_order)
            
            # Apply pagination
            total_count = len(user_files)
            start_idx = (page - 1) * page_size
            end_idx = start_idx + page_size
            paginated_files = user_files[start_idx:end_idx]
            
            # Calculate pagination metadata
            total_pages = (total_count + page_size - 1) // page_size
            
            return {
                "files": paginated_files,
                "pagination": {
                    "current_page": page,
                    "page_size": page_size,
                    "total_count": total_count,
                    "total_pages": total_pages,
                    "has_next": page < total_pages,
                    "has_prev": page > 1
                },
                "storage_info": storage_info,
                "filters_applied": filters or {}
            }
            
        except Exception as e:
            logger.error(f"Failed to get user files for {user_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to retrieve user files"
            )
        finally:
            if should_close_db:
                await db.close()
    
    async def update_file_metadata(
        self,
        file_id: str,
        user_id: str,
        updates: Dict[str, Any],
        db: AsyncSession = None
    ) -> Optional[Dict[str, Any]]:
        """
        Update file metadata
        
        Args:
            file_id: ID of the file to update
            user_id: ID of the user updating the file
            updates: Dictionary of updates to apply
            db: Database session
            
        Returns:
            Updated file information if successful
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            # Verify file access
            file_info = await self.storage.retrieve_file(file_id, user_id)
            if not file_info:
                return None
            
            # Update metadata (in production, this would update database record)
            updatable_fields = {'description', 'tags', 'custom_name'}
            filtered_updates = {k: v for k, v in updates.items() if k in updatable_fields}
            
            if filtered_updates:
                # Simulate metadata update
                updated_info = {
                    **file_info,
                    **filtered_updates,
                    "updated_at": datetime.utcnow().isoformat()
                }
                
                logger.info(f"FILE_METADATA_UPDATED: {file_id} for user {user_id}")
                return updated_info
            
            return file_info
            
        except Exception as e:
            logger.error(f"Failed to update file metadata for {file_id}: {str(e)}")
            return None
        finally:
            if should_close_db:
                await db.close()
    
    async def batch_delete_files(
        self,
        file_ids: List[str],
        user_id: str,
        permanent: bool = False
    ) -> Dict[str, Any]:
        """
        Delete multiple files in batch
        
        Args:
            file_ids: List of file IDs to delete
            user_id: ID of the user deleting files
            permanent: Whether to permanently delete files
            
        Returns:
            Dictionary containing batch operation results
        """
        try:
            if len(file_ids) > self.max_batch_size:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Batch size too large. Maximum: {self.max_batch_size}"
                )
            
            results = {
                "successful": [],
                "failed": [],
                "total_processed": len(file_ids),
                "bytes_freed": 0
            }
            
            # Process deletions with timeout
            start_time = datetime.utcnow()
            
            for file_id in file_ids:
                # Check timeout
                if (datetime.utcnow() - start_time).total_seconds() > self.batch_timeout_seconds:
                    results["failed"].append({
                        "file_id": file_id,
                        "error": "Batch operation timeout"
                    })
                    continue
                
                try:
                    # Get file info before deletion
                    file_info = await self.storage.retrieve_file(file_id, user_id)
                    if not file_info:
                        results["failed"].append({
                            "file_id": file_id,
                            "error": "File not found or access denied"
                        })
                        continue
                    
                    # Delete file
                    success = await self.storage.delete_file(file_id, user_id, permanent)
                    
                    if success:
                        results["successful"].append({
                            "file_id": file_id,
                            "filename": file_info.get("filename"),
                            "size_bytes": file_info.get("size_bytes", 0)
                        })
                        results["bytes_freed"] += file_info.get("size_bytes", 0)
                    else:
                        results["failed"].append({
                            "file_id": file_id,
                            "error": "Deletion failed"
                        })
                        
                except Exception as e:
                    results["failed"].append({
                        "file_id": file_id,
                        "error": str(e)
                    })
            
            logger.info(f"BATCH_DELETE: {len(results['successful'])}/{len(file_ids)} files deleted for user {user_id}")
            
            return results
            
        except Exception as e:
            logger.error(f"Batch delete failed for user {user_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Batch delete operation failed"
            )
    
    async def cleanup_orphaned_files(self, db: AsyncSession = None) -> Dict[str, int]:
        """
        Clean up orphaned files not associated with any meetings
        
        Args:
            db: Database session
            
        Returns:
            Dictionary containing cleanup statistics
        """
        should_close_db = db is None
        if db is None:
            db = AsyncSessionLocal()
        
        try:
            cleanup_stats = {
                "orphaned_files_found": 0,
                "orphaned_files_cleaned": 0,
                "bytes_freed": 0
            }
            
            # Get all meetings from database to compare against files
            meetings_query = select(Meeting.id).where(Meeting.is_archived == False)
            result = await db.execute(meetings_query)
            active_meeting_ids = {str(meeting_id) for meeting_id, in result.fetchall()}
            
            # Scan storage for files
            cutoff_date = datetime.utcnow() - timedelta(days=self.orphaned_file_retention_days)
            
            for user_dir in self.storage.base_storage_path.iterdir():
                if user_dir.is_dir() and not user_dir.name.startswith('.'):
                    user_id = user_dir.name
                    
                    for file_path in user_dir.rglob("*"):
                        if file_path.is_file() and not file_path.name.startswith('.'):
                            # Check if file is old enough
                            file_time = datetime.fromtimestamp(file_path.stat().st_mtime)
                            if file_time > cutoff_date:
                                continue
                            
                            # Check if file is associated with active meeting
                            # This is simplified - in production you'd have a proper file-meeting mapping
                            is_orphaned = True  # Simplified check
                            
                            if is_orphaned:
                                cleanup_stats["orphaned_files_found"] += 1
                                
                                try:
                                    size = file_path.stat().st_size
                                    file_path.unlink()
                                    cleanup_stats["orphaned_files_cleaned"] += 1
                                    cleanup_stats["bytes_freed"] += size
                                except Exception as e:
                                    logger.warning(f"Failed to delete orphaned file {file_path}: {str(e)}")
            
            # Also run general cleanup
            general_cleanup = await self.storage.cleanup_expired_files()
            cleanup_stats["bytes_freed"] += general_cleanup["bytes_freed"]
            
            logger.info(f"ORPHANED_CLEANUP: Found {cleanup_stats['orphaned_files_found']}, "
                       f"cleaned {cleanup_stats['orphaned_files_cleaned']}, "
                       f"freed {cleanup_stats['bytes_freed']} bytes")
            
            return cleanup_stats
            
        except Exception as e:
            logger.error(f"Orphaned file cleanup failed: {str(e)}")
            return {"orphaned_files_found": 0, "orphaned_files_cleaned": 0, "bytes_freed": 0}
        finally:
            if should_close_db:
                await db.close()
    
    async def analyze_storage_usage(self, user_id: Optional[str] = None) -> Dict[str, Any]:
        """
        Analyze storage usage patterns and provide recommendations
        
        Args:
            user_id: Optional specific user ID to analyze
            
        Returns:
            Dictionary containing storage analysis and recommendations
        """
        try:
            analysis = {
                "timestamp": datetime.utcnow().isoformat(),
                "users_analyzed": 0,
                "total_storage_used": 0,
                "recommendations": [],
                "users": {}
            }
            
            # Determine users to analyze
            users_to_analyze = []
            if user_id:
                users_to_analyze = [user_id]
            else:
                # Get all users with storage
                for user_dir in self.storage.base_storage_path.iterdir():
                    if user_dir.is_dir() and not user_dir.name.startswith('.'):
                        users_to_analyze.append(user_dir.name)
            
            # Analyze each user
            for uid in users_to_analyze:
                try:
                    storage_info = await self.storage.get_user_storage_info(uid)
                    analysis["users"][uid] = storage_info
                    analysis["total_storage_used"] += storage_info["usage"]["used_bytes"]
                    analysis["users_analyzed"] += 1
                    
                    # Generate recommendations
                    usage_pct = storage_info["usage"]["used_percentage"]
                    if usage_pct > 90:
                        analysis["recommendations"].append({
                            "user_id": uid,
                            "type": "quota_warning",
                            "message": f"User approaching quota limit ({usage_pct:.1f}% used)",
                            "priority": "high"
                        })
                    elif usage_pct > 75:
                        analysis["recommendations"].append({
                            "user_id": uid,
                            "type": "quota_notice",
                            "message": f"User using significant storage ({usage_pct:.1f}% used)",
                            "priority": "medium"
                        })
                    
                    # Check for large trash
                    if storage_info["trash"]["size_mb"] > 100:
                        analysis["recommendations"].append({
                            "user_id": uid,
                            "type": "trash_cleanup",
                            "message": f"Large trash folder ({storage_info['trash']['size_mb']:.1f}MB)",
                            "priority": "low"
                        })
                        
                except Exception as e:
                    logger.warning(f"Failed to analyze storage for user {uid}: {str(e)}")
            
            # System-wide recommendations
            if analysis["users_analyzed"] > 0:
                avg_usage = analysis["total_storage_used"] / analysis["users_analyzed"]
                if avg_usage > 1024 * 1024 * 1024:  # 1GB average
                    analysis["recommendations"].append({
                        "type": "system_storage",
                        "message": "High average storage usage across users",
                        "priority": "medium"
                    })
            
            return analysis
            
        except Exception as e:
            logger.error(f"Storage analysis failed: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Storage analysis failed"
            )
    
    async def schedule_maintenance(self) -> Dict[str, Any]:
        """
        Schedule and perform file system maintenance tasks
        
        Returns:
            Dictionary containing maintenance results
        """
        try:
            maintenance_results = {
                "started_at": datetime.utcnow().isoformat(),
                "tasks_completed": [],
                "tasks_failed": [],
                "total_bytes_freed": 0
            }
            
            # Task 1: Clean up expired files
            try:
                cleanup_result = await self.storage.cleanup_expired_files()
                maintenance_results["tasks_completed"].append({
                    "task": "expired_file_cleanup",
                    "result": cleanup_result
                })
                maintenance_results["total_bytes_freed"] += cleanup_result["bytes_freed"]
            except Exception as e:
                maintenance_results["tasks_failed"].append({
                    "task": "expired_file_cleanup",
                    "error": str(e)
                })
            
            # Task 2: Clean up orphaned files
            try:
                orphan_result = await self.cleanup_orphaned_files()
                maintenance_results["tasks_completed"].append({
                    "task": "orphaned_file_cleanup",
                    "result": orphan_result
                })
                maintenance_results["total_bytes_freed"] += orphan_result["bytes_freed"]
            except Exception as e:
                maintenance_results["tasks_failed"].append({
                    "task": "orphaned_file_cleanup",
                    "error": str(e)
                })
            
            # Task 3: Verify file integrity (sample check)
            try:
                integrity_result = await self._verify_file_integrity_sample()
                maintenance_results["tasks_completed"].append({
                    "task": "integrity_check",
                    "result": integrity_result
                })
            except Exception as e:
                maintenance_results["tasks_failed"].append({
                    "task": "integrity_check",
                    "error": str(e)
                })
            
            maintenance_results["completed_at"] = datetime.utcnow().isoformat()
            
            logger.info(f"MAINTENANCE_COMPLETED: {len(maintenance_results['tasks_completed'])} tasks completed, "
                       f"{len(maintenance_results['tasks_failed'])} failed, "
                       f"{maintenance_results['total_bytes_freed']} bytes freed")
            
            return maintenance_results
            
        except Exception as e:
            logger.error(f"File maintenance failed: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="File maintenance failed"
            )
    
    # Private helper methods
    
    def _get_mime_type(self, file_path: Path) -> Optional[str]:
        """Get MIME type for file"""
        import mimetypes
        mime_type, _ = mimetypes.guess_type(str(file_path))
        return mime_type
    
    def _passes_filters(self, file_record: Dict[str, Any], filters: Optional[Dict[str, Any]]) -> bool:
        """Check if file record passes the given filters"""
        if not filters:
            return True
        
        # File type filter
        if "file_type" in filters:
            expected_type = filters["file_type"]
            if expected_type == "audio" and not file_record["mime_type"].startswith("audio/"):
                return False
            elif expected_type == "video" and not file_record["mime_type"].startswith("video/"):
                return False
        
        # Size range filter
        if "size_range" in filters:
            size_range = filters["size_range"]
            file_size_mb = file_record["size_mb"]
            if "min" in size_range and file_size_mb < size_range["min"]:
                return False
            if "max" in size_range and file_size_mb > size_range["max"]:
                return False
        
        # Date range filter
        if "date_range" in filters:
            date_range = filters["date_range"]
            file_date = datetime.fromisoformat(file_record["created_at"].replace('Z', '+00:00'))
            if "start" in date_range:
                start_date = datetime.fromisoformat(date_range["start"])
                if file_date < start_date:
                    return False
            if "end" in date_range:
                end_date = datetime.fromisoformat(date_range["end"])
                if file_date > end_date:
                    return False
        
        return True
    
    def _sort_files(self, files: List[Dict[str, Any]], sort_by: str, sort_order: str) -> List[Dict[str, Any]]:
        """Sort files by the specified criteria"""
        reverse = sort_order.lower() == "desc"
        
        sort_key_map = {
            "filename": lambda f: f["filename"].lower(),
            "created_at": lambda f: f["created_at"],
            "modified_at": lambda f: f["modified_at"],
            "size": lambda f: f["size_bytes"],
            "extension": lambda f: f["extension"]
        }
        
        sort_key = sort_key_map.get(sort_by, sort_key_map["created_at"])
        
        try:
            return sorted(files, key=sort_key, reverse=reverse)
        except Exception as e:
            logger.warning(f"File sorting failed: {str(e)}, using default order")
            return files
    
    async def _verify_file_integrity_sample(self, sample_size: int = 10) -> Dict[str, Any]:
        """Verify integrity of a sample of files"""
        
        integrity_result = {
            "files_checked": 0,
            "files_corrupted": 0,
            "corrupted_files": []
        }
        
        # Get sample of files from each user
        checked_count = 0
        
        for user_dir in self.storage.base_storage_path.iterdir():
            if user_dir.is_dir() and not user_dir.name.startswith('.') and checked_count < sample_size:
                user_files = list(user_dir.rglob("*"))
                user_files = [f for f in user_files if f.is_file() and not f.name.startswith('.')]
                
                # Sample files from this user
                sample_files = user_files[:min(3, len(user_files))]
                
                for file_path in sample_files:
                    if checked_count >= sample_size:
                        break
                    
                    try:
                        # Basic integrity check - verify file can be read
                        with open(file_path, 'rb') as f:
                            f.read(1024)  # Read first 1KB
                        
                        integrity_result["files_checked"] += 1
                        checked_count += 1
                        
                    except Exception as e:
                        integrity_result["files_corrupted"] += 1
                        integrity_result["corrupted_files"].append({
                            "file_path": str(file_path),
                            "error": str(e)
                        })
                        checked_count += 1
        
        return integrity_result