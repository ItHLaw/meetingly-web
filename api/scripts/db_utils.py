#!/usr/bin/env python3
"""
Database utilities for Meetily web application

Provides commands for:
- Database initialization and setup
- Running migrations
- Database health checks
- User management
- Data cleanup and maintenance
"""

import asyncio
import sys
import os
import argparse
import logging
from pathlib import Path
from typing import Optional
from datetime import datetime, timedelta

# Add the app directory to Python path
sys.path.append(str(Path(__file__).parent.parent))

from app.core.database import AsyncSessionLocal, init_database, check_database_health, close_database
from app.core.config import settings
from app.models import User, UserSession, Meeting, ProcessingJob, Transcript
from sqlalchemy import select, delete, func, and_
import subprocess

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class DatabaseManager:
    """Database management utility class"""
    
    def __init__(self):
        self.session = None
    
    async def __aenter__(self):
        await init_database()
        self.session = AsyncSessionLocal()
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()
        await close_database()

    async def health_check(self) -> bool:
        """Perform comprehensive database health check"""
        logger.info("Performing database health check...")
        
        try:
            # Basic connectivity
            if not await check_database_health():
                logger.error("Basic database connectivity failed")
                return False
            
            # Check table counts
            async with self.session as session:
                user_count = await session.execute(select(func.count(User.id)))
                meeting_count = await session.execute(select(func.count(Meeting.id)))
                job_count = await session.execute(select(func.count(ProcessingJob.id)))
                
                logger.info(f"Database statistics:")
                logger.info(f"  Users: {user_count.scalar()}")
                logger.info(f"  Meetings: {meeting_count.scalar()}")
                logger.info(f"  Processing Jobs: {job_count.scalar()}")
            
            logger.info("✅ Database health check passed")
            return True
            
        except Exception as e:
            logger.error(f"Health check failed: {str(e)}")
            return False

    async def cleanup_expired_sessions(self, dry_run: bool = False) -> int:
        """Clean up expired user sessions"""
        logger.info("Cleaning up expired sessions...")
        
        try:
            now = datetime.utcnow()
            
            async with self.session as session:
                # Find expired sessions
                expired_query = select(UserSession).where(UserSession.expires_at < now)
                result = await session.execute(expired_query)
                expired_sessions = result.scalars().all()
                
                logger.info(f"Found {len(expired_sessions)} expired sessions")
                
                if not dry_run and expired_sessions:
                    # Delete expired sessions
                    delete_query = delete(UserSession).where(UserSession.expires_at < now)
                    result = await session.execute(delete_query)
                    await session.commit()
                    logger.info(f"Deleted {result.rowcount} expired sessions")
                    return result.rowcount
                else:
                    logger.info("Dry run - no sessions deleted")
                    return len(expired_sessions)
                    
        except Exception as e:
            logger.error(f"Session cleanup failed: {str(e)}")
            return 0

    async def cleanup_old_jobs(self, days: int = 30, dry_run: bool = False) -> int:
        """Clean up old completed/failed processing jobs"""
        logger.info(f"Cleaning up processing jobs older than {days} days...")
        
        try:
            cutoff_date = datetime.utcnow() - timedelta(days=days)
            
            async with self.session as session:
                # Find old completed/failed jobs
                old_jobs_query = select(ProcessingJob).where(
                    and_(
                        ProcessingJob.created_at < cutoff_date,
                        ProcessingJob.status.in_(['completed', 'failed', 'cancelled'])
                    )
                )
                result = await session.execute(old_jobs_query)
                old_jobs = result.scalars().all()
                
                logger.info(f"Found {len(old_jobs)} old processing jobs")
                
                if not dry_run and old_jobs:
                    # Delete old jobs
                    delete_query = delete(ProcessingJob).where(
                        and_(
                            ProcessingJob.created_at < cutoff_date,
                            ProcessingJob.status.in_(['completed', 'failed', 'cancelled'])
                        )
                    )
                    result = await session.execute(delete_query)
                    await session.commit()
                    logger.info(f"Deleted {result.rowcount} old processing jobs")
                    return result.rowcount
                else:
                    logger.info("Dry run - no jobs deleted")
                    return len(old_jobs)
                    
        except Exception as e:
            logger.error(f"Job cleanup failed: {str(e)}")
            return 0

    async def list_users(self, limit: int = 50) -> None:
        """List users in the system"""
        logger.info(f"Listing users (limit: {limit})...")
        
        try:
            async with self.session as session:
                query = select(User).limit(limit).order_by(User.created_at.desc())
                result = await session.execute(query)
                users = result.scalars().all()
                
                print(f"\n{'ID':<36} {'Name':<25} {'Email':<30} {'Active':<8} {'Created':<20}")
                print("-" * 120)
                
                for user in users:
                    print(f"{user.id} {user.name:<25} {user.email:<30} {user.is_active:<8} {user.created_at.strftime('%Y-%m-%d %H:%M'):<20}")
                
                print(f"\nTotal users shown: {len(users)}")
                
        except Exception as e:
            logger.error(f"Failed to list users: {str(e)}")

    async def user_stats(self, user_id: str) -> None:
        """Show detailed statistics for a specific user"""
        logger.info(f"Getting statistics for user: {user_id}")
        
        try:
            async with self.session as session:
                # Get user
                user_query = select(User).where(User.id == user_id)
                user_result = await session.execute(user_query)
                user = user_result.scalar_one_or_none()
                
                if not user:
                    logger.error(f"User {user_id} not found")
                    return
                
                # Get statistics
                meeting_count = await session.execute(
                    select(func.count(Meeting.id)).where(Meeting.user_id == user_id)
                )
                
                transcript_count = await session.execute(
                    select(func.count(Transcript.id)).where(Transcript.user_id == user_id)
                )
                
                job_count = await session.execute(
                    select(func.count(ProcessingJob.id)).where(ProcessingJob.user_id == user_id)
                )
                
                session_count = await session.execute(
                    select(func.count(UserSession.id)).where(UserSession.user_id == user_id)
                )
                
                print(f"\nUser Statistics for {user.name} ({user.email})")
                print("-" * 50)
                print(f"User ID: {user.id}")
                print(f"Microsoft ID: {user.microsoft_id}")
                print(f"Tenant ID: {user.tenant_id}")
                print(f"Active: {user.is_active}")
                print(f"Created: {user.created_at}")
                print(f"Last Login: {user.last_login_at or 'Never'}")
                print(f"\nData Statistics:")
                print(f"  Meetings: {meeting_count.scalar()}")
                print(f"  Transcript Segments: {transcript_count.scalar()}")
                print(f"  Processing Jobs: {job_count.scalar()}")
                print(f"  Active Sessions: {session_count.scalar()}")
                
        except Exception as e:
            logger.error(f"Failed to get user statistics: {str(e)}")

    async def reset_processing_jobs(self, status: str = "pending") -> int:
        """Reset stuck processing jobs to pending status"""
        logger.info(f"Resetting stuck processing jobs to {status}...")
        
        try:
            async with self.session as session:
                # Find stuck jobs (running for more than 1 hour)
                cutoff_time = datetime.utcnow() - timedelta(hours=1)
                
                stuck_jobs_query = select(ProcessingJob).where(
                    and_(
                        ProcessingJob.status == "running",
                        ProcessingJob.started_at < cutoff_time
                    )
                )
                
                result = await session.execute(stuck_jobs_query)
                stuck_jobs = result.scalars().all()
                
                logger.info(f"Found {len(stuck_jobs)} stuck jobs")
                
                if stuck_jobs:
                    # Reset stuck jobs
                    for job in stuck_jobs:
                        job.status = status
                        job.started_at = None
                        job.progress = 0
                        job.current_step = None
                        job.error_message = "Reset due to timeout"
                    
                    await session.commit()
                    logger.info(f"Reset {len(stuck_jobs)} stuck jobs")
                    return len(stuck_jobs)
                else:
                    logger.info("No stuck jobs found")
                    return 0
                    
        except Exception as e:
            logger.error(f"Failed to reset processing jobs: {str(e)}")
            return 0

