#!/usr/bin/env python3
"""
Database initialization script for Meetily web application

This script handles:
1. Database connection verification
2. Running migrations
3. Creating initial database schema
4. Setting up indexes and constraints
"""

import asyncio
import sys
import os
import logging
from pathlib import Path

# Add the app directory to Python path
sys.path.append(str(Path(__file__).parent.parent))

from app.core.database import init_database, check_database_health
from app.core.config import settings
from sqlalchemy import create_engine, text
from sqlalchemy.exc import SQLAlchemyError
import subprocess

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

def run_migrations():
    """
    Run Alembic migrations to create/update database schema
    """
    try:
        logger.info("Running database migrations...")
        
        # Change to the API directory for alembic
        api_dir = Path(__file__).parent.parent
        os.chdir(api_dir)
        
        # Run alembic upgrade
        result = subprocess.run(
            ["python", "-m", "alembic", "upgrade", "head"],
            capture_output=True,
            text=True,
            check=True
        )
        
        logger.info("Database migrations completed successfully")
        logger.debug(f"Migration output: {result.stdout}")
        
        return True
        
    except subprocess.CalledProcessError as e:
        logger.error(f"Migration failed: {e}")
        logger.error(f"Error output: {e.stderr}")
        return False
    except Exception as e:
        logger.error(f"Unexpected error during migration: {str(e)}")
        return False

def verify_database_schema():
    """
    Verify that all expected tables and indexes exist
    """
    try:
        logger.info("Verifying database schema...")
        
        # Use synchronous engine for schema verification
        engine = create_engine(
            settings.DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
        )
        
        with engine.connect() as conn:
            # Check for expected tables
            expected_tables = [
                'users', 'user_sessions', 'user_model_configs',
                'meetings', 'transcripts', 'processing_jobs'
            ]
            
            for table in expected_tables:
                result = conn.execute(text(
                    "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = :table_name)"
                ), {"table_name": table})
                
                if not result.scalar():
                    logger.error(f"Table '{table}' does not exist")
                    return False
                else:
                    logger.info(f"Table '{table}' verified")
            
            # Check for critical indexes
            critical_indexes = [
                'ix_users_microsoft_id',
                'ix_meetings_user_id',
                'ix_transcripts_meeting_id',
                'ix_processing_jobs_user_status'
            ]
            
            for index in critical_indexes:
                result = conn.execute(text(
                    "SELECT EXISTS (SELECT FROM pg_indexes WHERE indexname = :index_name)"
                ), {"index_name": index})
                
                if not result.scalar():
                    logger.warning(f"Index '{index}' does not exist")
                else:
                    logger.info(f"Index '{index}' verified")
        
        logger.info("Database schema verification completed")
        return True
        
    except Exception as e:
        logger.error(f"Schema verification failed: {str(e)}")
        return False

async def setup_database():
    """
    Complete database setup process
    """
    logger.info("Starting database setup...")
    logger.info(f"Environment: {settings.ENVIRONMENT}")
    logger.info(f"Database URL: {settings.DATABASE_URL.split('@')[-1]}")  # Hide credentials
    
    try:
        # Step 1: Initialize database connection
        logger.info("Step 1: Initializing database connection...")
        await init_database()
        
        # Step 2: Check database health
        logger.info("Step 2: Checking database health...")
        if not await check_database_health():
            logger.error("Database health check failed")
            return False
        
        # Step 3: Run migrations
        logger.info("Step 3: Running database migrations...")
        if not run_migrations():
            logger.error("Database migration failed")
            return False
        
        # Step 4: Verify schema
        logger.info("Step 4: Verifying database schema...")
        if not verify_database_schema():
            logger.error("Schema verification failed")
            return False
        
        # Step 5: Final health check
        logger.info("Step 5: Final health check...")
        if not await check_database_health():
            logger.error("Final database health check failed")
            return False
        
        logger.info("✅ Database setup completed successfully!")
        return True
        
    except Exception as e:
        logger.error(f"Database setup failed: {str(e)}")
        return False

def print_database_info():
    """
    Print database configuration information
    """
    print("\n" + "="*60)
    print("MEETILY DATABASE INITIALIZATION")
    print("="*60)
    print(f"Environment: {settings.ENVIRONMENT}")
    print(f"Database URL: {settings.DATABASE_URL.split('@')[-1]}")  # Hide credentials
    print(f"Pool Size: {settings.DATABASE_POOL_SIZE}")
    print(f"Max Overflow: {settings.DATABASE_MAX_OVERFLOW}")
    print("="*60)

async def main():
    """
    Main initialization function
    """
    print_database_info()
    
    try:
        success = await setup_database()
        
        if success:
            print("\n✅ Database initialization completed successfully!")
            print("The database is ready for use.")
            sys.exit(0)
        else:
            print("\n❌ Database initialization failed!")
            print("Please check the logs for more information.")
            sys.exit(1)
            
    except KeyboardInterrupt:
        print("\n⚠️ Database initialization cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {str(e)}")
        logger.exception("Unexpected error during database initialization")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())