# Meetily API Migration Guide

This guide helps developers migrate from the desktop application API (v1) to the new web application API (v2).

## Overview

The Meetily web application maintains backward compatibility with the desktop application API while providing enhanced features and improved structure in the new API version.

## API Versioning

### Version Detection

The API version can be specified in three ways (in order of precedence):

1. **Accept Header** (Recommended)
   ```
   Accept: application/vnd.meetily.v2+json
   ```

2. **URL Path**
   ```
   GET /api/v2/meetings
   ```

3. **Query Parameter**
   ```
   GET /api/meetings?version=v2
   ```

If no version is specified, the latest stable version (v2) is used.

### Supported Versions

- **v1**: Legacy desktop app compatibility (deprecated)
- **v2**: Current web application API (recommended)

## Breaking Changes from v1 to v2

### 1. Meeting Object Structure

**v1 Format:**
```json
{
  "id": "uuid",
  "title": "Meeting Title",
  "description": "Description",
  "created_at": "2024-01-01T10:00:00Z",
  "updated_at": "2024-01-01T11:00:00Z",
  "transcript_text": "Full transcript...",
  "summary_data": {...},
  "processing_status": "completed"
}
```

**v2 Format:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "name": "Meeting Title",
  "description": "Description",
  "meeting_date": "2024-01-01T10:00:00Z",
  "duration_minutes": 120,
  "status": "completed",
  "meeting_type": "general",
  "participants": ["user1", "user2"],
  "processing_status": "completed",
  "created_at": "2024-01-01T10:00:00Z",
  "updated_at": "2024-01-01T11:00:00Z",
  "is_archived": false,
  "transcript_text": "Full transcript...",
  "summary_data": {...},
  "action_items": [...],
  "key_topics": [...],
  "metadata": {...}
}
```

**Key Changes:**
- `title` → `name`
- Added `user_id`, `meeting_date`, `duration_minutes`, `status`, `meeting_type`, `participants`, `is_archived`, `action_items`, `key_topics`, `metadata`

### 2. Meeting List Response

**v1 Format:**
```json
{
  "meetings": [...],
  "total": 10
}
```

**v2 Format:**
```json
{
  "meetings": [...],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total_items": 10,
    "total_pages": 1,
    "has_next": false,
    "has_previous": false
  },
  "filters_applied": {...},
  "sort": {
    "field": "updated_at",
    "order": "desc"
  }
}
```

### 3. Audio Upload Response

**v1 Format:**
```json
{
  "success": true,
  "job_id": "uuid",
  "meeting_id": "uuid",
  "message": "Upload successful"
}
```

**v2 Format:**
```json
{
  "success": true,
  "job_id": "uuid",
  "meeting_id": "uuid",
  "file_info": {
    "filename": "audio.mp3",
    "size_bytes": 1024000,
    "estimated_duration": 30
  },
  "processing_config": {...},
  "estimated_duration": 300,
  "message": "File uploaded successfully. Processing queued."
}
```

### 4. Processing Job Response

**v1 Format:**
```json
{
  "id": "uuid",
  "meeting_id": "uuid",
  "status": "processing",
  "progress": 50,
  "error": null,
  "result": {...},
  "created_at": "2024-01-01T10:00:00Z",
  "updated_at": "2024-01-01T10:30:00Z"
}
```

**v2 Format:**
```json
{
  "job_id": "uuid",
  "meeting_id": "uuid",
  "status": "processing",
  "progress": 50,
  "current_step": "transcription",
  "error_message": null,
  "result": {...},
  "created_at": "2024-01-01T10:00:00Z",
  "updated_at": "2024-01-01T10:30:00Z",
  "started_at": "2024-01-01T10:05:00Z",
  "completed_at": null,
  "estimated_duration": 300,
  "actual_duration": null
}
```

## Endpoint Changes

### Meetings API

| v1 Endpoint | v2 Endpoint | Changes |
|-------------|-------------|---------|
| `GET /meetings` | `GET /api/meetings` | Enhanced filtering, pagination, sorting |
| `POST /meetings` | `POST /api/meetings` | Extended request/response format |
| `GET /meetings/{id}` | `GET /api/meetings/{id}` | Enhanced response with related data options |
| `PUT /meetings/{id}` | `PUT /api/meetings/{id}` | Extended update fields |
| `DELETE /meetings/{id}` | `DELETE /api/meetings/{id}` | Added soft delete option |
| `POST /meetings/{id}/summary` | `POST /api/meetings/{id}/summary/generate` | Enhanced summary options |
| `GET /meetings/{id}/summary/status` | `GET /api/meetings/{id}/summary/status` | Enhanced status information |

### Audio API

| v1 Endpoint | v2 Endpoint | Changes |
|-------------|-------------|---------|
| `POST /audio/upload` | `POST /api/audio/upload` | Enhanced upload options and validation |
| `GET /audio/status/{job_id}` | `GET /api/audio/status/{job_id}` | Enhanced status information |
| `GET /audio/jobs` | `GET /api/audio/jobs` | Added filtering options |
| `GET /audio/formats` | `GET /api/audio/formats` | Enhanced format information |

### New v2 Endpoints

- `GET /api/meetings/statistics/overview` - Meeting statistics
- `POST /api/meetings/{id}/restore` - Restore archived meeting
- `GET /api/audio/transcripts/{meeting_id}` - Get transcript data
- `POST /api/audio/jobs/{job_id}/retry` - Retry failed job
- `DELETE /api/audio/jobs/{job_id}` - Cancel processing job
- `GET /api/audio/validate` - Validate audio file
- `POST /api/migration/migrate-desktop` - Migrate desktop data
- `POST /api/migration/export` - Export user data
- `POST /api/migration/import` - Import user data
- `POST /api/migration/cleanup` - Clean up user data

## Migration Steps

### 1. Update API Base URL

**v1:** `http://localhost:8000/`
**v2:** `http://localhost:8000/api/`

