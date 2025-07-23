# Meetingly Web API Documentation

## Overview

The Meetingly Web API is a comprehensive FastAPI-based backend service that provides meeting transcription, AI-powered summarization, and user management capabilities. The API is designed for enterprise use with Microsoft SSO authentication, multi-tenant isolation, and production-ready features.

## Base URL

- **Development**: `http://localhost:8000`
- **Production**: `https://your-api-service.railway.app`

## Architecture

### Core Components

1. **Authentication Service**: Microsoft SSO with JWT token management
2. **Audio Processing Service**: File upload and transcription with Whisper integration
3. **Meeting Management Service**: CRUD operations with user isolation
4. **Enhanced Summary Service**: Multi-provider LLM integration with structured summaries
5. **WebSocket Service**: Real-time updates and notifications
6. **File Storage Service**: Secure file handling with validation

### Technology Stack

- **Framework**: FastAPI 0.104.1
- **Database**: PostgreSQL with SQLAlchemy 2.0.23
- **Cache**: Redis for session management
- **Authentication**: Microsoft SSO + JWT
- **Background Processing**: Celery for async tasks
- **WebSocket**: Built-in FastAPI WebSocket support

## Authentication

### Microsoft SSO Flow

1. **Frontend Initiates SSO**: User clicks "Sign in with Microsoft"
2. **Microsoft Authentication**: User authenticates with Microsoft
3. **Token Exchange**: Frontend sends Microsoft tokens to `/auth/microsoft/token`
4. **JWT Generation**: API returns JWT access/refresh tokens
5. **API Access**: All subsequent requests use JWT Bearer token

### Authentication Endpoints

#### POST /auth/microsoft/token
Exchange Microsoft SSO tokens for JWT tokens.

**Request Body:**
```json
{
    "id_token": "microsoft_id_token",
    "access_token": "microsoft_access_token"
}
```

**Response:**
```json
{
    "access_token": "jwt_access_token",
    "refresh_token": "jwt_refresh_token", 
    "token_type": "bearer",
    "expires_in": 86400,
    "user": {
        "id": "user_uuid",
        "email": "user@domain.com",
        "name": "User Name",
        "tenant_id": "tenant_uuid",
        "created_at": "2025-01-15T10:00:00Z",
        "is_active": true
    }
}
```

#### POST /auth/refresh
Refresh JWT access token using refresh token.

**Request Body:**
```json
{
    "refresh_token": "jwt_refresh_token"
}
```

#### POST /auth/logout
Invalidate current session and tokens.

**Headers:**
```
Authorization: Bearer jwt_access_token
```

#### GET /auth/me
Get current user information.

**Headers:**
```
Authorization: Bearer jwt_access_token
```

**Response:**
```json
{
    "id": "user_uuid",
    "email": "user@domain.com", 
    "name": "User Name",
    "tenant_id": "tenant_uuid",
    "created_at": "2025-01-15T10:00:00Z",
    "is_active": true
}
```

## Meeting Management

### Endpoints

#### GET /api/v1/meetings
Get list of user's meetings with filtering and pagination.

**Query Parameters:**
- `skip` (int): Number of records to skip (default: 0)
- `limit` (int): Maximum records to return (default: 20, max: 100)
- `status` (str): Filter by processing status (pending, processing, completed, failed)
- `search` (str): Search in meeting names and participant names
- `sort_by` (str): Sort field (created_at, updated_at, name)
- `sort_order` (str): Sort direction (asc, desc)

**Headers:**
```
Authorization: Bearer jwt_access_token
```

**Response:**
```json
{
    "meetings": [
        {
            "id": "meeting_uuid",
            "name": "Weekly Team Meeting",
            "processing_status": "completed",
            "created_at": "2025-01-15T10:00:00Z",
            "updated_at": "2025-01-15T10:30:00Z",
            "duration": 1800,
            "participants": ["John Doe", "Jane Smith"],
            "has_transcript": true,
            "has_summary": true,
            "file_size": 15728640,
            "audio_format": "mp3"
        }
    ],
    "total": 25,
    "skip": 0,
    "limit": 20,
    "has_more": true
}
```

#### POST /api/v1/meetings
Create a new meeting.

**Request Body:**
```json
{
    "name": "Meeting Name",
    "description": "Optional description",
    "scheduled_at": "2025-01-15T14:00:00Z"
}
```

**Response:**
```json
{
    "id": "meeting_uuid",
    "name": "Meeting Name",
    "description": "Optional description",
    "processing_status": "pending",
    "created_at": "2025-01-15T10:00:00Z",
    "updated_at": "2025-01-15T10:00:00Z",
    "user_id": "user_uuid"
}
```

#### GET /api/v1/meetings/{meeting_id}
Get detailed meeting information.

