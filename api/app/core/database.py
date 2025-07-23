from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.pool import QueuePool, NullPool
from sqlalchemy import event
from app.core.config import settings
import logging
import asyncio
import redis.asyncio as redis

logger = logging.getLogger(__name__)

def get_database_url() -> str:
    """
    Get properly formatted database URL for async connection
    """
    url = settings.DATABASE_URL
    
    # Handle Railway PostgreSQL URL format
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    elif not url.startswith("postgresql+asyncpg://"):
        # Ensure we're using asyncpg driver
        if url.startswith("postgres://"):
            url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    
    logger.info(f"Database URL configured for environment: {settings.ENVIRONMENT}")
    return url

def create_engine():
    """
    Create database engine with optimized connection pooling
    """
    database_url = get_database_url()
    
    # Connection pool configuration
    pool_config = {}
    
    if settings.ENVIRONMENT == "production":
        # Production settings with connection pooling
        pool_config.update({
            "poolclass": QueuePool,
            "pool_size": settings.DATABASE_POOL_SIZE,
            "max_overflow": settings.DATABASE_MAX_OVERFLOW,
            "pool_timeout": 30,
            "pool_recycle": 3600,  # Recycle connections after 1 hour
            "pool_pre_ping": True,  # Verify connections before use
        })
        logger.info(f"Production database pool: size={settings.DATABASE_POOL_SIZE}, overflow={settings.DATABASE_MAX_OVERFLOW}")
    else:
        # Development settings - simpler pooling
        pool_config.update({
            "poolclass": QueuePool,
            "pool_size": 5,
            "max_overflow": 10,
            "pool_timeout": 30,
            "pool_pre_ping": True,
        })
        logger.info("Development database pool configured")
    
    # Create the engine
    engine = create_async_engine(
        database_url,
        echo=settings.DEBUG and settings.ENVIRONMENT != "production",
        **pool_config
    )
    
    return engine

# Create async engine with connection pooling
engine = create_engine()

# Add connection event listeners for monitoring
@event.listens_for(engine.sync_engine, "connect")
def receive_connect(dbapi_connection, connection_record):
    """Log successful database connections"""
    logger.debug("Database connection established")

@event.listens_for(engine.sync_engine, "checkout")
def receive_checkout(dbapi_connection, connection_record, connection_proxy):
    """Log connection checkout from pool"""
    logger.debug("Connection checked out from pool")

@event.listens_for(engine.sync_engine, "checkin")
def receive_checkin(dbapi_connection, connection_record):
    """Log connection checkin to pool"""
    logger.debug("Connection checked in to pool")

# Create session factory
AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=True,
    autocommit=False
)

# Create base class for models
Base = declarative_base()

# Database session dependency
async def get_db() -> AsyncSession:
    """
    Dependency to get database session with proper error handling
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception as e:
            await session.rollback()
            logger.error(f"Database session error: {str(e)}")
            raise
        finally:
            await session.close()

# Database health check
async def check_database_health() -> bool:
    """
    Check database connectivity for health checks
    """
    try:
        async with AsyncSessionLocal() as session:
            # Simple query to check connectivity
            await session.execute("SELECT 1")
            return True
    except Exception as e:
        logger.error(f"Database health check failed: {str(e)}")
        return False

# Database initialization
async def init_database():
    """
    Initialize database connection and verify connectivity
    """
    try:
        logger.info("Initializing database connection...")
        
        # Test connection
        async with AsyncSessionLocal() as session:
            result = await session.execute("SELECT version()")
            version = result.scalar()
            logger.info(f"Connected to PostgreSQL: {version}")
        
        logger.info("Database connection initialized successfully")
        return True
        
    except Exception as e:
        logger.error(f"Failed to initialize database: {str(e)}")
        raise

# Redis client management
_redis_client = None

async def get_redis_client():
    """
    Get Redis client with connection pooling
    """
    global _redis_client
    
    if _redis_client is None:
        try:
            if settings.REDIS_URL:
                _redis_client = redis.from_url(
                    settings.REDIS_URL,
                    encoding="utf-8",
                    decode_responses=True,
                    max_connections=20
                )
                logger.info("Redis client initialized")
            else:
                logger.warning("Redis URL not configured")
                return None
        except Exception as e:
            logger.error(f"Failed to initialize Redis client: {str(e)}")
            return None
    
    return _redis_client

async def check_redis_health() -> bool:
    """
    Check Redis connectivity for health checks
    """
    try:
        client = await get_redis_client()
        if client:
            await client.ping()
            return True
        return False
    except Exception as e:
        logger.error(f"Redis health check failed: {str(e)}")
        return False

# Graceful shutdown
async def close_database():
    """
    Close database connections gracefully
    """
    global _redis_client
    
    try:
        logger.info("Closing database connections...")
        await engine.dispose()
        logger.info("Database connections closed successfully")
        
        # Close Redis connection
        if _redis_client:
            await _redis_client.close()
            _redis_client = None
            logger.info("Redis connection closed successfully")
            
    except Exception as e:
        logger.error(f"Error closing database connections: {str(e)}")