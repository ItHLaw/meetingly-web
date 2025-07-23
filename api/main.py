from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.middleware.httpsredirect import HTTPSRedirectMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from contextlib import asynccontextmanager
import os
import logging
from datetime import datetime
from dotenv import load_dotenv

from app.core.config import settings
from app.core.database import init_database, close_database, check_database_health, engine, Base
from app.api.routes import auth, meetings, audio, config, websocket, migration
from app.api.routes.v1 import meetings as v1_meetings, audio as v1_audio
from app.middleware.auth import AuthMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security import SecurityHeadersMiddleware, CSRFProtectionMiddleware, InputValidationMiddleware
from app.middleware.error_handling import setup_error_handlers

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL),
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Starting up Meetily API...")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"Version: {settings.APP_VERSION}")
    
    try:
        # Initialize database connection
        logger.info("Initializing database connection...")
        await init_database()
        
        # In development, create tables if they don't exist
        if settings.ENVIRONMENT == "development":
            logger.info("Development mode: Creating database tables if needed...")
            async with engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
        
        # Verify database health
        if await check_database_health():
            logger.info("✅ Database connection verified")
        else:
            logger.error("❌ Database health check failed")
            raise Exception("Database health check failed")
        
        logger.info("✅ Meetily API startup completed successfully")
        
    except Exception as e:
        logger.error(f"❌ Startup failed: {str(e)}")
        raise
    
    yield
    
    # Shutdown
    logger.info("Shutting down Meetily API...")
    try:
        await close_database()
        logger.info("✅ Database connections closed")
    except Exception as e:
        logger.error(f"Error during shutdown: {str(e)}")
    logger.info("✅ Meetily API shutdown completed")

# Create FastAPI app
app = FastAPI(
    title=settings.APP_NAME,
    description="Meeting transcription web application with Microsoft SSO and user isolation",
    version=settings.APP_VERSION,
    lifespan=lifespan,
    debug=settings.DEBUG,
    docs_url="/docs" if settings.ENVIRONMENT != "production" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT != "production" else None
)

# Add security middleware
app.add_middleware(TrustedHostMiddleware, allowed_hosts=settings.ALLOWED_HOSTS)

# Add HTTPS redirect in production
if settings.ENVIRONMENT == "production":
    app.add_middleware(HTTPSRedirectMiddleware)

# Add CORS middleware with enhanced security
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
    allow_headers=[
        "Authorization", 
        "Content-Type", 
        "Accept", 
        "Origin", 
        "User-Agent", 
        "X-Requested-With", 
        "X-CSRF-Token"
    ],
    expose_headers=[
        "X-RateLimit-Limit", 
        "X-RateLimit-Remaining", 
        "X-RateLimit-Reset"
    ],
    max_age=600,  # Cache preflight requests for 10 minutes
)

# Add rate limiting middleware
app.add_middleware(RateLimitMiddleware)

# Add compression middleware
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Add security middleware
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(InputValidationMiddleware)

# Add CSRF protection in production
if settings.ENVIRONMENT == "production" and settings.CSRF_PROTECTION:
    app.add_middleware(CSRFProtectionMiddleware)

# Add API versioning middleware
from app.middleware.versioning import APIVersioningMiddleware
app.add_middleware(APIVersioningMiddleware)

# Add custom auth middleware
app.add_middleware(AuthMiddleware)

# Setup error handlers
setup_error_handlers(app)

# Include routers
app.include_router(auth.router, prefix="/auth", tags=["authentication"])

# V2 API (current)
app.include_router(meetings.router, prefix="/api/meetings", tags=["meetings-v2"])
app.include_router(audio.router, prefix="/api/audio", tags=["audio-v2"])
app.include_router(config.router, prefix="/api/config", tags=["configuration"])
app.include_router(migration.router, prefix="/api/migration", tags=["migration"])
app.include_router(websocket.router, prefix="/api", tags=["websocket"])

# V1 API (legacy compatibility)
app.include_router(v1_meetings.router, prefix="/api/v1", tags=["meetings-v1-legacy"])
app.include_router(v1_audio.router, prefix="/api/v1/audio", tags=["audio-v1-legacy"])

# Legacy endpoints without version prefix (v1 compatibility)
app.include_router(v1_meetings.router, prefix="", tags=["meetings-v1-legacy-unversioned"])
app.include_router(v1_audio.router, prefix="/audio", tags=["audio-v1-legacy-unversioned"])