**Path Parameters:**
- `meeting_id` (str): UUID of the meeting

**Query Parameters:**
- `include_transcripts` (bool): Include transcript data (default: false)
- `include_summary` (bool): Include summary data (default: true)

**Response:**
```json
{
    "id": "meeting_uuid",
    "name": "Weekly Team Meeting",
    "description": "Team sync and updates",
    "processing_status": "completed",
    "created_at": "2025-01-15T10:00:00Z",
    "updated_at": "2025-01-15T10:30:00Z",
    "duration": 1800,
    "participants": ["John Doe", "Jane Smith"],
    "audio_url": "/api/v1/meetings/meeting_uuid/audio",
    "transcript_data": [
        {
            "id": "transcript_uuid",
            "text": "Hello everyone, let's start the meeting.",
            "speaker_id": "speaker_1",
            "speaker_name": "John Doe",
            "start_time": 0.0,
            "end_time": 3.5,
            "confidence": 0.95
        }
    ],
    "summary_data": {
        "summary": "Meeting summary content...",
        "summary_type": "detailed",
        "provider": "openai",
        "model": "gpt-4",
        "generated_at": "2025-01-15T10:30:00Z",
        "quality_score": 0.92
    }
}
```

#### PUT /api/v1/meetings/{meeting_id}
Update meeting information.

**Request Body:**
```json
{
    "name": "Updated Meeting Name",
    "description": "Updated description"
}
```

#### DELETE /api/v1/meetings/{meeting_id}
Delete a meeting and all associated data.

**Response:**
```json
{
    "message": "Meeting deleted successfully"
}
```

## Audio Processing

### Endpoints

#### POST /api/v1/audio/upload
Upload audio file for transcription.

**Content-Type:** `multipart/form-data`

**Form Data:**
- `file` (file): Audio file (MP3, WAV, M4A, FLAC, OGG, WebM, MP4, MOV)
- `meeting_name` (str): Name for the meeting
- `enable_diarization` (bool): Enable speaker separation (default: true)
- `model` (str): Whisper model to use (tiny, base, small, medium, large)
- `language` (str): Language code or 'auto' for auto-detection
- `temperature` (float): Model temperature 0.0-1.0 (default: 0.0)
- `initial_prompt` (str): Optional context prompt

**Response:**
```json
{
    "job_id": "job_uuid",
    "meeting_id": "meeting_uuid",
    "status": "pending",
    "estimated_duration": 300,
    "message": "Audio upload successful, processing started"
}
```

#### GET /api/v1/audio/status/{job_id}
Get audio processing status.

**Response:**
```json
{
    "job_id": "job_uuid",
    "meeting_id": "meeting_uuid", 
    "status": "processing",
    "progress": 45,
    "current_step": "Transcribing audio with Whisper",
    "estimated_completion": "2025-01-15T10:35:00Z",
    "error_message": null,
    "result": null
}
```

#### GET /api/v1/audio/jobs
Get list of user's audio processing jobs.

**Query Parameters:**
- `skip` (int): Records to skip
- `limit` (int): Max records to return
- `status` (str): Filter by job status

**Response:**
```json
{
    "jobs": [
        {
            "job_id": "job_uuid",
            "meeting_id": "meeting_uuid",
            "meeting_name": "Team Meeting",
            "status": "completed",
            "progress": 100,
            "created_at": "2025-01-15T10:00:00Z",
            "completed_at": "2025-01-15T10:05:00Z"
        }
    ],
    "total": 10,
    "has_more": false
}
```

## Enhanced Summary Generation

### Endpoints

#### POST /api/v1/meetings/{meeting_id}/summary
Generate AI-powered summary for a meeting.

**Request Body:**
```json
{
    "summary_type": "structured",
    "provider": "openai",
    "model": "gpt-4",
    "custom_prompt": "Focus on action items and decisions",
    "enable_chunking": true
}
```

**Summary Types:**
- `structured`: Comprehensive structured summary with multiple sections
- `brief`: Concise summary focusing on key decisions (200 words max)
- `detailed`: Comprehensive narrative summary (1000 words max)
- `action_items`: Focused on actionable tasks and responsibilities

**Supported Providers:**
- `openai`: GPT models (gpt-4, gpt-4-turbo, gpt-3.5-turbo)
- `anthropic`: Claude models (claude-3-opus, claude-3-sonnet, claude-3-haiku)
- `groq`: Groq models (llama3-70b-8192, mixtral-8x7b-32768)
- `ollama`: Local models (llama3, mistral, codellama)

**Response:**
```json
{
    "job_id": "summary_job_uuid",
    "status": "pending",
    "estimated_duration": 180,
    "message": "Summary generation started"
}
```