def run_migrations():
    """Run database migrations"""
    try:
        logger.info("Running database migrations...")
        api_dir = Path(__file__).parent.parent
        os.chdir(api_dir)
        
        result = subprocess.run(
            ["python", "-m", "alembic", "upgrade", "head"],
            capture_output=True,
            text=True,
            check=True
        )
        
        logger.info("Migrations completed successfully")
        return True
        
    except subprocess.CalledProcessError as e:
        logger.error(f"Migration failed: {e}")
        logger.error(f"Error output: {e.stderr}")
        return False

async def main():
    """Main CLI function"""
    parser = argparse.ArgumentParser(description="Meetily Database Utilities")
    
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Health check command
    subparsers.add_parser('health', help='Perform database health check')
    
    # Migration command
    subparsers.add_parser('migrate', help='Run database migrations')
    
    # Cleanup commands
    cleanup_parser = subparsers.add_parser('cleanup', help='Database cleanup operations')
    cleanup_parser.add_argument('--sessions', action='store_true', help='Clean up expired sessions')
    cleanup_parser.add_argument('--jobs', type=int, metavar='DAYS', help='Clean up old jobs (specify days)')
    cleanup_parser.add_argument('--dry-run', action='store_true', help='Show what would be cleaned without doing it')
    
    # User management commands
    users_parser = subparsers.add_parser('users', help='User management operations')
    users_parser.add_argument('--list', action='store_true', help='List users')
    users_parser.add_argument('--stats', metavar='USER_ID', help='Show user statistics')
    users_parser.add_argument('--limit', type=int, default=50, help='Limit for list operations')
    
    # Job management commands
    jobs_parser = subparsers.add_parser('jobs', help='Processing job management')
    jobs_parser.add_argument('--reset', action='store_true', help='Reset stuck jobs')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    try:
        if args.command == 'health':
            async with DatabaseManager() as db:
                success = await db.health_check()
                sys.exit(0 if success else 1)
                
        elif args.command == 'migrate':
            success = run_migrations()
            sys.exit(0 if success else 1)
            
        elif args.command == 'cleanup':
            async with DatabaseManager() as db:
                if args.sessions:
                    count = await db.cleanup_expired_sessions(dry_run=args.dry_run)
                    print(f"{'Would clean' if args.dry_run else 'Cleaned'} {count} expired sessions")
                
                if args.jobs:
                    count = await db.cleanup_old_jobs(days=args.jobs, dry_run=args.dry_run)
                    print(f"{'Would clean' if args.dry_run else 'Cleaned'} {count} old jobs")
                
                if not args.sessions and not args.jobs:
                    print("Specify --sessions or --jobs <days>")
                    
        elif args.command == 'users':
            async with DatabaseManager() as db:
                if args.list:
                    await db.list_users(limit=args.limit)
                elif args.stats:
                    await db.user_stats(args.stats)
                else:
                    print("Specify --list or --stats <user_id>")
                    
        elif args.command == 'jobs':
            async with DatabaseManager() as db:
                if args.reset:
                    count = await db.reset_processing_jobs()
                    print(f"Reset {count} stuck jobs")
                else:
                    print("Specify --reset")
    
    except KeyboardInterrupt:
        print("\nOperation cancelled by user")
        sys.exit(1)
    except Exception as e:
        logger.error(f"Command failed: {str(e)}")
        sys.exit(1)

if __name__ == "__main__":
    asyncio.run(main())