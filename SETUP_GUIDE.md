# Meetingly Web - Setup and Development Guide

## Overview

This guide covers the complete setup process for the Meetingly Web application, including both local development and production deployment on Railway.app. The application consists of a Next.js frontend (`web-app/`) and a FastAPI backend (`api/`).

## Architecture Quick Reference

Based on the [Architecture Decisions](./ARCHITECTURE_DECISIONS.md):

- **Primary Frontend**: `/web-app/` - Next.js 14.2.25 web application
- **Primary Backend**: `/api/` - FastAPI backend with full feature set
- **Deprecated**: `/frontend/` - Tauri desktop application (archived)
- **Deprecated**: `/backend/` - Minimal FastAPI implementation (archived)

## Prerequisites

### Required Software

- **Node.js**: 18+ LTS (for frontend)
- **Python**: 3.11+ (for backend)
- **PostgreSQL**: 14+ (for database)
- **Redis**: 6+ (for caching and sessions)
- **Git**: Latest version

### Development Tools (Recommended)

- **VS Code** with extensions:
  - Python
  - TypeScript and JavaScript
  - Tailwind CSS IntelliSense
  - REST Client
- **Docker Desktop** (optional, for containerized services)
- **Postman** or **Insomnia** (for API testing)

## Local Development Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-org/meetingly-web.git
cd meetingly-web
```

### 2. Backend Setup (API)

#### Install Python Dependencies

```bash
cd api
python -m venv venv

# Activate virtual environment
# Windows:
venv\Scripts\activate
# macOS/Linux:
source venv/bin/activate

pip install -r requirements.txt
```

#### Database Setup

**Option 1: Local PostgreSQL**

1. Install PostgreSQL 14+
2. Create database:
```sql
CREATE DATABASE meetily_db;
CREATE USER meetily_user WITH PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE meetily_db TO meetily_user;
```

**Option 2: Docker PostgreSQL**

```bash
docker run --name meetily-postgres \
  -e POSTGRES_DB=meetily_db \
  -e POSTGRES_USER=meetily_user \
  -e POSTGRES_PASSWORD=your_password \
  -p 5432:5432 \
  -d postgres:14
```

#### Redis Setup

**Option 1: Local Redis**

Install Redis and start service:
```bash
# macOS
brew install redis
brew services start redis

# Ubuntu
sudo apt install redis-server
sudo systemctl start redis-server
```

**Option 2: Docker Redis**

```bash
docker run --name meetily-redis -p 6379:6379 -d redis:7-alpine
```

#### Environment Configuration

Create `.env` file in `/api/` directory:

```bash
cp .env.example .env
```

Update the `.env` file:

```bash
# Database Configuration
DATABASE_URL=postgresql://meetily_user:your_password@localhost:5432/meetily_db
REDIS_URL=redis://localhost:6379

# Microsoft SSO Configuration (see Azure Setup section)
MICROSOFT_CLIENT_ID=your_azure_client_id
MICROSOFT_CLIENT_SECRET=your_azure_client_secret
MICROSOFT_TENANT_ID=your_azure_tenant_id
MICROSOFT_AUTHORITY=https://login.microsoftonline.com/your_tenant_id
MICROSOFT_SCOPE=openid profile email User.Read

# JWT Configuration
JWT_SECRET_KEY=your_very_secure_random_jwt_secret_key_here_min_32_chars
JWT_ALGORITHM=HS256
JWT_EXPIRE_MINUTES=1440
JWT_REFRESH_EXPIRE_DAYS=30

# Application Configuration
ENVIRONMENT=development
DEBUG=true
API_HOST=0.0.0.0
API_PORT=8000

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:3000,http://127.0.0.1:3000

# File Storage Configuration
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=104857600  # 100MB

# External Services (Optional - users can configure their own)
WHISPER_SERVICE_URL=http://localhost:8080
OPENAI_API_KEY=sk-your_openai_key_here
ANTHROPIC_API_KEY=sk-ant-your_anthropic_key_here
GROQ_API_KEY=gsk_your_groq_key_here

# Logging Configuration
LOG_LEVEL=INFO
LOG_FORMAT=json