@app.get("/")
async def root():
    return {"message": "Meetily API is running"}

@app.get("/health")
async def health_check():
    """
    Comprehensive health check endpoint for Railway.app monitoring
    """
    import psutil
    import redis
    from app.core.database import get_redis_client
    
    health_status = {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "environment": settings.ENVIRONMENT,
        "app_name": settings.APP_NAME,
        "timestamp": str(datetime.now()),
        "uptime": str(datetime.now() - datetime.fromtimestamp(psutil.boot_time())),
        "checks": {},
        "metrics": {}
    }
    
    # System metrics
    try:
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')
        
        health_status["metrics"] = {
            "cpu_usage_percent": cpu_percent,
            "memory_usage_percent": memory.percent,
            "memory_available_mb": memory.available // (1024 * 1024),
            "disk_usage_percent": disk.percent,
            "disk_free_gb": disk.free // (1024 * 1024 * 1024)
        }
    except Exception as e:
        logger.warning(f"Could not collect system metrics: {str(e)}")
    
    # Database health check
    try:
        db_healthy = await check_database_health()
        health_status["checks"]["database"] = {
            "status": "healthy" if db_healthy else "unhealthy",
            "message": "Database connection OK" if db_healthy else "Database connection failed",
            "response_time_ms": 0  # Could add timing here
        }
        
        if not db_healthy:
            health_status["status"] = "unhealthy"
            
    except Exception as e:
        health_status["checks"]["database"] = {
            "status": "unhealthy",
            "message": f"Database check failed: {str(e)}",
            "response_time_ms": None
        }
        health_status["status"] = "unhealthy"
    
    # Redis health check
    try:
        redis_client = await get_redis_client()
        if redis_client:
            await redis_client.ping()
            health_status["checks"]["redis"] = {
                "status": "healthy",
                "message": "Redis connection OK",
                "response_time_ms": 0  # Could add timing here
            }
        else:
            health_status["checks"]["redis"] = {
                "status": "unhealthy",
                "message": "Redis client not available"
            }
            health_status["status"] = "unhealthy"
    except Exception as e:
        health_status["checks"]["redis"] = {
            "status": "unhealthy",
            "message": f"Redis check failed: {str(e)}"
        }
        health_status["status"] = "unhealthy"
    
    # File system check
    try:
        upload_dir = settings.UPLOAD_DIR
        if os.path.exists(upload_dir) and os.access(upload_dir, os.W_OK):
            health_status["checks"]["file_system"] = {
                "status": "healthy",
                "message": "Upload directory accessible",
                "upload_dir": upload_dir
            }
        else:
            health_status["checks"]["file_system"] = {
                "status": "unhealthy",
                "message": f"Upload directory not accessible: {upload_dir}"
            }
            health_status["status"] = "unhealthy"
    except Exception as e:
        health_status["checks"]["file_system"] = {
            "status": "unhealthy",
            "message": f"File system check failed: {str(e)}"
        }
        health_status["status"] = "unhealthy"
    
    # Environment variables check
    required_env_vars = [
        "DATABASE_URL",
        "JWT_SECRET_KEY",
        "MICROSOFT_CLIENT_ID"
    ]
    
    missing_vars = []
    for var in required_env_vars:
        if not os.getenv(var):
            missing_vars.append(var)
    
    if missing_vars:
        health_status["checks"]["environment"] = {
            "status": "unhealthy",
            "message": f"Missing required environment variables: {', '.join(missing_vars)}"
        }
        health_status["status"] = "unhealthy"
    else:
        health_status["checks"]["environment"] = {
            "status": "healthy",
            "message": "All required environment variables present"
        }
    
    # Return appropriate HTTP status
    status_code = 200 if health_status["status"] == "healthy" else 503
    
    if status_code != 200:
        raise HTTPException(status_code=status_code, detail=health_status)
    
    return health_status

@app.get("/health/ready")
async def readiness_check():
    """
    Readiness check for Railway.app - simpler check for load balancer
    """
    try:
        # Quick database ping
        db_healthy = await check_database_health()
        if not db_healthy:
            raise HTTPException(status_code=503, detail="Database not ready")
        
        return {"status": "ready", "timestamp": str(datetime.now())}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Service not ready: {str(e)}")

@app.get("/health/live")
async def liveness_check():
    """
    Liveness check for Railway.app - basic service availability
    """
    return {
        "status": "alive",
        "timestamp": str(datetime.now()),
        "version": settings.APP_VERSION
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development"
    )