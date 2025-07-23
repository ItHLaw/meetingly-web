"""
Data Migration API Endpoints

Provides REST API endpoints for data migration, export, import, and cleanup operations.
These endpoints allow users to manage their data migration from desktop to web application.
"""

from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, Query, status
from fastapi.responses import JSONResponse, FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import json
import tempfile
import os
from datetime import datetime

from app.core.database import get_db
from app.middleware.auth import get_current_user_id, get_current_user
from app.models.user import User
from app.migration.desktop_migrator import DesktopDataMigrator, DataExportService, DataImportService, DataCleanupService
import logging

logger = logging.getLogger(__name__)

router = APIRouter()

class MigrationRequest(BaseModel):
    sqlite_file_path: str = Field(..., description="Path to desktop SQLite database file")
    include_settings: bool = Field(True, description="Include user settings in migration")

class MigrationResponse(BaseModel):
    success: bool
    message: str
    statistics: Dict[str, Any]
    errors: List[str] = []

class ExportRequest(BaseModel):
    format: str = Field("json", description="Export format")
    include_transcripts: bool = Field(True, description="Include transcript data")
    include_model_configs: bool = Field(True, description="Include model configurations")

class ImportRequest(BaseModel):
    merge_strategy: str = Field("skip_existing", description="How to handle existing data")
    format: str = Field("json", description="Import data format")

class CleanupRequest(BaseModel):
    older_than_days: Optional[int] = Field(None, description="Only delete data older than N days")
    dry_run: bool = Field(True, description="Preview what would be deleted without actually deleting")

class CleanupResponse(BaseModel):
    success: bool
    message: str
    statistics: Dict[str, int]
    dry_run: bool