# Security Configuration
BCRYPT_ROUNDS=12
SESSION_COOKIE_SECURE=false
SESSION_COOKIE_HTTPONLY=true
SESSION_COOKIE_SAMESITE=lax
```

#### Database Migrations

```bash
# Generate migration (if needed)
alembic revision --autogenerate -m "Initial migration"

# Run migrations
alembic upgrade head
```

#### Start Backend Server

```bash
# Development with auto-reload
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload

# Or using the provided script
python -m app.main
```

The API will be available at: `http://localhost:8000`
- API Documentation: `http://localhost:8000/docs`
- ReDoc Documentation: `http://localhost:8000/redoc`

### 3. Frontend Setup (Web App)

#### Install Node Dependencies

```bash
cd web-app
npm install
```

#### Environment Configuration

Create `.env.local` file in `/web-app/` directory:

```bash
cp .env.example .env.local
```

Update the `.env.local` file:

```bash
# Microsoft SSO Configuration (same as backend)
NEXT_PUBLIC_MICROSOFT_CLIENT_ID=your_azure_client_id
NEXT_PUBLIC_MICROSOFT_TENANT_ID=your_azure_tenant_id
NEXT_PUBLIC_MICROSOFT_AUTHORITY=https://login.microsoftonline.com/your_tenant_id
NEXT_PUBLIC_MICROSOFT_REDIRECT_URI=http://localhost:3000/auth/callback

# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_WS_URL=ws://localhost:8000

# Application Configuration
NODE_ENV=development
NEXT_PUBLIC_APP_NAME=Meetingly
NEXT_PUBLIC_APP_VERSION=1.0.0

# Feature Flags
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_ENABLE_ERROR_REPORTING=false
```

#### Start Frontend Server

```bash
npm run dev
```

The web application will be available at: `http://localhost:3000`

### 4. Microsoft Azure SSO Setup

#### Create Azure AD Application

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory** > **App registrations**
3. Click **New registration**
4. Configure:
   - **Name**: Meetingly Web Application
   - **Supported account types**: Accounts in this organizational directory only
   - **Redirect URI**: Web - `http://localhost:3000/auth/callback`

#### Configure Application

1. **Overview**: Copy the **Application (client) ID** and **Directory (tenant) ID**
2. **Certificates & secrets**: 
   - Create new client secret
   - Copy the secret value
3. **API permissions**:
   - Add **Microsoft Graph** permissions:
     - `openid` (delegated)
     - `profile` (delegated) 
     - `email` (delegated)
     - `User.Read` (delegated)
   - Grant admin consent
4. **Authentication**:
   - Add redirect URIs for different environments:
     - Development: `http://localhost:3000/auth/callback`
     - Production: `https://your-domain.com/auth/callback`
   - Enable **ID tokens** and **Access tokens**

#### Update Environment Variables

Update both backend and frontend `.env` files with the Azure values:

```bash
MICROSOFT_CLIENT_ID=your_application_client_id
MICROSOFT_CLIENT_SECRET=your_client_secret  # Backend only
MICROSOFT_TENANT_ID=your_directory_tenant_id
```

### 5. Development Workflow

#### Running Both Services

**Terminal 1 (Backend):**
```bash
cd api
source venv/bin/activate  # or venv\Scripts\activate on Windows
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 (Frontend):**
```bash
cd web-app
npm run dev
```

**Terminal 3 (Database - if using Docker):**
```bash
docker-compose up postgres redis
```

#### Development Commands

**Backend:**
```bash
# Run tests
pytest

# Format code
black .
isort .

# Type checking
mypy .

# Database migrations
alembic upgrade head
alembic revision --autogenerate -m "Description"

# Start background worker (if using Celery)
celery -A app.core.celery worker --loglevel=info
```

**Frontend:**
```bash
# Development server
npm run dev

# Type checking
npm run type-check

# Linting
npm run lint
npm run lint:fix

# Testing
npm run test
npm run test:watch

# Build for production
npm run build
npm start
```

### 6. Testing the Setup

#### Verify Backend

1. **Health Check**: `curl http://localhost:8000/health`
2. **API Docs**: Open `http://localhost:8000/docs`
3. **Database**: Check tables exist in your PostgreSQL database
4. **Redis**: `redis-cli ping` should return `PONG`