#### GET /api/v1/meetings/{meeting_id}/summary/status
Get summary generation status.

**Response:**
```json
{
    "meeting_id": "meeting_uuid",
    "has_summary": true,
    "summary_available": true,
    "processing_status": "completed",
    "last_generated": "2025-01-15T10:30:00Z",
    "summary_type": "structured",
    "provider": "openai",
    "model": "gpt-4",
    "quality_score": 0.92,
    "processing_time": 45.2,
    "chunks_processed": 3
}
```

#### POST /api/v1/meetings/{meeting_id}/summary/regenerate
Regenerate summary with new parameters.

**Request Body:**
```json
{
    "summary_type": "brief",
    "provider": "anthropic", 
    "model": "claude-3-sonnet",
    "custom_prompt": "Focus on technical decisions"
}
```

#### GET /api/v1/summary/types
Get available summary types and their configurations.

**Response:**
```json
{
    "summary_types": {
        "structured": {
            "description": "Comprehensive structured summary with multiple sections",
            "response_model": "StructuredSummaryResponse",
            "chunking_enabled": true,
            "post_processing": true
        },
        "brief": {
            "description": "Concise summary focusing on key decisions and action items",
            "max_length": 200,
            "style": "bullet points",
            "chunking_enabled": false
        }
    },
    "supported_providers": {
        "openai": {
            "models": ["gpt-4", "gpt-4-turbo", "gpt-3.5-turbo"],
            "default_model": "gpt-4"
        },
        "anthropic": {
            "models": ["claude-3-opus", "claude-3-sonnet", "claude-3-haiku"],
            "default_model": "claude-3-sonnet"
        }
    }
}
```

## WebSocket Integration

### Connection

Connect to WebSocket for real-time updates:

**URL:** `ws://localhost:8000/ws/{user_id}?token={jwt_access_token}`

### Message Types

#### Processing Updates
```json
{
    "type": "processing_update",
    "data": {
        "job_id": "job_uuid",
        "meeting_id": "meeting_uuid",
        "status": "processing",
        "progress": 65,
        "current_step": "Generating summary",
        "estimated_completion": "2025-01-15T10:35:00Z"
    }
}
```

#### Summary Ready
```json
{
    "type": "summary_ready",
    "data": {
        "meeting_id": "meeting_uuid",
        "summary_type": "structured",
        "provider": "openai",
        "model": "gpt-4",
        "quality_score": 0.92
    }
}
```

#### System Notifications
```json
{
    "type": "system_notification",
    "data": {
        "title": "Processing Complete",
        "message": "Your meeting transcription is ready",
        "notification_type": "success",
        "timestamp": "2025-01-15T10:30:00Z"
    }
}
```

## Error Handling

### Standard Error Response

All API errors follow this format:

```json
{
    "detail": "Error message description",
    "error_code": "SPECIFIC_ERROR_CODE",
    "timestamp": "2025-01-15T10:30:00Z",
    "request_id": "req_uuid"
}
```

### HTTP Status Codes

- `200`: Success
- `201`: Created
- `400`: Bad Request (validation errors)
- `401`: Unauthorized (invalid/missing token)
- `403`: Forbidden (insufficient permissions)
- `404`: Not Found
- `422`: Unprocessable Entity (validation errors)
- `429`: Too Many Requests (rate limited)
- `500`: Internal Server Error

### Error Categories

#### Authentication Errors
- `AUTH_TOKEN_MISSING`: No authorization header provided
- `AUTH_TOKEN_INVALID`: Invalid or expired JWT token
- `AUTH_MICROSOFT_FAILED`: Microsoft SSO validation failed
- `AUTH_USER_INACTIVE`: User account is deactivated

#### Validation Errors
- `VALIDATION_FAILED`: Request data validation failed
- `FILE_TOO_LARGE`: Uploaded file exceeds size limit
- `FILE_FORMAT_UNSUPPORTED`: Audio file format not supported
- `MEETING_NAME_REQUIRED`: Meeting name is required

#### Processing Errors
- `PROCESSING_FAILED`: Audio processing job failed
- `SUMMARY_GENERATION_FAILED`: AI summary generation failed
- `MODEL_UNAVAILABLE`: Requested AI model is not available
- `QUOTA_EXCEEDED`: User has exceeded usage quota

#### Resource Errors
- `MEETING_NOT_FOUND`: Meeting does not exist or access denied
- `JOB_NOT_FOUND`: Processing job not found
- `TRANSCRIPT_NOT_AVAILABLE`: Meeting has no transcript data

## Rate Limiting

Rate limits are applied per user based on authentication:

- **Authentication endpoints**: 10 requests per minute
- **File uploads**: 5 requests per minute
- **API calls**: 100 requests per minute
- **WebSocket connections**: 5 concurrent connections per user