@router.post("/migrate-desktop", response_model=MigrationResponse)
async def migrate_desktop_data(
    request: MigrationRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Migrate data from desktop SQLite database to web PostgreSQL database
    """
    try:
        # Verify SQLite file exists and is accessible
        if not os.path.exists(request.sqlite_file_path):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"SQLite database file not found: {request.sqlite_file_path}"
            )
        
        # Create migrator and perform migration
        migrator = DesktopDataMigrator(request.sqlite_file_path)
        
        migration_stats = await migrator.migrate_user_data(
            user_id=user_id,
            db_session=db,
            include_settings=request.include_settings
        )
        
        return MigrationResponse(
            success=True,
            message="Desktop data migration completed successfully",
            statistics={
                "meetings_migrated": migration_stats.meetings_migrated,
                "transcripts_migrated": migration_stats.transcripts_migrated,
                "settings_migrated": migration_stats.settings_migrated
            },
            errors=migration_stats.errors
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Desktop migration failed for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Migration failed: {str(e)}"
        )

@router.post("/export")
async def export_user_data(
    request: ExportRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Export user data to downloadable file
    """
    try:
        export_service = DataExportService()
        
        export_data = await export_service.export_user_data(
            user_id=user_id,
            db_session=db,
            format=request.format
        )
        
        # Create temporary file for download
        with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as temp_file:
            json.dump(export_data, temp_file, indent=2, ensure_ascii=False)
            temp_file_path = temp_file.name
        
        # Generate filename with timestamp
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"meetily_export_{timestamp}.json"
        
        return FileResponse(
            path=temp_file_path,
            filename=filename,
            media_type='application/json',
            background=lambda: os.unlink(temp_file_path)  # Clean up temp file after download
        )
        
    except Exception as e:
        logger.error(f"Data export failed for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Export failed: {str(e)}"
        )

@router.post("/import")
async def import_user_data(
    file: UploadFile = File(..., description="JSON file containing exported user data"),
    merge_strategy: str = Form("skip_existing", description="How to handle existing data"),
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Import user data from uploaded file
    """
    try:
        # Validate file type
        if not file.filename.endswith('.json'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only JSON files are supported for import"
            )
        
        # Read and parse uploaded file
        try:
            content = await file.read()
            import_data = json.loads(content.decode('utf-8'))
        except json.JSONDecodeError as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid JSON file: {str(e)}"
            )
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Failed to read file: {str(e)}"
            )
        
        # Validate import data structure
        if not isinstance(import_data, dict):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Import data must be a JSON object"
            )
        
        # Perform import
        import_service = DataImportService()
        
        import_stats = await import_service.import_user_data(
            user_id=user_id,
            import_data=import_data,
            db_session=db,
            format='json',
            merge_strategy=merge_strategy
        )
        
        return {
            "success": True,
            "message": "Data import completed successfully",
            "statistics": {
                "meetings_imported": import_stats['meetings_imported'],
                "transcripts_imported": import_stats['transcripts_imported'],
                "model_configs_imported": import_stats['model_configs_imported']
            },
            "warnings": import_stats['warnings'],
            "errors": import_stats['errors']
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Data import failed for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Import failed: {str(e)}"
        )

@router.post("/cleanup", response_model=CleanupResponse)
async def cleanup_user_data(
    request: CleanupRequest,
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Clean up user data based on specified criteria
    """
    try:
        cleanup_service = DataCleanupService()
        
        cleanup_stats = await cleanup_service.cleanup_user_data(
            user_id=user_id,
            db_session=db,
            older_than_days=request.older_than_days,
            dry_run=request.dry_run
        )
        
        action = "Would delete" if request.dry_run else "Deleted"
        message = f"{action} {cleanup_stats['meetings_deleted']} meetings and associated data"
        
        return CleanupResponse(
            success=True,
            message=message,
            statistics=cleanup_stats,
            dry_run=request.dry_run
        )
        
    except Exception as e:
        logger.error(f"Data cleanup failed for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Cleanup failed: {str(e)}"
        )

@router.get("/status")
async def get_migration_status(
    user_id: str = Depends(get_current_user_id),
    db: AsyncSession = Depends(get_db)
):
    """
    Get migration status and statistics for the current user
    """
    try:
        # Get user info
        user = await db.get(User, user_id)
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
        
        # Get basic statistics
        from sqlalchemy import select, func
        from app.models.meeting import Meeting, Transcript
        from app.models.user import UserModelConfig
        
        # Count meetings
        meetings_result = await db.execute(
            select(func.count(Meeting.id)).where(Meeting.user_id == user_id)
        )
        meetings_count = meetings_result.scalar() or 0
        
        # Count transcripts
        transcripts_result = await db.execute(
            select(func.count(Transcript.id)).where(Transcript.user_id == user_id)
        )
        transcripts_count = transcripts_result.scalar() or 0
        
        # Count model configs
        configs_result = await db.execute(
            select(func.count(UserModelConfig.id)).where(UserModelConfig.user_id == user_id)
        )
        configs_count = configs_result.scalar() or 0
        
        # Get oldest and newest meeting dates
        oldest_meeting = await db.execute(
            select(Meeting.created_at).where(Meeting.user_id == user_id).order_by(Meeting.created_at.asc()).limit(1)
        )
        oldest_date = oldest_meeting.scalar()
        
        newest_meeting = await db.execute(
            select(Meeting.created_at).where(Meeting.user_id == user_id).order_by(Meeting.created_at.desc()).limit(1)
        )
        newest_date = newest_meeting.scalar()
        
        return {
            "user_id": user_id,
            "user_email": user.email,
            "user_name": user.name,
            "data_summary": {
                "total_meetings": meetings_count,
                "total_transcripts": transcripts_count,
                "model_configurations": configs_count,
                "oldest_meeting": oldest_date.isoformat() if oldest_date else None,
                "newest_meeting": newest_date.isoformat() if newest_date else None
            },
            "migration_capabilities": {
                "desktop_migration": True,
                "data_export": True,
                "data_import": True,
                "data_cleanup": True,
                "supported_formats": ["json"],
                "merge_strategies": ["skip_existing", "overwrite", "merge"]
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to get migration status for user {user_id}: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to get migration status"
        )

@router.get("/validate-sqlite")
async def validate_sqlite_file(
    file_path: str = Query(..., description="Path to SQLite database file"),
    user_id: str = Depends(get_current_user_id)
):
    """
    Validate a SQLite database file for migration compatibility
    """
    try:
        # Check if file exists
        if not os.path.exists(file_path):
            return {
                "valid": False,
                "errors": [f"File not found: {file_path}"],
                "warnings": [],
                "metadata": {}
            }
        
        # Try to create migrator to validate file
        try:
            migrator = DesktopDataMigrator(file_path)
            desktop_data = migrator._load_desktop_data()
            
            # Analyze the data
            meetings_count = len(desktop_data.get('meetings', []))
            transcripts_count = len(desktop_data.get('transcripts', []))
            has_settings = desktop_data.get('settings') is not None
            
            warnings = []
            if meetings_count == 0:
                warnings.append("No meetings found in database")
            if transcripts_count == 0:
                warnings.append("No transcripts found in database")
            if not has_settings:
                warnings.append("No user settings found in database")
            
            return {
                "valid": True,
                "errors": [],
                "warnings": warnings,
                "metadata": {
                    "meetings_count": meetings_count,
                    "transcripts_count": transcripts_count,
                    "has_settings": has_settings,
                    "file_size_bytes": os.path.getsize(file_path)
                }
            }
            
        except Exception as e:
            return {
                "valid": False,
                "errors": [f"Invalid SQLite database: {str(e)}"],
                "warnings": [],
                "metadata": {}
            }
        
    except Exception as e:
        logger.error(f"SQLite validation failed: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Validation failed: {str(e)}"
        )