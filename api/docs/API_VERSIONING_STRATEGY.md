# API Versioning Strategy

This document outlines the comprehensive API versioning strategy for the Meetily web application, ensuring backward compatibility while enabling API evolution.

## Overview

The Meetily API uses semantic versioning with automatic compatibility transformation to maintain backward compatibility while allowing for API evolution. The system supports multiple API versions simultaneously and provides migration paths for clients.

## Versioning Approach

### Version Identification

API versions are identified using the format `v{major}` (e.g., `v1`, `v2`). The system supports three methods for version specification:

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

### Version Detection Priority

The system uses the following priority order for version detection:
1. Accept header
2. URL path
3. Query parameter
4. Default to latest stable version

## Supported Versions

### v1 (Legacy - Deprecated)
- **Status**: Deprecated
- **Purpose**: Desktop application compatibility
- **Features**: Basic meeting and audio processing
- **Deprecation Timeline**: 6 months from web app launch
- **Migration Path**: Automatic transformation to v2 format

### v2 (Current)
- **Status**: Current stable version
- **Purpose**: Web application with enhanced features
- **Features**: Full feature set with user isolation, enhanced metadata, pagination
- **Recommended**: Yes

## Compatibility Layer

### Automatic Transformation

The system includes an automatic compatibility layer that:

1. **Request Transformation**: Converts v1 requests to v2 format internally
2. **Response Transformation**: Converts v2 responses back to v1 format for v1 clients
3. **Field Mapping**: Handles field name changes between versions
4. **Default Values**: Provides sensible defaults for new fields

### Transformation Examples

#### Meeting Object Transformation

**v1 → v2 Request Transformation:**
```json
// v1 Request
{
  "title": "Meeting Title",
  "description": "Description"
}

// Transformed to v2 internally
{
  "name": "Meeting Title",
  "description": "Description",
  "meeting_type": "general",
  "status": "scheduled",
  "duration_minutes": 120
}
```

**v2 → v1 Response Transformation:**
```json
// v2 Response
{
  "id": "uuid",
  "user_id": "uuid",
  "name": "Meeting Title",
  "meeting_type": "general",
  "status": "scheduled",
  "participants": ["user1"],
  "created_at": "2024-01-01T10:00:00Z"
}

// Transformed to v1 for v1 clients
{
  "id": "uuid",
  "title": "Meeting Title",
  "created_at": "2024-01-01T10:00:00Z",
  "processing_status": "completed"
}
```

## Implementation Architecture

### Middleware Layer

```python
class APIVersioningMiddleware:
    """Handles automatic version detection and transformation"""
    
    async def dispatch(self, request, call_next):
        # 1. Detect API version from request
        # 2. Store version in request state
        # 3. Process request normally
        # 4. Transform response if needed
        # 5. Add version headers
```

### Transformation Services

```python
class ResponseTransformer:
    """Transforms responses between API versions"""
    
    def transform(self, data, data_type, target_version):
        # Apply version-specific transformations
        
class RequestTransformer:
    """Transforms requests between API versions"""
    
    def transform(self, data, data_type, source_version):
        # Convert to current internal format
```

### Version Detection

```python
class VersionExtractor:
    """Extracts API version from various request sources"""
    
    @staticmethod
    def from_header(request) -> Optional[str]:
        # Extract from Accept header
        
    @staticmethod
    def from_path(request) -> Optional[str]:
        # Extract from URL path
        
    @staticmethod
    def from_query(request) -> Optional[str]:
        # Extract from query parameter
```

## Deprecation Management

### Deprecation Headers

For deprecated versions, the system automatically adds headers:

```http
X-API-Deprecated: true
X-API-Deprecated-Version: v1
X-API-Deprecated-Message: API v1 is deprecated. Please migrate to v2.
X-API-Migration-Guide: https://docs.meetily.com/api/migration/v1-to-v2
```

### Deprecation Timeline

1. **Announcement Phase** (Month 1-2)
   - Announce deprecation in documentation
   - Add deprecation headers to responses
   - Provide migration guide

2. **Warning Phase** (Month 3-4)
   - Increase visibility of deprecation warnings
   - Send notifications to active API users
   - Provide migration support

3. **Sunset Phase** (Month 5-6)
   - Final warnings before removal
   - Mandatory migration period
   - Support for migration issues

4. **Removal Phase** (Month 7+)
   - Remove deprecated version
   - Return 410 Gone for deprecated endpoints

## Testing Strategy

### Compatibility Testing

```python
class TestAPICompatibility:
    """Comprehensive API compatibility tests"""
    
    async def test_version_detection(self):
        # Test all version detection methods
        
    async def test_response_transformation(self):
        # Test automatic response transformation
        
    async def test_request_transformation(self):
        # Test automatic request transformation
        
    async def test_deprecation_headers(self):
        # Test deprecation header inclusion
```

### Migration Testing

```python
class TestMigrationPath:
    """Test migration paths between versions"""
    
    async def test_parallel_version_support(self):
        # Test same data through different versions
        
    async def test_data_consistency(self):
        # Ensure data consistency across versions
```

## Client Migration Guide

### Phase 1: Preparation
1. Review API changes in migration guide
2. Identify affected endpoints in your application
3. Plan migration timeline
4. Set up testing environment

### Phase 2: Gradual Migration
1. Start with non-critical endpoints
2. Update version headers/paths
3. Test thoroughly in staging
4. Monitor for issues

### Phase 3: Complete Migration
1. Migrate all remaining endpoints
2. Remove v1 version specifications
3. Update documentation
4. Monitor production deployment

### Phase 4: Cleanup
1. Remove v1-specific code
2. Update error handling
3. Optimize for v2 features

## Monitoring and Analytics

### Version Usage Tracking

The system tracks:
- API version usage by endpoint
- Client migration progress
- Error rates by version
- Performance metrics by version

### Deprecation Metrics

- Number of v1 requests over time
- Client migration completion rate
- Support ticket volume related to migration
- Performance impact of compatibility layer

## Best Practices

### For API Consumers

1. **Always specify version**: Don't rely on defaults
2. **Monitor deprecation headers**: Watch for deprecation warnings
3. **Test migration early**: Don't wait until the last minute
4. **Use feature flags**: Gradually roll out version changes
5. **Monitor error rates**: Watch for issues during migration

### For API Providers

1. **Maintain backward compatibility**: Don't break existing clients
2. **Provide clear migration paths**: Document all changes
3. **Give adequate notice**: Provide sufficient deprecation timeline
4. **Support during migration**: Offer help during transition
5. **Monitor usage**: Track version adoption and issues

## Future Versioning

### Version 3 Planning

When planning v3:
1. Analyze v2 usage patterns
2. Identify areas for improvement
3. Plan breaking changes carefully
4. Provide even better migration tools
5. Learn from v1→v2 migration experience

### Continuous Improvement

- Regular review of versioning strategy
- Client feedback incorporation
- Performance optimization
- Migration tool enhancement
- Documentation updates

## Conclusion

This comprehensive versioning strategy ensures:
- Smooth migration from desktop to web application
- Backward compatibility for existing integrations
- Clear path for future API evolution
- Minimal disruption to API consumers
- Maintainable codebase for API providers

The automatic compatibility layer reduces migration burden while the comprehensive documentation and testing ensure reliable operation across all supported versions.