"""
File management API endpoints for Meetingly web application

Features:
- Secure file serving with access controls
- File metadata management
- Storage quota monitoring
- Batch file operations
- File cleanup and maintenance
- Storage analytics and reporting
"""

from fastapi import APIRouter, HTTPException, Depends, status, Query, Request, Header
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

from app.core.database import get_db
from app.middleware.auth import get_current_user_id, get_current_user
from app.models.user import User
from app.services.file_storage import SecureFileStorage
from app.services.file_manager import FileManager
import logging

logger = logging.getLogger(__name__)

router = APIRouter()
file_storage = SecureFileStorage()
file_manager = FileManager()

class FileMetadataUpdate(BaseModel):
    description: Optional[str] = Field(None, max_length=500, description="File description")
    tags: Optional[List[str]] = Field(None, description="File tags")
    custom_name: Optional[str] = Field(None, max_length=200, description="Custom display name")

class FileInfo(BaseModel):
    id: str
    filename: str
    original_filename: Optional[str]
    size_bytes: int
    size_mb: float
    mime_type: Optional[str]
    extension: str
    created_at: str
    modified_at: Optional[str]
    description: Optional[str]
    tags: List[str]
    status: str
    access_url: str

class FileListResponse(BaseModel):
    files: List[FileInfo]
    pagination: Dict[str, Any]
    storage_info: Dict[str, Any]
    filters_applied: Dict[str, Any]

class BatchDeleteRequest(BaseModel):
    file_ids: List[str] = Field(..., min_items=1, max_items=100, description="List of file IDs to delete")
    permanent: bool = Field(False, description="Whether to permanently delete files")

class BatchDeleteResponse(BaseModel):
    successful: List[Dict[str, Any]]
    failed: List[Dict[str, Any]]
    total_processed: int
    bytes_freed: int

class StorageInfo(BaseModel):
    user_id: str
    usage: Dict[str, Any]
    files: Dict[str, Any]
    trash: Dict[str, Any]
    storage_path: str
    last_calculated: str

class StorageAnalysis(BaseModel):
    timestamp: str
    users_analyzed: int
    total_storage_used: int
    recommendations: List[Dict[str, Any]]
    users: Dict[str, Any]

@router.get("/{file_id}")
async def serve_file(
    file_id: str,
    request: Request,
    range_header: Optional[str] = Header(None, alias="range"),
    user_id: str = Depends(get_current_user_id)
):
    """
    Serve a file with access control and range request support
    """
    try:
        # Check if file exists and user has access
        file_info = await file_storage.retrieve_file(file_id, user_id)
        
        if not file_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found or access denied"
            )
        
        # Serve file with range support
        return await file_storage.serve_file(file_id, user_id, range_header)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"File serving failed for {file_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="File serving failed"
        )

