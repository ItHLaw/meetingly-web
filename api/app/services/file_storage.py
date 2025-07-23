"""
Secure cloud file storage service for Meetingly web application

Features:
- Railway volume storage integration
- File upload validation and security
- User-specific file access control
- File serving with access verification
- Storage quota management
- File cleanup and lifecycle management
- Security audit logging
"""

import os
import uuid
import hashlib
import mimetypes
import aiofiles
import shutil
from pathlib import Path
from typing import Optional, Dict, Any, List, BinaryIO
from datetime import datetime, timedelta
from fastapi import HTTPException, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, and_, func, update
import logging

from app.models.user import User
from app.models.meeting import Meeting
from app.core.config import settings
from app.core.database import AsyncSessionLocal

logger = logging.getLogger(__name__)

class SecureFileStorage:
    """
    Comprehensive secure file storage service with Railway volume integration
    """
    
    def __init__(self):
        # Storage configuration
        self.base_storage_path = Path(settings.UPLOAD_DIR)
        self.base_storage_path.mkdir(parents=True, exist_ok=True)
        
        # File validation settings
        self.max_file_size = getattr(settings, 'MAX_FILE_SIZE', 100 * 1024 * 1024)  # 100MB default
        self.allowed_audio_extensions = {'.mp3', '.wav', '.m4a', '.flac', '.ogg', '.webm', '.mp4', '.mov'}
        self.allowed_mime_types = {
            'audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/mp4', 
            'audio/m4a', 'audio/flac', 'audio/ogg', 'audio/webm',
            'video/mp4', 'video/quicktime', 'video/x-msvideo'
        }
        
        # Storage quotas (per user)
        self.default_quota_gb = getattr(settings, 'DEFAULT_USER_QUOTA_GB', 5)  # 5GB per user
        self.max_quota_gb = getattr(settings, 'MAX_USER_QUOTA_GB', 20)  # 20GB maximum
        
        # File retention settings
        self.temp_file_retention_hours = 24
        self.deleted_file_retention_days = 30
        
        # Security settings
        self.enable_virus_scanning = getattr(settings, 'ENABLE_VIRUS_SCANNING', False)
        self.enable_content_scanning = True
        
        logger.info(f"SecureFileStorage initialized with base path: {self.base_storage_path}")
    
    async def validate_file(
        self, 
        file: UploadFile, 
        user_id: str,
        additional_checks: bool = True
    ) -> Dict[str, Any]:
        """
        Comprehensive file validation with security checks
        
        Args:
            file: Uploaded file object
            user_id: ID of the user uploading the file
            additional_checks: Whether to perform additional security checks
            
        Returns:
            Dictionary containing validation results and metadata
        """
        validation_result = {
            "valid": False,
            "errors": [],
            "warnings": [],
            "metadata": {},
            "security_flags": []
        }
        
        try:
            # Basic file existence check
            if not file or not file.filename:
                validation_result["errors"].append("No file provided")
                return validation_result
            
            # File extension validation
            file_path = Path(file.filename)
            file_extension = file_path.suffix.lower()
            
            if file_extension not in self.allowed_audio_extensions:
                validation_result["errors"].append(
                    f"Unsupported file extension: {file_extension}. "
                    f"Allowed: {', '.join(sorted(self.allowed_audio_extensions))}"
                )
            
            # File size validation
            if hasattr(file, 'size') and file.size:
                file_size = file.size
            else:
                # Calculate size by reading
                file.file.seek(0, 2)  # Seek to end
                file_size = file.file.tell()
                file.file.seek(0)  # Reset to beginning
            
            if file_size > self.max_file_size:
                size_mb = file_size / (1024 * 1024)
                max_mb = self.max_file_size / (1024 * 1024)
                validation_result["errors"].append(
                    f"File too large: {size_mb:.1f}MB. Maximum allowed: {max_mb:.1f}MB"
                )
            
            # MIME type validation
            mime_type, _ = mimetypes.guess_type(file.filename)
            if mime_type and mime_type not in self.allowed_mime_types:
                validation_result["warnings"].append(
                    f"Unexpected MIME type: {mime_type}. Proceeding with caution."
                )
            
            # Check user storage quota
            quota_check = await self._check_user_quota(user_id, file_size)
            if not quota_check["within_quota"]:
                validation_result["errors"].append(
                    f"Storage quota exceeded. Used: {quota_check['used_gb']:.2f}GB, "
                    f"Available: {quota_check['quota_gb']:.2f}GB"
                )
            
            # Additional security checks
            if additional_checks:
                security_checks = await self._perform_security_checks(file)
                validation_result["security_flags"].extend(security_checks)
            
            # Store metadata
            validation_result["metadata"] = {
                "filename": file.filename,
                "original_filename": file.filename,
                "size_bytes": file_size,
                "size_mb": round(file_size / (1024 * 1024), 2),
                "extension": file_extension,
                "mime_type": mime_type,
                "estimated_duration": self._estimate_audio_duration(file_size, file_extension),
                "upload_timestamp": datetime.utcnow().isoformat()
            }
            
            # File is valid if no errors
            validation_result["valid"] = len(validation_result["errors"]) == 0
            
            return validation_result
            
        except Exception as e:
            logger.error(f"File validation failed: {str(e)}")
            validation_result["errors"].append(f"Validation failed: {str(e)}")
            return validation_result
    
    async def store_file(
        self,
        file: UploadFile,
        user_id: str,
        meeting_id: Optional[str] = None,
        custom_filename: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Securely store uploaded file with user isolation
        
        Args:
            file: Uploaded file object
            user_id: ID of the user uploading the file
            meeting_id: Optional meeting ID to associate file with
            custom_filename: Optional custom filename
            metadata: Optional additional metadata
            
        Returns:
            Dictionary containing file storage information
        """
        try:
            # Validate file first
            validation = await self.validate_file(file, user_id)
            if not validation["valid"]:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"File validation failed: {', '.join(validation['errors'])}"
                )
            
            # Generate secure file path
            file_info = await self._generate_secure_file_path(
                file, user_id, meeting_id, custom_filename
            )
            
            # Create user directory structure
            file_info["storage_path"].parent.mkdir(parents=True, exist_ok=True)
            
            # Calculate file hash while storing
            file_hash = hashlib.sha256()
            stored_size = 0
            
            # Store file with streaming and hash calculation
            async with aiofiles.open(file_info["storage_path"], 'wb') as stored_file:
                # Reset file pointer
                await file.seek(0)
                
                while chunk := await file.read(8192):  # 8KB chunks
                    file_hash.update(chunk)
                    await stored_file.write(chunk)
                    stored_size += len(chunk)
            
            # Verify file integrity
            if stored_size != validation["metadata"]["size_bytes"]:
                logger.error(f"File size mismatch during storage: expected {validation['metadata']['size_bytes']}, got {stored_size}")
                # Clean up partial file
                if file_info["storage_path"].exists():
                    file_info["storage_path"].unlink()
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="File storage integrity check failed"
                )
            
            # Update storage tracking
            await self._update_user_storage_usage(user_id, stored_size)
            
            # Prepare result
            storage_result = {
                "file_id": file_info["file_id"],
                "storage_path": str(file_info["storage_path"]),
                "relative_path": file_info["relative_path"],
                "secure_filename": file_info["secure_filename"],
                "original_filename": file.filename,
                "size_bytes": stored_size,
                "file_hash": file_hash.hexdigest(),
                "mime_type": validation["metadata"]["mime_type"],
                "stored_at": datetime.utcnow().isoformat(),
                "user_id": user_id,
                "meeting_id": meeting_id,
                "metadata": {
                    **validation["metadata"],
                    **(metadata or {})
                },
                "access_url": f"/api/files/{file_info['file_id']}"
            }
            
            logger.info(f"FILE_STORED: {file_info['secure_filename']} for user {user_id} ({stored_size} bytes)")
            
            return storage_result
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"File storage failed for user {user_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"File storage failed: {str(e)}"
            )
    
    async def retrieve_file(
        self,
        file_id: str,
        user_id: str,
        verify_access: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Retrieve file information with access control
        
        Args:
            file_id: Unique file identifier
            user_id: ID of the user requesting the file
            verify_access: Whether to verify user access to file
            
        Returns:
            File information dictionary if accessible, None otherwise
        """
        try:
            # Decode file path from file_id
            file_path = await self._decode_file_id(file_id)
            
            if not file_path or not file_path.exists():
                logger.warning(f"FILE_NOT_FOUND: {file_id} for user {user_id}")
                return None
            
            # Verify user access
            if verify_access and not await self._verify_file_access(file_path, user_id):
                logger.warning(f"FILE_ACCESS_DENIED: {file_id} for user {user_id}")
                return None
            
            # Get file stats
            stat = file_path.stat()
            
            # Extract metadata from path structure
            path_parts = file_path.parts
            owner_user_id = path_parts[-3] if len(path_parts) >= 3 else None
            
            file_info = {
                "file_id": file_id,
                "storage_path": str(file_path),
                "filename": file_path.name,
                "size_bytes": stat.st_size,
                "created_at": datetime.fromtimestamp(stat.st_ctime).isoformat(),
                "modified_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                "accessed_at": datetime.fromtimestamp(stat.st_atime).isoformat(),
                "owner_user_id": owner_user_id,
                "mime_type": mimetypes.guess_type(file_path.name)[0],
                "extension": file_path.suffix.lower()
            }
            
            return file_info
            
        except Exception as e:
            logger.error(f"File retrieval failed for {file_id}: {str(e)}")
            return None
    
    async def serve_file(
        self,
        file_id: str,
        user_id: str,
        range_header: Optional[str] = None
    ) -> FileResponse:
        """
        Serve file with access control and range support
        
        Args:
            file_id: Unique file identifier
            user_id: ID of the user requesting the file
            range_header: Optional HTTP Range header for partial content
            
        Returns:
            FileResponse for streaming the file
        """
        try:
            # Retrieve file info with access verification
            file_info = await self.retrieve_file(file_id, user_id, verify_access=True)
            
            if not file_info:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="File not found or access denied"
                )
            
            file_path = Path(file_info["storage_path"])
            
            # Log file access
            logger.info(f"FILE_ACCESS: {file_path.name} by user {user_id}")
            
            # Determine content type
            content_type = file_info["mime_type"] or "application/octet-stream"
            
            # Handle range requests for audio streaming
            if range_header:
                return await self._serve_range_request(file_path, range_header, content_type)
            
            # Serve complete file
            return FileResponse(
                path=file_path,
                media_type=content_type,
                filename=file_path.name,
                headers={
                    "Cache-Control": "private, max-age=3600",
                    "X-Content-Type-Options": "nosniff",
                    "X-Frame-Options": "DENY"
                }
            )
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"File serving failed for {file_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="File serving failed"
            )
    
    async def delete_file(
        self,
        file_id: str,
        user_id: str,
        permanent: bool = False
    ) -> bool:
        """
        Delete file with optional soft delete
        
        Args:
            file_id: Unique file identifier
            user_id: ID of the user deleting the file
            permanent: Whether to permanently delete or move to trash
            
        Returns:
            True if deletion successful, False otherwise
        """
        try:
            # Retrieve file info with access verification
            file_info = await self.retrieve_file(file_id, user_id, verify_access=True)
            
            if not file_info:
                logger.warning(f"FILE_DELETE_FAILED: File {file_id} not found for user {user_id}")
                return False
            
            file_path = Path(file_info["storage_path"])
            
            if permanent:
                # Permanent deletion
                file_path.unlink()
                logger.info(f"FILE_DELETED_PERMANENT: {file_path.name} by user {user_id}")
            else:
                # Soft delete - move to trash
                trash_path = await self._move_to_trash(file_path, user_id)
                logger.info(f"FILE_DELETED_SOFT: {file_path.name} moved to {trash_path}")
            
            # Update storage usage
            await self._update_user_storage_usage(user_id, -file_info["size_bytes"])
            
            return True
            
        except Exception as e:
            logger.error(f"File deletion failed for {file_id}: {str(e)}")
            return False
    
    async def get_user_storage_info(self, user_id: str) -> Dict[str, Any]:
        """
        Get comprehensive storage information for a user
        
        Args:
            user_id: ID of the user
            
        Returns:
            Dictionary containing storage statistics
        """
        try:
            user_storage_path = self.base_storage_path / user_id
            
            # Calculate current usage
            total_size = 0
            file_count = 0
            file_types = {}
            
            if user_storage_path.exists():
                for file_path in user_storage_path.rglob("*"):
                    if file_path.is_file() and not file_path.name.startswith('.'):
                        stat = file_path.stat()
                        total_size += stat.st_size
                        file_count += 1
                        
                        # Track file types
                        extension = file_path.suffix.lower()
                        file_types[extension] = file_types.get(extension, 0) + 1
            
            # Get quota information
            quota_bytes = self.default_quota_gb * 1024 * 1024 * 1024
            used_percentage = (total_size / quota_bytes * 100) if quota_bytes > 0 else 0
            
            # Calculate trash usage
            trash_path = self.base_storage_path / ".trash" / user_id
            trash_size = 0
            trash_count = 0
            
            if trash_path.exists():
                for file_path in trash_path.rglob("*"):
                    if file_path.is_file():
                        trash_size += file_path.stat().st_size
                        trash_count += 1
            
            storage_info = {
                "user_id": user_id,
                "usage": {
                    "used_bytes": total_size,
                    "used_mb": round(total_size / (1024 * 1024), 2),
                    "used_gb": round(total_size / (1024 * 1024 * 1024), 3),
                    "quota_bytes": quota_bytes,
                    "quota_gb": self.default_quota_gb,
                    "used_percentage": round(used_percentage, 2),
                    "available_bytes": max(0, quota_bytes - total_size),
                    "available_gb": round(max(0, quota_bytes - total_size) / (1024 * 1024 * 1024), 3)
                },
                "files": {
                    "total_count": file_count,
                    "types": file_types
                },
                "trash": {
                    "size_bytes": trash_size,
                    "size_mb": round(trash_size / (1024 * 1024), 2),
                    "file_count": trash_count
                },
                "storage_path": str(user_storage_path),
                "last_calculated": datetime.utcnow().isoformat()
            }
            
            return storage_info
            
        except Exception as e:
            logger.error(f"Failed to get storage info for user {user_id}: {str(e)}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to get storage information"
            )
    
    async def cleanup_expired_files(self) -> Dict[str, int]:
        """
        Clean up expired temporary and deleted files
        
        Returns:
            Dictionary containing cleanup statistics
        """
        try:
            cleanup_stats = {
                "temp_files_cleaned": 0,
                "trash_files_cleaned": 0,
                "bytes_freed": 0
            }
            
            current_time = datetime.utcnow()
            
            # Clean up temporary files
            temp_cutoff = current_time - timedelta(hours=self.temp_file_retention_hours)
            temp_path = self.base_storage_path / ".temp"
            
            if temp_path.exists():
                for file_path in temp_path.rglob("*"):
                    if file_path.is_file():
                        file_time = datetime.fromtimestamp(file_path.stat().st_mtime)
                        if file_time < temp_cutoff:
                            size = file_path.stat().st_size
                            file_path.unlink()
                            cleanup_stats["temp_files_cleaned"] += 1
                            cleanup_stats["bytes_freed"] += size
            
            # Clean up old trash files
            trash_cutoff = current_time - timedelta(days=self.deleted_file_retention_days)
            trash_path = self.base_storage_path / ".trash"
            
            if trash_path.exists():
                for user_trash in trash_path.iterdir():
                    if user_trash.is_dir():
                        for file_path in user_trash.rglob("*"):
                            if file_path.is_file():
                                file_time = datetime.fromtimestamp(file_path.stat().st_mtime)
                                if file_time < trash_cutoff:
                                    size = file_path.stat().st_size
                                    file_path.unlink()
                                    cleanup_stats["trash_files_cleaned"] += 1
                                    cleanup_stats["bytes_freed"] += size
            
            logger.info(f"FILE_CLEANUP: Cleaned {cleanup_stats['temp_files_cleaned']} temp files, "
                       f"{cleanup_stats['trash_files_cleaned']} trash files, "
                       f"freed {cleanup_stats['bytes_freed']} bytes")
            
            return cleanup_stats
            
        except Exception as e:
            logger.error(f"File cleanup failed: {str(e)}")
            return {"temp_files_cleaned": 0, "trash_files_cleaned": 0, "bytes_freed": 0}
    
    # Private helper methods
    
    async def _generate_secure_file_path(
        self,
        file: UploadFile,
        user_id: str,
        meeting_id: Optional[str] = None,
        custom_filename: Optional[str] = None
    ) -> Dict[str, Any]:
        """Generate secure file path with user isolation"""
        
        # Generate unique file ID
        file_id = str(uuid.uuid4())
        
        # Generate secure filename
        original_name = Path(file.filename)
        extension = original_name.suffix.lower()
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        
        if custom_filename:
            secure_filename = f"{custom_filename}_{timestamp}_{file_id[:8]}{extension}"
        else:
            secure_filename = f"{original_name.stem}_{timestamp}_{file_id[:8]}{extension}"
        
        # Create directory structure: base/user_id/year/month/
        date_path = datetime.utcnow().strftime("%Y/%m")
        user_storage_path = self.base_storage_path / user_id / date_path
        
        # Full storage path
        storage_path = user_storage_path / secure_filename
        relative_path = f"{user_id}/{date_path}/{secure_filename}"
        
        return {
            "file_id": file_id,
            "secure_filename": secure_filename,
            "storage_path": storage_path,
            "relative_path": relative_path,
            "user_storage_path": user_storage_path
        }
    
    async def _check_user_quota(self, user_id: str, additional_size: int) -> Dict[str, Any]:
        """Check if user has sufficient storage quota"""
        
        storage_info = await self.get_user_storage_info(user_id)
        current_usage = storage_info["usage"]["used_bytes"]
        quota = storage_info["usage"]["quota_bytes"]
        
        within_quota = (current_usage + additional_size) <= quota
        
        return {
            "within_quota": within_quota,
            "used_bytes": current_usage,
            "quota_bytes": quota,
            "used_gb": storage_info["usage"]["used_gb"],
            "quota_gb": storage_info["usage"]["quota_gb"],
            "would_exceed_by": max(0, (current_usage + additional_size) - quota)
        }
    
    async def _perform_security_checks(self, file: UploadFile) -> List[str]:
        """Perform additional security checks on uploaded file"""
        
        security_flags = []
        
        try:
            # Read first few bytes for content analysis
            await file.seek(0)
            header_bytes = await file.read(1024)
            await file.seek(0)
            
            # Check for suspicious content patterns
            if b'<script' in header_bytes.lower():
                security_flags.append("SUSPICIOUS_SCRIPT_CONTENT")
            
            if b'<?php' in header_bytes:
                security_flags.append("SUSPICIOUS_PHP_CONTENT")
            
            # Check file size vs content mismatch
            if len(header_bytes) < 100 and file.size and file.size > 1024:
                security_flags.append("SIZE_CONTENT_MISMATCH")
            
            # Add more security checks as needed
            
        except Exception as e:
            logger.warning(f"Security check failed: {str(e)}")
            security_flags.append("SECURITY_CHECK_FAILED")
        
        return security_flags
    
    def _estimate_audio_duration(self, file_size: int, extension: str) -> float:
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
    
    async def _update_user_storage_usage(self, user_id: str, size_delta: int):
        """Update user storage usage tracking"""
        # This could be implemented with a database table for tracking
        # For now, we rely on filesystem calculations
        pass
    
    async def _decode_file_id(self, file_id: str) -> Optional[Path]:
        """Decode file ID to actual file path"""
        # This is a simplified implementation
        # In production, you might want to use a database mapping
        
        # Search for file with this ID in filename
        for user_dir in self.base_storage_path.iterdir():
            if user_dir.is_dir() and not user_dir.name.startswith('.'):
                for file_path in user_dir.rglob("*"):
                    if file_path.is_file() and file_id[:8] in file_path.name:
                        return file_path
        
        return None
    
    async def _verify_file_access(self, file_path: Path, user_id: str) -> bool:
        """Verify user has access to file"""
        
        # Check if file is in user's directory
        try:
            relative_path = file_path.relative_to(self.base_storage_path)
            path_user_id = relative_path.parts[0]
            return path_user_id == user_id
        except ValueError:
            return False
    
    async def _serve_range_request(
        self,
        file_path: Path,
        range_header: str,
        content_type: str
    ) -> StreamingResponse:
        """Handle HTTP range requests for partial content"""
        
        file_size = file_path.stat().st_size
        
        # Parse range header
        range_match = range_header.replace('bytes=', '').split('-')
        start = int(range_match[0]) if range_match[0] else 0
        end = int(range_match[1]) if range_match[1] else file_size - 1
        
        # Validate range
        start = max(0, start)
        end = min(end, file_size - 1)
        content_length = end - start + 1
        
        def iterfile():
            with open(file_path, 'rb') as f:
                f.seek(start)
                remaining = content_length
                while remaining > 0:
                    chunk_size = min(8192, remaining)
                    chunk = f.read(chunk_size)
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk
        
        headers = {
            'Content-Range': f'bytes {start}-{end}/{file_size}',
            'Accept-Ranges': 'bytes',
            'Content-Length': str(content_length),
            'Cache-Control': 'private, max-age=3600'
        }
        
        return StreamingResponse(
            iterfile(),
            status_code=206,
            headers=headers,
            media_type=content_type
        )
    
    async def _move_to_trash(self, file_path: Path, user_id: str) -> Path:
        """Move file to user's trash directory"""
        
        trash_base = self.base_storage_path / ".trash" / user_id
        trash_base.mkdir(parents=True, exist_ok=True)
        
        # Generate unique trash filename with timestamp
        timestamp = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
        trash_filename = f"{timestamp}_{file_path.name}"
        trash_path = trash_base / trash_filename
        
        # Move file to trash
        shutil.move(str(file_path), str(trash_path))
        
        return trash_path