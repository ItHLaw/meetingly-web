# Railway.app Deployment Guide

This document provides comprehensive instructions for deploying the Meetily web application to Railway.app.

## Overview

The application consists of two main services:
- **web-app**: Next.js frontend application
- **api**: FastAPI backend application

Plus two managed services:
- **PostgreSQL**: Database service
- **Redis**: Cache and session storage

## Prerequisites

1. Railway.app account
2. Railway CLI installed (`npm install -g @railway/cli`)
3. Microsoft Azure AD application configured
4. Required environment variables (see sections below)

## Deployment Steps

### 1. Initial Setup

```bash
# Login to Railway
railway login

# Link to existing project or create new one
railway link
# OR
railway init
```

### 2. Environment Variables Setup

#### Required Secrets (Set via Railway Dashboard)

These sensitive variables must be set through the Railway dashboard:

**For API Service:**
- `MICROSOFT_CLIENT_SECRET`: Azure AD application client secret
- `JWT_SECRET_KEY`: Secure random string for JWT signing (generate with `openssl rand -hex 32`)

**For Web-App Service:**
- `NEXT_PUBLIC_MICROSOFT_CLIENT_ID`: Azure AD application client ID
- `NEXT_PUBLIC_MICROSOFT_TENANT_ID`: Azure AD tenant ID or "common"
- `NEXT_PUBLIC_MICROSOFT_AUTHORITY`: `https://login.microsoftonline.com/{tenant_id}`

#### Auto-configured Variables

These are automatically set by Railway:
- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `RAILWAY_PUBLIC_DOMAIN`: Public domain for each service

### 3. Deploy Services

```bash
# Deploy the entire project
railway up

# Or deploy individual services
railway up --service api
railway up --service web-app
```

### 4. Database Setup

After initial deployment, run database migrations:

```bash
# Connect to API service
railway shell --service api

# Run migrations (if using Alembic)
alembic upgrade head

# Or run initialization script
python scripts/init_db.py
```

## Service Configuration

### API Service Configuration

The API service includes:
- FastAPI backend with Microsoft SSO authentication
- Audio processing with Whisper integration
- WebSocket support for real-time updates
- File upload handling with secure storage

**Health Check:** `/health`
**Port:** 8000

### Web-App Service Configuration

The web-app service includes:
- Next.js frontend with server-side rendering
- Microsoft SSO integration
- Real-time WebSocket connections
- Responsive design for all devices

**Health Check:** `/api/health`
**Port:** 3000

## Environment Variables Reference

### API Service Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `ENVIRONMENT` | Application environment | `production` | Yes |
| `DEBUG` | Enable debug mode | `false` | No |
| `PORT` | Server port | `8000` | Yes |
| `API_HOST` | Server host | `0.0.0.0` | Yes |
| `DATABASE_URL` | PostgreSQL connection | Auto-set | Yes |
| `REDIS_URL` | Redis connection | Auto-set | Yes |
| `MICROSOFT_CLIENT_SECRET` | Azure AD client secret | - | Yes |
| `JWT_SECRET_KEY` | JWT signing key | - | Yes |
| `JWT_ALGORITHM` | JWT algorithm | `HS256` | No |
| `JWT_EXPIRE_MINUTES` | JWT expiration | `1440` | No |
| `ALLOWED_ORIGINS` | CORS origins | Auto-set | Yes |
| `UPLOAD_DIR` | File upload directory | `/app/uploads` | No |
| `MAX_FILE_SIZE` | Max upload size | `52428800` | No |
| `LOG_LEVEL` | Logging level | `INFO` | No |
| `SESSION_COOKIE_SECURE` | Secure cookies | `true` | No |

