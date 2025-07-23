# Monitoring and Logging Configuration

This document outlines the monitoring and logging setup for the Meetily web application deployed on Railway.app.

## Health Check Endpoints

### API Service Health Checks

#### `/health` - Comprehensive Health Check
- **Purpose**: Full system health assessment
- **Checks**: Database, Redis, file system, environment variables, system metrics
- **Response**: Detailed health status with metrics
- **Usage**: Monitoring dashboards, detailed diagnostics

#### `/health/ready` - Readiness Check
- **Purpose**: Load balancer readiness probe
- **Checks**: Database connectivity
- **Response**: Simple ready/not ready status
- **Usage**: Railway load balancer, Kubernetes readiness probes

#### `/health/live` - Liveness Check
- **Purpose**: Basic service availability
- **Checks**: Service responsiveness
- **Response**: Simple alive status
- **Usage**: Railway health monitoring, Kubernetes liveness probes

### Web-App Service Health Checks

#### `/api/health` - Comprehensive Health Check
- **Purpose**: Frontend service health assessment
- **Checks**: API connectivity, environment variables, performance metrics
- **Response**: Detailed health status with metrics
- **Usage**: Monitoring dashboards, detailed diagnostics

#### `/api/health/ready` - Readiness Check
- **Purpose**: Load balancer readiness probe
- **Checks**: API service connectivity
- **Response**: Simple ready/not ready status
- **Usage**: Railway load balancer

## Monitoring Metrics

### API Service Metrics

#### System Metrics
- CPU usage percentage
- Memory usage percentage and available MB
- Disk usage percentage and free GB
- Service uptime

#### Application Metrics
- Database connection pool status
- Redis connection status
- File system accessibility
- Environment variable validation

#### Performance Metrics
- Response times for health checks
- Database query response times
- Redis operation response times

### Web-App Service Metrics

#### System Metrics
- Memory usage (Node.js process)
- Service uptime
- Node.js version

#### Application Metrics
- API connectivity status
- Environment variable validation
- Frontend build status

#### Performance Metrics
- Health check response times
- API communication latency

## Logging Configuration

### API Service Logging

#### Log Levels
- **ERROR**: Error conditions requiring immediate attention
- **WARN**: Warning conditions that should be monitored
- **INFO**: General informational messages
- **DEBUG**: Detailed debugging information (development only)

#### Log Format
```json
{
  "timestamp": "2024-01-15T10:30:00Z",
  "level": "INFO",
  "logger": "meetily.api",
  "message": "User authentication successful",
  "user_id": "user-123",
  "request_id": "req-456",
  "duration_ms": 150
}
```

#### Log Categories
- **Authentication**: User login/logout events
- **Database**: Connection events, query performance
- **File Processing**: Audio upload and processing events
- **API Requests**: Request/response logging
- **Health Checks**: Health check results
- **Errors**: Exception and error tracking

### Web-App Service Logging

#### Log Levels
- **ERROR**: Client-side errors and API failures
- **WARN**: Performance warnings and fallbacks
- **INFO**: User interactions and navigation
- **DEBUG**: Development debugging (development only)

#### Log Categories
- **User Interactions**: Page views, button clicks
- **API Communication**: API request/response events
- **Authentication**: SSO events and session management
- **Performance**: Page load times, bundle sizes
- **Errors**: JavaScript errors and API failures

## Railway.app Integration

### Built-in Monitoring

Railway automatically provides:
- **Service Metrics**: CPU, memory, network usage
- **Deployment Metrics**: Build times, deployment success rates
- **Log Aggregation**: Centralized log collection
- **Alerting**: Basic alerting on service failures

### Custom Monitoring Setup

#### Environment Variables for Monitoring
```bash
# API Service
LOG_LEVEL=INFO
LOG_FORMAT=json
ENABLE_METRICS=true
METRICS_PORT=9090

# Web-App Service
NEXT_PUBLIC_ENABLE_ERROR_REPORTING=true
NEXT_PUBLIC_ENABLE_ANALYTICS=false
```

#### Health Check Configuration
```json
{
  "deploy": {
    "healthcheckPath": "/health",
    "healthcheckTimeout": 300,
    "healthcheckInterval": 30
  }
}
```

## Error Tracking and Alerting

### Error Categories

#### Critical Errors (Immediate Alert)
- Database connection failures
- Authentication service failures
- File system access failures
- Memory/disk space exhaustion

