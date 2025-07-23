#!/usr/bin/env python3
"""
CLI script for migrating data from desktop SQLite database to web PostgreSQL database.

Usage:
    python scripts/migrate_desktop_data.py --sqlite-path /path/to/meeting_minutes.db --user-email user@example.com
    python scripts/migrate_desktop_data.py --export-user user@example.com --output /path/to/export.json
    python scripts/migrate_desktop_data.py --cleanup-user user@example.com --older-than-days 90
"""

import asyncio
import argparse
import json
import sys
from pathlib import Path
from typing import Optional

# Add the app directory to Python path
sys.path.append(str(Path(__file__).parent.parent))

from app.core.database import get_db
from app.core.config import settings
from app.models.user import User
from app.migration.desktop_migrator import DesktopDataMigrator, DataExportService, DataCleanupService, DataImportService
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select

async def get_user_by_email(email: str, db_session: AsyncSession) -> Optional[User]:
    """Get user by email address"""
    result = await db_session.execute(
        select(User).where(User.email == email)
    )
    return result.scalar_one_or_none()

async def migrate_desktop_data(sqlite_path: str, user_email: str, include_settings: bool = True):
    """Migrate desktop data for a specific user"""
    
    # Create database session
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Find user
        user = await get_user_by_email(user_email, session)
        if not user:
            print(f"Error: User with email {user_email} not found in database")
            return False
        
        print(f"Found user: {user.name} ({user.email})")
        
        # Create migrator and run migration
        migrator = DesktopDataMigrator(sqlite_path)
        
        try:
            stats = await migrator.migrate_user_data(
                user_id=str(user.id),
                db_session=session,
                include_settings=include_settings
            )
            
            print(f"\nMigration completed successfully!")
            print(f"Meetings migrated: {stats.meetings_migrated}")
            print(f"Transcripts migrated: {stats.transcripts_migrated}")
            print(f"Settings migrated: {stats.settings_migrated}")
            
            if stats.errors:
                print(f"\nErrors encountered:")
                for error in stats.errors:
                    print(f"  - {error}")
            
            return True
            
        except Exception as e:
            print(f"Migration failed: {str(e)}")
            return False
        
        finally:
            await engine.dispose()

async def export_user_data(user_email: str, output_path: str, format: str = 'json'):
    """Export user data to file"""
    
    # Create database session
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Find user
        user = await get_user_by_email(user_email, session)
        if not user:
            print(f"Error: User with email {user_email} not found in database")
            return False
        
        print(f"Exporting data for user: {user.name} ({user.email})")
        
        # Export data
        export_service = DataExportService()
        
        try:
            data = await export_service.export_user_data(
                user_id=str(user.id),
                db_session=session,
                format=format
            )
            
            # Write to file
            output_file = Path(output_path)
            output_file.parent.mkdir(parents=True, exist_ok=True)
            
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            
            print(f"Data exported to: {output_path}")
            print(f"Meetings exported: {len(data['meetings'])}")
            print(f"Transcripts exported: {len(data['transcripts'])}")
            print(f"Model configs exported: {len(data['model_configs'])}")
            
            return True
            
        except Exception as e:
            print(f"Export failed: {str(e)}")
            return False
        
        finally:
            await engine.dispose()

async def import_user_data(user_email: str, import_file: str, merge_strategy: str = 'skip_existing'):
    """Import user data from file"""
    
    # Create database session
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Find user
        user = await get_user_by_email(user_email, session)
        if not user:
            print(f"Error: User with email {user_email} not found in database")
            return False
        
        print(f"Importing data for user: {user.name} ({user.email})")
        print(f"Import file: {import_file}")
        print(f"Merge strategy: {merge_strategy}")
        
        # Load import data
        try:
            with open(import_file, 'r', encoding='utf-8') as f:
                import_data = json.load(f)
        except Exception as e:
            print(f"Error reading import file: {str(e)}")
            return False
        
        # Import data
        import_service = DataImportService()
        
        try:
            stats = await import_service.import_user_data(
                user_id=str(user.id),
                import_data=import_data,
                db_session=session,
                format='json',
                merge_strategy=merge_strategy
            )
            
            print(f"\nImport completed successfully!")
            print(f"Meetings imported: {stats['meetings_imported']}")
            print(f"Transcripts imported: {stats['transcripts_imported']}")
            print(f"Model configs imported: {stats['model_configs_imported']}")
            
            if stats['warnings']:
                print(f"\nWarnings:")
                for warning in stats['warnings']:
                    print(f"  - {warning}")
            
            if stats['errors']:
                print(f"\nErrors:")
                for error in stats['errors']:
                    print(f"  - {error}")
            
            return True
            
        except Exception as e:
            print(f"Import failed: {str(e)}")
            return False
        
        finally:
            await engine.dispose()