#### Verify Frontend

1. **Application**: Open `http://localhost:3000`
2. **Authentication**: Test Microsoft SSO login flow
3. **API Connection**: Check browser network tab for successful API calls

#### Integration Test

1. **Login**: Complete Microsoft SSO authentication
2. **Upload Audio**: Upload a small audio file
3. **Check Processing**: Verify processing status updates
4. **View Results**: Check transcript and summary generation

## Production Deployment (Railway.app)

### 1. Railway Setup

#### Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

#### Initialize Project

```bash
railway init
railway environment new production
```

### 2. Database and Redis Setup

#### Add Services

```bash
# Add PostgreSQL
railway add --service postgres

# Add Redis
railway add --service redis
```

#### Get Connection Strings

```bash
railway variables
# Note the DATABASE_URL and REDIS_URL values
```

### 3. Backend Deployment

#### Configure Environment Variables

```bash
railway variables set MICROSOFT_CLIENT_ID=your_client_id
railway variables set MICROSOFT_CLIENT_SECRET=your_client_secret
railway variables set MICROSOFT_TENANT_ID=your_tenant_id
railway variables set JWT_SECRET_KEY=your_production_jwt_secret
railway variables set ENVIRONMENT=production
railway variables set DEBUG=false
railway variables set ALLOWED_ORIGINS=https://your-frontend-domain.railway.app
```

#### Deploy Backend

```bash
cd api
railway up
```

#### Run Migrations

```bash
railway run alembic upgrade head
```

### 4. Frontend Deployment

#### Configure Environment Variables

```bash
cd web-app
railway variables set NEXT_PUBLIC_API_URL=https://your-api-domain.railway.app
railway variables set NEXT_PUBLIC_WS_URL=wss://your-api-domain.railway.app
railway variables set NEXT_PUBLIC_MICROSOFT_CLIENT_ID=your_client_id
railway variables set NEXT_PUBLIC_MICROSOFT_TENANT_ID=your_tenant_id
railway variables set NEXT_PUBLIC_MICROSOFT_REDIRECT_URI=https://your-frontend-domain.railway.app/auth/callback
```

#### Deploy Frontend

```bash
railway up
```

### 5. Production Configuration

#### Update Azure Redirect URIs

Add production redirect URI in Azure Portal:
- `https://your-frontend-domain.railway.app/auth/callback`

#### SSL and Security

Railway automatically provides SSL certificates. Ensure:
- All HTTP traffic redirects to HTTPS
- CORS is configured for production domains
- Security headers are enabled

#### Monitoring and Logging

```bash
# View logs
railway logs

# Monitor services
railway status
```

## Troubleshooting

### Common Issues

#### Authentication Issues

**Problem**: Microsoft SSO fails with redirect URI mismatch
**Solution**: 
- Verify redirect URIs in Azure match your environment
- Check HTTPS vs HTTP in production
- Ensure client ID and tenant ID are correct

**Problem**: JWT token validation fails
**Solution**:
- Verify JWT_SECRET_KEY is the same across all instances
- Check token expiration settings
- Ensure clock synchronization

#### Database Issues

**Problem**: Connection refused to PostgreSQL
**Solution**:
- Verify DATABASE_URL format: `postgresql://user:pass@host:port/db`
- Check PostgreSQL is running and accessible
- Verify firewall settings

**Problem**: Migration errors
**Solution**:
```bash
# Reset migrations (development only)
alembic downgrade base
alembic upgrade head

# Check current migration status
alembic current
alembic history
```

#### File Upload Issues

**Problem**: File uploads fail or timeout
**Solution**:
- Check MAX_FILE_SIZE configuration
- Verify upload directory permissions
- Ensure sufficient disk space
- Check network timeout settings

#### WebSocket Connection Issues

**Problem**: Real-time updates not working
**Solution**:
- Verify WebSocket URL uses `ws://` or `wss://`
- Check CORS configuration includes WebSocket origins
- Verify JWT token is passed correctly
- Check for proxy/firewall WebSocket blocking

#### Performance Issues

**Problem**: Slow API responses
**Solution**:
- Check database query performance
- Verify Redis is connected and working
- Monitor CPU and memory usage
- Check for database connection pool exhaustion
- Review database indexes