#### Warning Conditions (Monitor)
- High response times
- Increased error rates
- Resource usage above thresholds
- External service degradation

#### Information Events (Log Only)
- User authentication events
- File processing completion
- Configuration changes
- Scheduled maintenance

### Alert Configuration

#### Railway Dashboard Alerts
1. Service down alerts
2. High resource usage alerts
3. Deployment failure alerts
4. Database connection alerts

#### Custom Alert Thresholds
- CPU usage > 80% for 5 minutes
- Memory usage > 90% for 2 minutes
- Error rate > 5% for 1 minute
- Response time > 2 seconds for 3 minutes

## Performance Monitoring

### Key Performance Indicators (KPIs)

#### API Service KPIs
- Average response time < 500ms
- 99th percentile response time < 2s
- Error rate < 1%
- Database connection pool utilization < 80%
- Uptime > 99.9%

#### Web-App Service KPIs
- Page load time < 3s
- Time to interactive < 5s
- API communication success rate > 99%
- Client-side error rate < 0.5%
- Uptime > 99.9%

### Performance Optimization

#### Database Performance
- Monitor slow queries (> 1s)
- Track connection pool usage
- Monitor index usage
- Track query frequency

#### API Performance
- Monitor endpoint response times
- Track request volume patterns
- Monitor external service latency
- Track file processing times

#### Frontend Performance
- Monitor bundle sizes
- Track page load metrics
- Monitor API call patterns
- Track user interaction latency

## Troubleshooting Guide

### Common Issues and Solutions

#### Database Connection Issues
```bash
# Check database health
curl https://your-api.railway.app/health

# View database logs
railway logs --service api | grep database

# Check connection pool status
railway shell --service api
python -c "from app.core.database import check_database_health; print(await check_database_health())"
```

#### API Connectivity Issues
```bash
# Check API health from web-app
curl https://your-webapp.railway.app/api/health

# Check direct API access
curl https://your-api.railway.app/health/live

# View API logs
railway logs --service api
```

#### Authentication Issues
```bash
# Check Microsoft SSO configuration
railway variables --service api | grep MICROSOFT
railway variables --service web-app | grep MICROSOFT

# View authentication logs
railway logs --service api | grep auth
```

#### File Processing Issues
```bash
# Check file system health
curl https://your-api.railway.app/health | jq '.checks.file_system'

# Check upload directory
railway shell --service api
ls -la /app/uploads
df -h
```

### Log Analysis Commands

```bash
# View recent errors
railway logs --service api | grep ERROR

# Monitor real-time logs
railway logs --service api --follow

# Filter by user ID
railway logs --service api | grep "user-123"

# Check performance logs
railway logs --service api | grep "duration_ms"
```

## Maintenance and Updates

### Regular Monitoring Tasks

#### Daily
- Review error logs
- Check service health status
- Monitor resource usage trends
- Verify backup completion

#### Weekly
- Analyze performance trends
- Review alert configurations
- Check for security updates
- Validate monitoring coverage

#### Monthly
- Review and rotate secrets
- Update monitoring thresholds
- Analyze usage patterns
- Plan capacity adjustments

### Monitoring Dashboard Setup

#### Key Metrics Dashboard
- Service uptime status
- Response time trends
- Error rate trends
- Resource usage graphs
- Database performance metrics

#### Alert Dashboard
- Active alerts summary
- Alert history and trends
- Alert response times
- False positive analysis

## Security Monitoring

### Security Events to Monitor

#### Authentication Events
- Failed login attempts
- Unusual login patterns
- Token validation failures
- Session hijacking attempts

#### API Security Events
- Unusual request patterns
- Rate limit violations
- Invalid API key usage
- Suspicious file uploads

#### Infrastructure Security
- Unauthorized access attempts
- Configuration changes
- Certificate expiration warnings
- Dependency vulnerability alerts

### Security Alert Configuration

#### High Priority Alerts
- Multiple failed authentication attempts
- Unusual API usage patterns
- Security configuration changes
- Certificate expiration warnings

#### Medium Priority Alerts
- Rate limit violations
- Suspicious file uploads
- Unusual traffic patterns
- Dependency security updates

This monitoring and logging configuration ensures comprehensive observability of the Meetily web application, enabling proactive issue detection and resolution while maintaining high availability and performance standards.