async def cleanup_user_data(user_email: str, older_than_days: Optional[int] = None, dry_run: bool = True):
    """Clean up user data"""
    
    # Create database session
    engine = create_async_engine(settings.DATABASE_URL)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        # Find user
        user = await get_user_by_email(user_email, session)
        if not user:
            print(f"Error: User with email {user_email} not found in database")
            return False
        
        print(f"Cleaning up data for user: {user.name} ({user.email})")
        if dry_run:
            print("DRY RUN - No data will actually be deleted")
        
        # Clean up data
        cleanup_service = DataCleanupService()
        
        try:
            stats = await cleanup_service.cleanup_user_data(
                user_id=str(user.id),
                db_session=session,
                older_than_days=older_than_days,
                dry_run=dry_run
            )
            
            action = "Would delete" if dry_run else "Deleted"
            print(f"\n{action}:")
            print(f"Meetings: {stats['meetings_deleted']}")
            print(f"Transcripts: {stats['transcripts_deleted']}")
            print(f"Processing jobs: {stats['processing_jobs_deleted']}")
            
            return True
            
        except Exception as e:
            print(f"Cleanup failed: {str(e)}")
            return False
        
        finally:
            await engine.dispose()

def main():
    parser = argparse.ArgumentParser(description='Meetily Data Migration Utilities')
    subparsers = parser.add_subparsers(dest='command', help='Available commands')
    
    # Migration command
    migrate_parser = subparsers.add_parser('migrate', help='Migrate desktop data to web database')
    migrate_parser.add_argument('--sqlite-path', required=True, help='Path to desktop SQLite database')
    migrate_parser.add_argument('--user-email', required=True, help='Email of target user in web database')
    migrate_parser.add_argument('--no-settings', action='store_true', help='Skip migrating user settings')
    
    # Export command
    export_parser = subparsers.add_parser('export', help='Export user data to file')
    export_parser.add_argument('--user-email', required=True, help='Email of user to export')
    export_parser.add_argument('--output', required=True, help='Output file path')
    export_parser.add_argument('--format', default='json', choices=['json'], help='Export format')
    
    # Import command
    import_parser = subparsers.add_parser('import', help='Import user data from file')
    import_parser.add_argument('--user-email', required=True, help='Email of target user')
    import_parser.add_argument('--input', required=True, help='Input file path')
    import_parser.add_argument('--merge-strategy', default='skip_existing', 
                              choices=['skip_existing', 'overwrite', 'merge'], 
                              help='How to handle existing data')
    
    # Cleanup command
    cleanup_parser = subparsers.add_parser('cleanup', help='Clean up user data')
    cleanup_parser.add_argument('--user-email', required=True, help='Email of user to clean up')
    cleanup_parser.add_argument('--older-than-days', type=int, help='Only delete data older than N days')
    cleanup_parser.add_argument('--confirm', action='store_true', help='Actually delete data (not dry run)')
    
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        return
    
    # Run the appropriate command
    if args.command == 'migrate':
        success = asyncio.run(migrate_desktop_data(
            sqlite_path=args.sqlite_path,
            user_email=args.user_email,
            include_settings=not args.no_settings
        ))
    elif args.command == 'export':
        success = asyncio.run(export_user_data(
            user_email=args.user_email,
            output_path=args.output,
            format=args.format
        ))
    elif args.command == 'import':
        success = asyncio.run(import_user_data(
            user_email=args.user_email,
            import_file=args.input,
            merge_strategy=args.merge_strategy
        ))
    elif args.command == 'cleanup':
        success = asyncio.run(cleanup_user_data(
            user_email=args.user_email,
            older_than_days=args.older_than_days,
            dry_run=not args.confirm
        ))
    else:
        parser.print_help()
        return
    
    sys.exit(0 if success else 1)

if __name__ == '__main__':
    main()