@router.get("/{file_id}/info")
async def get_file_info(
    file_id: str,
    user_id: str = Depends(get_current_user_id)
):
    """
    Get detailed information about a specific file
    """
    try:
        file_info = await file_storage.retrieve_file(file_id, user_id)
        
        if not file_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found or access denied"
            )
        
        return {
            "id": file_id,
            "filename": file_info["filename"],
            "size_bytes": file_info["size_bytes"],
            "size_mb": round(file_info["size_bytes"] / (1024 * 1024), 2),
            "mime_type": file_info["mime_type"],
            "extension": file_info["extension"],
            "created_at": file_info["created_at"],
            "modified_at": file_info["modified_at"],
            "accessed_at": file_info["accessed_at"],
            "owner_user_id": file_info["owner_user_id"],
            "access_url": f"/api/files/{file_id}"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get file info for {file_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get file information"
        )

@router.put("/{file_id}/metadata")
async def update_file_metadata(
    file_id: str,
    metadata_update: FileMetadataUpdate,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Update file metadata (description, tags, custom name)
    """
    try:
        updates = metadata_update.dict(exclude_unset=True)
        
        updated_info = await file_manager.update_file_metadata(
            file_id=file_id,
            user_id=user_id,
            updates=updates,
            db=db
        )
        
        if not updated_info:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found or access denied"
            )
        
        return {
            "success": True,
            "message": "File metadata updated successfully",
            "file_info": updated_info
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to update metadata for file {file_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to update file metadata"
        )

@router.delete("/{file_id}")
async def delete_file(
    file_id: str,
    permanent: bool = Query(False, description="Whether to permanently delete the file"),
    user_id: str = Depends(get_current_user_id)
):
    """
    Delete a file (soft delete by default, permanent if specified)
    """
    try:
        success = await file_storage.delete_file(
            file_id=file_id,
            user_id=user_id,
            permanent=permanent
        )
        
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found or access denied"
            )
        
        action = "permanently deleted" if permanent else "moved to trash"
        return {
            "success": True,
            "message": f"File {action} successfully",
            "file_id": file_id
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to delete file {file_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to delete file"
        )

@router.get("/", response_model=FileListResponse)
async def list_user_files(
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    sort_by: str = Query("created_at", description="Field to sort by"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="Sort order"),
    file_type: Optional[str] = Query(None, description="Filter by file type (audio, video)"),
    min_size_mb: Optional[float] = Query(None, ge=0, description="Minimum file size in MB"),
    max_size_mb: Optional[float] = Query(None, ge=0, description="Maximum file size in MB"),
    start_date: Optional[datetime] = Query(None, description="Filter files created after this date"),
    end_date: Optional[datetime] = Query(None, description="Filter files created before this date"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Get list of files for the current user with filtering and pagination
    """
    try:
        # Build filters
        filters = {}
        
        if file_type:
            filters["file_type"] = file_type
        
        if min_size_mb is not None or max_size_mb is not None:
            size_range = {}
            if min_size_mb is not None:
                size_range["min"] = min_size_mb
            if max_size_mb is not None:
                size_range["max"] = max_size_mb
            filters["size_range"] = size_range
        
        if start_date or end_date:
            date_range = {}
            if start_date:
                date_range["start"] = start_date.isoformat()
            if end_date:
                date_range["end"] = end_date.isoformat()
            filters["date_range"] = date_range
        
        # Get files using file manager
        result = await file_manager.get_user_files(
            user_id=user_id,
            filters=filters,
            page=page,
            page_size=page_size,
            sort_by=sort_by,
            sort_order=sort_order,
            db=db
        )
        
        # Convert to response format
        file_infos = [
            FileInfo(
                id=file["id"],
                filename=file["filename"],
                original_filename=file.get("original_filename"),
                size_bytes=file["size_bytes"],
                size_mb=file["size_mb"],
                mime_type=file["mime_type"],
                extension=file["extension"],
                created_at=file["created_at"],
                modified_at=file.get("modified_at"),
                description=file.get("description"),
                tags=file.get("tags", []),
                status=file["status"],
                access_url=f"/api/files/{file['id']}"
            )
            for file in result["files"]
        ]
        
        return FileListResponse(
            files=file_infos,
            pagination=result["pagination"],
            storage_info=result["storage_info"],
            filters_applied=result["filters_applied"]
        )
        
    except Exception as e:
        logger.error(f"Failed to list files for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to retrieve file list"
        )

@router.post("/batch-delete", response_model=BatchDeleteResponse)
async def batch_delete_files(
    delete_request: BatchDeleteRequest,
    user_id: str = Depends(get_current_user_id)
):
    """
    Delete multiple files in a batch operation
    """
    try:
        result = await file_manager.batch_delete_files(
            file_ids=delete_request.file_ids,
            user_id=user_id,
            permanent=delete_request.permanent
        )
        
        return BatchDeleteResponse(**result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch delete failed for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Batch delete operation failed"
        )

@router.get("/storage/info", response_model=StorageInfo)
async def get_storage_info(
    user_id: str = Depends(get_current_user_id)
):
    """
    Get comprehensive storage information for the current user
    """
    try:
        storage_info = await file_storage.get_user_storage_info(user_id)
        
        return StorageInfo(**storage_info)
        
    except Exception as e:
        logger.error(f"Failed to get storage info for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get storage information"
        )

@router.get("/storage/analysis", response_model=StorageAnalysis)
async def get_storage_analysis(
    user_id: str = Depends(get_current_user_id),
    current_user: User = Depends(get_current_user)
):
    """
    Get storage usage analysis and recommendations
    (Admin users can see system-wide analysis)
    """
    try:
        # For now, only analyze current user
        # In production, you might have admin roles that can see system-wide analysis
        analysis = await file_manager.analyze_storage_usage(user_id=user_id)
        
        return StorageAnalysis(**analysis)
        
    except Exception as e:
        logger.error(f"Storage analysis failed for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Storage analysis failed"
        )

@router.post("/maintenance/cleanup")
async def cleanup_files(
    user_id: str = Depends(get_current_user_id),
    current_user: User = Depends(get_current_user)
):
    """
    Trigger file cleanup for the current user
    """
    try:
        # Run cleanup for user's files
        cleanup_result = await file_storage.cleanup_expired_files()
        
        return {
            "success": True,
            "message": "File cleanup completed",
            "cleanup_stats": cleanup_result
        }
        
    except Exception as e:
        logger.error(f"File cleanup failed for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="File cleanup failed"
        )

@router.post("/maintenance/schedule")
async def schedule_maintenance(
    current_user: User = Depends(get_current_user)
):
    """
    Schedule comprehensive file system maintenance
    (May require admin privileges in production)
    """
    try:
        maintenance_result = await file_manager.schedule_maintenance()
        
        return {
            "success": True,
            "message": "File maintenance completed",
            "maintenance_stats": maintenance_result
        }
        
    except Exception as e:
        logger.error(f"File maintenance failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="File maintenance failed"
        )

@router.get("/formats/supported")
async def get_supported_formats():
    """
    Get information about supported file formats and limits
    """
    try:
        return {
            "supported_extensions": list(file_storage.allowed_audio_extensions),
            "supported_mime_types": list(file_storage.allowed_mime_types),
            "max_file_size_bytes": file_storage.max_file_size,
            "max_file_size_mb": file_storage.max_file_size / (1024 * 1024),
            "default_quota_gb": file_storage.default_quota_gb,
            "max_quota_gb": file_storage.max_quota_gb,
            "features": {
                "range_requests": True,
                "batch_operations": True,
                "soft_delete": True,
                "virus_scanning": file_storage.enable_virus_scanning,
                "content_scanning": file_storage.enable_content_scanning
            }
        }
        
    except Exception as e:
        logger.error(f"Failed to get supported formats: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get format information"
        )