### Development Tips

#### Hot Reloading

Both backend and frontend support hot reloading:
- **Backend**: `--reload` flag with uvicorn
- **Frontend**: Built into Next.js dev server

#### Database Debugging

```bash
# Connect to database directly
psql $DATABASE_URL

# View recent logs
tail -f /var/log/postgresql/postgresql.log

# Check active connections
SELECT * FROM pg_stat_activity;
```

#### API Testing

Use the built-in API documentation:
- **Swagger UI**: `http://localhost:8000/docs`
- **ReDoc**: `http://localhost:8000/redoc`

Or use curl/httpie:

```bash
# Health check
curl http://localhost:8000/health

# Test authentication (replace with actual token)
curl -H "Authorization: Bearer your_jwt_token" \
     http://localhost:8000/api/v1/meetings
```

#### Frontend Debugging

```bash
# Check build output
npm run build

# Analyze bundle size
npm run build:analyze

# Check TypeScript errors
npm run type-check
```

### Logging and Monitoring

#### Backend Logging

Logs are structured JSON in production:

```python
import logging
logger = logging.getLogger(__name__)

# Use structured logging
logger.info("User authenticated", extra={
    "user_id": user.id,
    "tenant_id": user.tenant_id,
    "action": "login"
})
```

#### Frontend Monitoring

Enable error reporting and analytics in production:

```javascript
// .env.local
NEXT_PUBLIC_ENABLE_ERROR_REPORTING=true
NEXT_PUBLIC_ENABLE_ANALYTICS=true
```

#### Health Monitoring

Set up monitoring for:
- **API Health**: `GET /health/detailed`
- **Database Connectivity**: Connection pool status
- **Redis Connectivity**: Cache hit rates
- **File Storage**: Available disk space
- **Processing Jobs**: Queue depths and success rates

## Advanced Configuration

### Custom Whisper Server

To use the custom C++ Whisper server:

1. **Build Whisper Server**:
```bash
cd backend/whisper-custom
./build_whisper.sh  # or build_whisper.cmd on Windows
```

2. **Start Whisper Server**:
```bash
./server/whisper-server --port 8080 --model models/ggml-base.bin
```

3. **Configure API**:
```bash
WHISPER_SERVICE_URL=http://localhost:8080
```

### Multi-Provider AI Setup

Configure multiple AI providers for enhanced summaries:

```bash
# OpenAI
OPENAI_API_KEY=sk-your_key

# Anthropic
ANTHROPIC_API_KEY=sk-ant-your_key

# Groq
GROQ_API_KEY=gsk_your_key

# Local Ollama (if running)
OLLAMA_BASE_URL=http://localhost:11434
```

### Background Job Processing

For production scale, use Celery for background processing:

1. **Install Celery**:
```bash
pip install celery[redis]
```

2. **Start Worker**:
```bash
celery -A app.core.celery worker --loglevel=info
```

3. **Start Beat Scheduler**:
```bash
celery -A app.core.celery beat --loglevel=info
```

### Docker Development

Alternative setup using Docker Compose:

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Security Considerations

### Development Security

- Never commit secrets to version control
- Use different secrets for development and production
- Regularly rotate API keys and JWT secrets
- Keep dependencies updated

### Production Security

- Use HTTPS everywhere
- Implement proper CORS policies
- Set secure cookie flags
- Enable security headers
- Regular security audits
- Monitor for suspicious activity

## Getting Help

### Resources

- **API Documentation**: `/API_DOCUMENTATION.md`
- **Architecture Decisions**: `/ARCHITECTURE_DECISIONS.md`
- **Railway Documentation**: https://docs.railway.app
- **FastAPI Documentation**: https://fastapi.tiangolo.com
- **Next.js Documentation**: https://nextjs.org/docs

### Support Channels

- **GitHub Issues**: For bugs and feature requests
- **Discussions**: For general questions and help
- **Email**: For security issues and private inquiries

### Contributing

See `CONTRIBUTING.md` for guidelines on:
- Code style and standards
- Testing requirements
- Pull request process
- Documentation updates

---

This setup guide should get you from zero to a fully functional Meetingly Web application. If you encounter issues not covered here, please check the troubleshooting section or create an issue on GitHub.