### 2. Update Request Headers

Add version specification:
```http
Accept: application/vnd.meetily.v2+json
Content-Type: application/json
```

### 3. Update Request/Response Handling

#### Meeting Creation
```javascript
// v1
const meeting = await fetch('/meetings', {
  method: 'POST',
  body: JSON.stringify({
    title: 'My Meeting',
    description: 'Meeting description'
  })
});

// v2
const meeting = await fetch('/api/meetings', {
  method: 'POST',
  headers: {
    'Accept': 'application/vnd.meetily.v2+json',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'My Meeting',
    description: 'Meeting description',
    meeting_type: 'general',
    duration_minutes: 120
  })
});
```

#### Meeting List Handling
```javascript
// v1
const response = await fetch('/meetings');
const { meetings, total } = await response.json();

// v2
const response = await fetch('/api/meetings?page=1&page_size=20', {
  headers: { 'Accept': 'application/vnd.meetily.v2+json' }
});
const { meetings, pagination } = await response.json();
const total = pagination.total_items;
```

### 4. Handle New Features

#### Pagination
```javascript
// v2 pagination
const fetchMeetings = async (page = 1, pageSize = 20) => {
  const response = await fetch(`/api/meetings?page=${page}&page_size=${pageSize}`, {
    headers: { 'Accept': 'application/vnd.meetily.v2+json' }
  });
  return response.json();
};
```

#### Filtering and Sorting
```javascript
// v2 filtering
const fetchFilteredMeetings = async (filters) => {
  const params = new URLSearchParams({
    status: filters.status,
    meeting_type: filters.type,
    search: filters.search,
    sort_by: 'updated_at',
    sort_order: 'desc'
  });
  
  const response = await fetch(`/api/meetings?${params}`, {
    headers: { 'Accept': 'application/vnd.meetily.v2+json' }
  });
  return response.json();
};
```

## Backward Compatibility

### Automatic Transformation

The API automatically transforms responses for v1 clients:
- Field name mapping (`name` → `title`)
- Response structure simplification
- Default value injection

### Deprecation Warnings

v1 endpoints return deprecation headers:
```http
X-API-Deprecated: true
X-API-Deprecated-Version: v1
X-API-Deprecated-Message: Use /api/v2/meetings instead
X-API-Migration-Guide: https://docs.meetily.com/api/migration/v1-to-v2
```

### Gradual Migration

You can migrate endpoints gradually:
1. Start with non-critical endpoints
2. Update request/response handling
3. Test thoroughly
4. Migrate critical endpoints
5. Remove v1 version specification

