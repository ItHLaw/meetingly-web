-- Meetily Web Application Database Schema
-- PostgreSQL 12+ compatible
-- Created: 2025-01-22
-- Description: Complete database schema for Meetily meeting transcription application

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table with Microsoft SSO integration
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    microsoft_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    tenant_id VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    preferences JSONB DEFAULT '{}',
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for users table
CREATE INDEX ix_users_microsoft_id ON users(microsoft_id);
CREATE INDEX ix_users_email ON users(email);
CREATE INDEX ix_users_tenant_id ON users(tenant_id);
CREATE INDEX ix_users_created_at ON users(created_at);
CREATE INDEX ix_users_is_active ON users(is_active);
CREATE INDEX ix_users_tenant_email ON users(tenant_id, email);
CREATE INDEX ix_users_active_created ON users(is_active, created_at);

-- Create user sessions table for authentication
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ip_address VARCHAR(45),
    user_agent TEXT,
    is_revoked BOOLEAN DEFAULT FALSE
);

-- Create indexes for user_sessions table
CREATE INDEX ix_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX ix_user_sessions_session_token ON user_sessions(session_token);
CREATE INDEX ix_user_sessions_expires_at ON user_sessions(expires_at);
CREATE INDEX ix_user_sessions_user_active ON user_sessions(user_id, expires_at, is_revoked);

-- Create user model configurations table
CREATE TABLE user_model_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    whisper_model VARCHAR(50) NOT NULL DEFAULT 'base',
    api_key_encrypted TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for user_model_configs table
CREATE INDEX ix_user_model_configs_user_id ON user_model_configs(user_id);
CREATE INDEX ix_user_model_configs_unique_active ON user_model_configs(user_id, provider, is_active);

-- Create meetings table with user isolation
CREATE TABLE meetings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Audio processing fields
    audio_file_path TEXT,
    audio_file_size INTEGER,
    audio_duration FLOAT,
    audio_format VARCHAR(20),
    
    -- Transcription fields
    transcript_text TEXT,
    transcript_language VARCHAR(10),
    summary_data JSONB,
    action_items JSONB,
    key_topics JSONB,
    
    -- Processing status and metadata
    processing_status VARCHAR(50) DEFAULT 'pending',
    processing_progress INTEGER DEFAULT 0,
    processing_started_at TIMESTAMP WITH TIME ZONE,
    processing_completed_at TIMESTAMP WITH TIME ZONE,
    
    -- Privacy and access control
    is_deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Create indexes for meetings table with user isolation
CREATE INDEX ix_meetings_user_id ON meetings(user_id);
CREATE INDEX ix_meetings_created_at ON meetings(created_at);
CREATE INDEX ix_meetings_processing_status ON meetings(processing_status);
CREATE INDEX ix_meetings_user_status ON meetings(user_id, processing_status);
CREATE INDEX ix_meetings_user_created ON meetings(user_id, created_at);
CREATE INDEX ix_meetings_user_not_deleted ON meetings(user_id, is_deleted);

-- Create transcripts table with speaker diarization
CREATE TABLE transcripts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- Transcript content
    text TEXT NOT NULL,
    start_time FLOAT NOT NULL,
    end_time FLOAT NOT NULL,
    
    -- Quality and confidence metrics
    confidence_score FLOAT,
    
    -- Speaker identification
    speaker_id VARCHAR(50),
    speaker_name VARCHAR(100),
    
    -- Metadata
    segment_index INTEGER NOT NULL,
    language VARCHAR(10),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for transcripts table with user isolation
CREATE INDEX ix_transcripts_meeting_id ON transcripts(meeting_id);
CREATE INDEX ix_transcripts_user_id ON transcripts(user_id);
CREATE INDEX ix_transcripts_meeting_segment ON transcripts(meeting_id, segment_index);
CREATE INDEX ix_transcripts_user_meeting ON transcripts(user_id, meeting_id);
CREATE INDEX ix_transcripts_timing ON transcripts(meeting_id, start_time);

-- Create processing jobs table for background tasks
CREATE TABLE processing_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    
    -- Job identification and type
    job_type VARCHAR(50) NOT NULL,
    job_queue VARCHAR(50) NOT NULL DEFAULT 'default',
    celery_task_id VARCHAR(255) UNIQUE,
    
    -- Status tracking
    status VARCHAR(50) DEFAULT 'pending',
    progress INTEGER DEFAULT 0,
    current_step VARCHAR(100),
    
    -- Timing information
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Results and error handling
    result JSONB,
    error_message TEXT,
    error_code VARCHAR(50),
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Processing metadata
    processing_config JSONB,
    estimated_duration INTEGER,
    actual_duration INTEGER
);

-- Create indexes for processing_jobs table with user isolation
CREATE INDEX ix_processing_jobs_user_id ON processing_jobs(user_id);
CREATE INDEX ix_processing_jobs_meeting_id ON processing_jobs(meeting_id);
CREATE INDEX ix_processing_jobs_status ON processing_jobs(status);
CREATE INDEX ix_processing_jobs_user_status ON processing_jobs(user_id, status);
CREATE INDEX ix_processing_jobs_user_type ON processing_jobs(user_id, job_type);
CREATE INDEX ix_processing_jobs_status_created ON processing_jobs(status, created_at);
CREATE INDEX ix_processing_jobs_celery_task ON processing_jobs(celery_task_id);

-- Create trigger to automatically update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update timestamp triggers
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_model_configs_updated_at BEFORE UPDATE ON user_model_configs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_meetings_updated_at BEFORE UPDATE ON meetings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_processing_jobs_updated_at BEFORE UPDATE ON processing_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create constraints for user isolation and data integrity
ALTER TABLE meetings 
ADD CONSTRAINT check_processing_progress 
CHECK (processing_progress >= 0 AND processing_progress <= 100);

ALTER TABLE processing_jobs 
ADD CONSTRAINT check_job_progress 
CHECK (progress >= 0 AND progress <= 100);

ALTER TABLE transcripts 
ADD CONSTRAINT check_transcript_timing 
CHECK (start_time >= 0 AND end_time >= start_time);

ALTER TABLE transcripts 
ADD CONSTRAINT check_confidence_score 
CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1));

-- Add comments for documentation
COMMENT ON TABLE users IS 'User accounts with Microsoft SSO integration';
COMMENT ON TABLE user_sessions IS 'User authentication sessions';
COMMENT ON TABLE user_model_configs IS 'User-specific AI model configurations';
COMMENT ON TABLE meetings IS 'Meeting recordings with user isolation';
COMMENT ON TABLE transcripts IS 'Meeting transcript segments with speaker diarization';
COMMENT ON TABLE processing_jobs IS 'Background processing jobs for meetings';

COMMENT ON COLUMN users.microsoft_id IS 'Microsoft Graph API user ID';
COMMENT ON COLUMN users.tenant_id IS 'Microsoft Azure tenant ID for multi-tenant support';
COMMENT ON COLUMN meetings.processing_status IS 'Values: pending, processing, completed, failed';
COMMENT ON COLUMN processing_jobs.job_type IS 'Values: transcription, summarization, diarization';
COMMENT ON COLUMN processing_jobs.status IS 'Values: pending, running, completed, failed, cancelled';

-- Grant permissions (adjust as needed for your environment)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO meetily_api;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO meetily_api;