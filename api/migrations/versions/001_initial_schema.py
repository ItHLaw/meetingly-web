"""Initial database schema for Meetily web application

Revision ID: 001
Revises: 
Create Date: 2025-01-22 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = '001'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Create users table
    op.create_table('users',
    sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
    sa.Column('microsoft_id', sa.String(length=255), nullable=False),
    sa.Column('email', sa.String(length=255), nullable=False),
    sa.Column('name', sa.String(length=255), nullable=False),
    sa.Column('tenant_id', sa.String(length=255), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('is_active', sa.Boolean(), default=True),
    sa.Column('preferences', sa.JSON(), default={}),
    sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    sa.UniqueConstraint('microsoft_id'),
    )
    
    # Create indexes for users table
    op.create_index('ix_users_microsoft_id', 'users', ['microsoft_id'])
    op.create_index('ix_users_email', 'users', ['email'])
    op.create_index('ix_users_tenant_id', 'users', ['tenant_id'])
    op.create_index('ix_users_created_at', 'users', ['created_at'])
    op.create_index('ix_users_is_active', 'users', ['is_active'])
    op.create_index('ix_users_tenant_email', 'users', ['tenant_id', 'email'])
    op.create_index('ix_users_active_created', 'users', ['is_active', 'created_at'])

    # Create user_sessions table
    op.create_table('user_sessions',
    sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
    sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('session_token', sa.String(length=255), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('ip_address', sa.String(length=45), nullable=True),
    sa.Column('user_agent', sa.Text(), nullable=True),
    sa.Column('is_revoked', sa.Boolean(), default=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.UniqueConstraint('session_token'),
    )
    
    # Create indexes for user_sessions table
    op.create_index('ix_user_sessions_user_id', 'user_sessions', ['user_id'])
    op.create_index('ix_user_sessions_session_token', 'user_sessions', ['session_token'])
    op.create_index('ix_user_sessions_expires_at', 'user_sessions', ['expires_at'])
    op.create_index('ix_user_sessions_user_active', 'user_sessions', ['user_id', 'expires_at', 'is_revoked'])

    # Create user_model_configs table
    op.create_table('user_model_configs',
    sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
    sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('provider', sa.String(length=50), nullable=False),
    sa.Column('model', sa.String(length=100), nullable=False),
    sa.Column('whisper_model', sa.String(length=50), nullable=False, default='base'),
    sa.Column('api_key_encrypted', sa.Text(), nullable=True),
    sa.Column('is_active', sa.Boolean(), default=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    
    # Create indexes for user_model_configs table
    op.create_index('ix_user_model_configs_user_id', 'user_model_configs', ['user_id'])
    op.create_index('ix_user_model_configs_unique_active', 'user_model_configs', ['user_id', 'provider', 'is_active'])

    # Create meetings table
    op.create_table('meetings',
    sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
    sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('title', sa.String(length=255), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('audio_file_path', sa.Text(), nullable=True),
    sa.Column('audio_file_size', sa.Integer(), nullable=True),
    sa.Column('audio_duration', sa.Float(), nullable=True),
    sa.Column('audio_format', sa.String(length=20), nullable=True),
    sa.Column('transcript_text', sa.Text(), nullable=True),
    sa.Column('transcript_language', sa.String(length=10), nullable=True),
    sa.Column('summary_data', sa.JSON(), nullable=True),
    sa.Column('action_items', sa.JSON(), nullable=True),
    sa.Column('key_topics', sa.JSON(), nullable=True),
    sa.Column('processing_status', sa.String(length=50), default='pending'),
    sa.Column('processing_progress', sa.Integer(), default=0),
    sa.Column('processing_started_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('processing_completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('is_deleted', sa.Boolean(), default=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    
    # Create indexes for meetings table
    op.create_index('ix_meetings_user_id', 'meetings', ['user_id'])
    op.create_index('ix_meetings_created_at', 'meetings', ['created_at'])
    op.create_index('ix_meetings_processing_status', 'meetings', ['processing_status'])
    op.create_index('ix_meetings_user_status', 'meetings', ['user_id', 'processing_status'])
    op.create_index('ix_meetings_user_created', 'meetings', ['user_id', 'created_at'])
    op.create_index('ix_meetings_user_not_deleted', 'meetings', ['user_id', 'is_deleted'])

    # Create transcripts table
    op.create_table('transcripts',
    sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
    sa.Column('meeting_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('text', sa.Text(), nullable=False),
    sa.Column('start_time', sa.Float(), nullable=False),
    sa.Column('end_time', sa.Float(), nullable=False),
    sa.Column('confidence_score', sa.Float(), nullable=True),
    sa.Column('speaker_id', sa.String(length=50), nullable=True),
    sa.Column('speaker_name', sa.String(length=100), nullable=True),
    sa.Column('segment_index', sa.Integer(), nullable=False),
    sa.Column('language', sa.String(length=10), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    )
    
    # Create indexes for transcripts table
    op.create_index('ix_transcripts_meeting_id', 'transcripts', ['meeting_id'])
    op.create_index('ix_transcripts_user_id', 'transcripts', ['user_id'])
    op.create_index('ix_transcripts_meeting_segment', 'transcripts', ['meeting_id', 'segment_index'])
    op.create_index('ix_transcripts_user_meeting', 'transcripts', ['user_id', 'meeting_id'])
    op.create_index('ix_transcripts_timing', 'transcripts', ['meeting_id', 'start_time'])

    # Create processing_jobs table
    op.create_table('processing_jobs',
    sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
    sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('meeting_id', postgresql.UUID(as_uuid=True), nullable=False),
    sa.Column('job_type', sa.String(length=50), nullable=False),
    sa.Column('job_queue', sa.String(length=50), nullable=False, default='default'),
    sa.Column('celery_task_id', sa.String(length=255), nullable=True),
    sa.Column('status', sa.String(length=50), default='pending'),
    sa.Column('progress', sa.Integer(), default=0),
    sa.Column('current_step', sa.String(length=100), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('result', sa.JSON(), nullable=True),
    sa.Column('error_message', sa.Text(), nullable=True),
    sa.Column('error_code', sa.String(length=50), nullable=True),
    sa.Column('retry_count', sa.Integer(), default=0),
    sa.Column('max_retries', sa.Integer(), default=3),
    sa.Column('processing_config', sa.JSON(), nullable=True),
    sa.Column('estimated_duration', sa.Integer(), nullable=True),
    sa.Column('actual_duration', sa.Integer(), nullable=True),
    sa.ForeignKeyConstraint(['meeting_id'], ['meetings.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.UniqueConstraint('celery_task_id'),
    )
    
    # Create indexes for processing_jobs table
    op.create_index('ix_processing_jobs_user_id', 'processing_jobs', ['user_id'])
    op.create_index('ix_processing_jobs_meeting_id', 'processing_jobs', ['meeting_id'])
    op.create_index('ix_processing_jobs_status', 'processing_jobs', ['status'])
    op.create_index('ix_processing_jobs_user_status', 'processing_jobs', ['user_id', 'status'])
    op.create_index('ix_processing_jobs_user_type', 'processing_jobs', ['user_id', 'job_type'])
    op.create_index('ix_processing_jobs_status_created', 'processing_jobs', ['status', 'created_at'])
    op.create_index('ix_processing_jobs_celery_task', 'processing_jobs', ['celery_task_id'])


def downgrade() -> None:
    # Drop tables in reverse order due to foreign key constraints
    op.drop_table('processing_jobs')
    op.drop_table('transcripts')
    op.drop_table('meetings')
    op.drop_table('user_model_configs')
    op.drop_table('user_sessions')
    op.drop_table('users')