Rate limit headers are included in responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642234567
```

## Pagination

List endpoints support pagination with these parameters:

- `skip` (int): Number of records to skip (default: 0)
- `limit` (int): Maximum records to return (default: 20, max: 100)

Pagination responses include:
```json
{
    "data": [...],
    "total": 150,
    "skip": 40,
    "limit": 20,
    "has_more": true,
    "next_skip": 60
}
```

## File Handling

### Supported Audio Formats

- **Audio**: MP3, WAV, M4A, FLAC, OGG, WebM
- **Video**: MP4, MOV, AVI (audio will be extracted)
- **Maximum file size**: 100MB
- **Maximum duration**: 4 hours

### File Security

- All uploaded files are validated for format and size
- Files are stored with secure, randomly generated names
- Access to files requires valid JWT token and user ownership
- Files are automatically cleaned up after processing completion

## User Configuration

### Model Preferences

Users can configure their preferred AI models:

#### GET /api/v1/user/config
Get user's model configuration.

**Response:**
```json
{
    "preferred_provider": "openai",
    "preferred_model": "gpt-4",
    "default_summary_type": "structured",
    "enable_chunking": true,
    "api_keys": {
        "openai": {
            "configured": true,
            "last_updated": "2025-01-15T10:00:00Z"
        },
        "anthropic": {
            "configured": false
        }
    }
}
```

#### PUT /api/v1/user/config
Update user's model configuration.

**Request Body:**
```json
{
    "preferred_provider": "anthropic",
    "preferred_model": "claude-3-sonnet",
    "default_summary_type": "detailed"
}
```

#### POST /api/v1/user/api-keys
Configure API keys for AI providers.

**Request Body:**
```json
{
    "provider": "openai",
    "api_key": "sk-...",
    "validate": true
}
```

## Health Monitoring

### Health Check Endpoints

#### GET /health
Basic health check.

**Response:**
```json
{
    "status": "healthy",
    "timestamp": "2025-01-15T10:30:00Z",
    "version": "1.0.0"
}
```

#### GET /health/detailed
Detailed health check with component status.

**Response:**
```json
{
    "status": "healthy",
    "timestamp": "2025-01-15T10:30:00Z",
    "version": "1.0.0",
    "components": {
        "database": {
            "status": "healthy",
            "response_time_ms": 12
        },
        "redis": {
            "status": "healthy", 
            "response_time_ms": 3
        },
        "storage": {
            "status": "healthy",
            "free_space_gb": 150.5
        }
    },
    "metrics": {
        "active_users": 45,
        "processing_jobs": 3,
        "avg_response_time_ms": 89
    }
}
```

## Development and Testing

### Environment Setup

Required environment variables:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/meetily_db
REDIS_URL=redis://localhost:6379

# Authentication
MICROSOFT_CLIENT_ID=azure_client_id
MICROSOFT_CLIENT_SECRET=azure_client_secret
MICROSOFT_TENANT_ID=azure_tenant_id
JWT_SECRET_KEY=your_jwt_secret

# AI Services (Optional - users can configure their own)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GROQ_API_KEY=gsk_...

# Application
ENVIRONMENT=development
DEBUG=true
API_HOST=0.0.0.0
API_PORT=8000
ALLOWED_ORIGINS=http://localhost:3000
```

### Testing Endpoints

The API includes test utilities:

#### POST /api/v1/test/generate-token
Generate test JWT token (development only).

#### POST /api/v1/test/mock-upload
Mock audio upload for testing (development only).

## SDK Integration

### JavaScript/TypeScript SDK

```typescript
import { MeetinglyAPI } from '@meetingly/api-client';

const api = new MeetinglyAPI({
    baseURL: 'http://localhost:8000',
    token: 'your_jwt_token'
});

// Upload audio file
const upload = await api.audio.upload({
    file: audioFile,
    meetingName: 'Team Meeting',
    enableDiarization: true
});

// Generate summary
const summary = await api.meetings.generateSummary(meetingId, {
    summaryType: 'structured',
    provider: 'openai',
    model: 'gpt-4'
});
```

## Migration Guide

For migrating from the legacy desktop application:

1. **Data Export**: Use the desktop app's export feature
2. **User Registration**: Complete Microsoft SSO setup
3. **Data Import**: Use the import endpoints to migrate meetings
4. **Configuration**: Set up AI provider API keys
5. **Testing**: Verify all functionality works correctly

## Support and Contributing

- **Issues**: Report bugs and feature requests on GitHub
- **Documentation**: Contribute to documentation improvements
- **API Changes**: Follow semantic versioning for breaking changes
- **Testing**: All changes require comprehensive test coverage

For more information, see the main project README and architecture documentation.