### Web-App Service Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `NODE_ENV` | Node environment | `production` | Yes |
| `PORT` | Server port | `3000` | Yes |
| `NEXT_PUBLIC_API_URL` | API service URL | Auto-set | Yes |
| `NEXT_PUBLIC_WS_URL` | WebSocket URL | Auto-set | Yes |
| `NEXT_PUBLIC_MICROSOFT_CLIENT_ID` | Azure AD client ID | - | Yes |
| `NEXT_PUBLIC_MICROSOFT_TENANT_ID` | Azure AD tenant ID | - | Yes |
| `NEXT_PUBLIC_MICROSOFT_AUTHORITY` | Azure AD authority | - | Yes |
| `NEXT_PUBLIC_MICROSOFT_REDIRECT_URI` | OAuth redirect URI | Auto-set | Yes |
| `NEXT_PUBLIC_APP_NAME` | Application name | `Meetily` | No |
| `NEXT_PUBLIC_ENABLE_ERROR_REPORTING` | Error reporting | `true` | No |

## Monitoring and Logging

### Health Checks

Both services include health check endpoints:
- API: `GET /health`
- Web-App: `GET /api/health`

Health checks verify:
- Service responsiveness
- Database connectivity
- Redis connectivity
- External service availability

### Logging Configuration

Logs are automatically collected by Railway and available in the dashboard.

**Log Levels:**
- `ERROR`: Error conditions
- `WARN`: Warning conditions
- `INFO`: Informational messages
- `DEBUG`: Debug information (staging only)

### Metrics and Monitoring

Railway provides built-in monitoring for:
- CPU usage
- Memory usage
- Network traffic
- Response times
- Error rates

## Scaling Configuration

### Horizontal Scaling

```json
{
  "deploy": {
    "numReplicas": 1,
    "sleepApplication": false
  }
}
```

For production workloads, consider:
- API service: 2-3 replicas
- Web-app service: 1-2 replicas

### Vertical Scaling

Railway automatically handles vertical scaling based on resource usage.

## Security Configuration

### HTTPS and SSL

- All traffic is automatically encrypted with TLS
- HTTPS is enforced for all services
- Secure cookies are enabled in production

### CORS Configuration

CORS is configured to allow requests only from the web-app service domain.

### File Upload Security

- File type validation
- Size limits enforced
- Secure file storage with access controls

## Troubleshooting

### Common Issues

1. **Database Connection Errors**
   - Verify `DATABASE_URL` is set correctly
   - Check database service status
   - Run database migrations

2. **Authentication Issues**
   - Verify Microsoft SSO configuration
   - Check redirect URIs in Azure AD
   - Validate JWT secret key

3. **File Upload Issues**
   - Check upload directory permissions
   - Verify file size limits
   - Ensure storage volume is mounted

### Debug Commands

```bash
# View service logs
railway logs --service api
railway logs --service web-app

# Connect to service shell
railway shell --service api

# Check environment variables
railway variables --service api

# Restart service
railway redeploy --service api
```

## Backup and Recovery

### Database Backups

Railway automatically creates daily backups of PostgreSQL databases.

### Manual Backup

```bash
# Create manual backup
railway pg:backup create

# List backups
railway pg:backup list

# Restore from backup
railway pg:backup restore <backup-id>
```

### File Storage Backup

Implement regular backups of uploaded files:

```bash
# Example backup script
railway shell --service api
tar -czf backup-$(date +%Y%m%d).tar.gz /app/uploads
```

## Performance Optimization

### Database Optimization

- Use connection pooling
- Implement proper indexing
- Monitor query performance

### Caching Strategy

- Redis for session storage
- Application-level caching
- CDN for static assets

### File Storage Optimization

- Implement file compression
- Use efficient file formats
- Consider external storage for large files

## Maintenance

### Regular Tasks

1. Monitor service health and performance
2. Review and rotate secrets regularly
3. Update dependencies and security patches
4. Monitor storage usage and cleanup old files
5. Review logs for errors and performance issues

### Update Deployment

```bash
# Update specific service
railway up --service api

# Update all services
railway up

# Rollback if needed
railway rollback --service api
```