## Error Handling

### v2 Enhanced Error Responses

```json
{
  "error": "validation_error",
  "message": "Invalid request data",
  "details": {
    "field": "name",
    "issue": "Field is required"
  },
  "timestamp": "2024-01-01T10:00:00Z",
  "request_id": "uuid"
}
```

### Status Codes

Both versions use standard HTTP status codes:
- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `422` - Validation Error
- `500` - Internal Server Error

## Testing Migration

### 1. Parallel Testing

Run both v1 and v2 endpoints in parallel during migration:

```javascript
const testMigration = async () => {
  const [v1Response, v2Response] = await Promise.all([
    fetch('/meetings', { headers: { 'Accept': 'application/vnd.meetily.v1+json' } }),
    fetch('/api/meetings', { headers: { 'Accept': 'application/vnd.meetily.v2+json' } })
  ]);
  
  // Compare responses
  const v1Data = await v1Response.json();
  const v2Data = await v2Response.json();
  
  // Validate data consistency
  console.log('v1 meetings:', v1Data.meetings.length);
  console.log('v2 meetings:', v2Data.meetings.length);
};
```

### 2. Feature Flags

Use feature flags to gradually roll out v2 features:

```javascript
const useV2API = process.env.USE_V2_API === 'true';
const apiVersion = useV2API ? 'v2' : 'v1';
const baseURL = useV2API ? '/api' : '';
```

## Support and Resources

- **API Documentation**: `/docs` (when not in production)
- **Migration Support**: Contact development team
- **Issue Tracking**: Report migration issues with detailed reproduction steps

## Timeline

- **Phase 1**: v2 API available alongside v1 (Current)
- **Phase 2**: v1 API deprecated warnings (3 months)
- **Phase 3**: v1 API removal (6 months)

Migrate to v2 as soon as possible to take advantage of new features and ensure continued support.

## Automatic Compatibility Layer

The web application includes an automatic compatibility layer that:

1. **Detects API Version**: Automatically detects the requested API version from headers, path, or query parameters
2. **Transforms Responses**: Automatically transforms v2 responses to v1 format when needed
3. **Adds Headers**: Includes deprecation warnings and migration guidance in response headers
4. **Maintains Compatibility**: Ensures existing v1 clients continue to work without modification

### Compatibility Features

- **Field Name Mapping**: Automatic mapping between v1 and v2 field names (e.g., `title` ↔ `name`)
- **Response Structure**: Transforms complex v2 responses to simpler v1 format
- **Default Values**: Provides sensible defaults for new v2 fields when serving v1 clients
- **Error Handling**: Consistent error responses across both versions

### Migration Verification

Use these endpoints to verify your migration:

```bash
# Test v1 compatibility
curl -H "Accept: application/vnd.meetily.v1+json" \
     -H "Authorization: Bearer $TOKEN" \
     https://api.meetily.com/api/meetings

# Test v2 functionality  
curl -H "Accept: application/vnd.meetily.v2+json" \
     -H "Authorization: Bearer $TOKEN" \
     https://api.meetily.com/api/meetings

# Check deprecation headers
curl -I -H "Accept: application/vnd.meetily.v1+json" \
     -H "Authorization: Bearer $TOKEN" \
     https://api.meetily.com/api/meetings
```

## Data Migration Support

The API includes comprehensive data migration support:

### Desktop to Web Migration

```bash
# Migrate desktop SQLite data to web database
POST /api/migration/migrate-desktop
{
  "sqlite_file_path": "/path/to/meeting_minutes.db",
  "include_settings": true
}
```

### Data Export/Import

```bash
# Export user data
POST /api/migration/export
{
  "format": "json",
  "include_transcripts": true,
  "include_model_configs": true
}

# Import user data
POST /api/migration/import
Content-Type: multipart/form-data
file: exported_data.json
merge_strategy: skip_existing
```

### Data Cleanup

```bash
# Preview cleanup (dry run)
POST /api/migration/cleanup
{
  "older_than_days": 90,
  "dry_run": true
}

# Actual cleanup
POST /api/migration/cleanup
{
  "older_than_days": 90,
  "dry_run": false
}
```