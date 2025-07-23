/**
 * Meeting-related types
 */

import { BaseEntity, ProcessingStatus } from './common';

export interface Meeting extends BaseEntity {
  name: string;
  description?: string;
  processing_status: ProcessingStatus;
  duration?: number;
  participants: string[];
  user_id: string;
  tenant_id: string;
  scheduled_at?: string;
  started_at?: string;
  ended_at?: string;
  has_transcript: boolean;
  has_summary: boolean;
  file_size?: number;
  audio_format?: string;
  audio_url?: string;
  tags?: string[];
  metadata?: MeetingMetadata;
}

export interface MeetingMetadata {
  source: 'upload' | 'recording' | 'live';
  device_info?: string;
  recording_quality?: 'low' | 'medium' | 'high';
  language?: string;
  custom_fields?: Record<string, any>;
}

export interface MeetingListItem {
  id: string;
  name: string;
  processing_status: ProcessingStatus;
  created_at: string;
  updated_at: string;
  duration?: number;
  participants: string[];
  has_transcript: boolean;
  has_summary: boolean;
  file_size?: number;
  audio_format?: string;
  tags?: string[];
}

export interface MeetingDetail extends Meeting {
  transcript_data?: TranscriptSegment[];
  summary_data?: SummaryData;
  processing_history?: ProcessingEvent[];
}

export interface TranscriptSegment {
  id: string;
  text: string;
  speaker_id: string;
  speaker_name?: string;
  start_time: number;
  end_time: number;
  confidence: number;
  language?: string;
  emotion?: string;
  keywords?: string[];
}

export interface ProcessingEvent {
  id: string;
  event_type: 'upload' | 'transcription_start' | 'transcription_complete' | 'summary_start' | 'summary_complete' | 'error';
  timestamp: string;
  message: string;
  details?: Record<string, any>;
}

export interface CreateMeetingRequest {
  name: string;
  description?: string;
  scheduled_at?: string;
  tags?: string[];
  metadata?: Partial<MeetingMetadata>;
}

export interface UpdateMeetingRequest {
  name?: string;
  description?: string;
  tags?: string[];
  metadata?: Partial<MeetingMetadata>;
}

export interface MeetingFilters {
  status?: ProcessingStatus[];
  date_from?: string;
  date_to?: string;
  has_transcript?: boolean;
  has_summary?: boolean;
  tags?: string[];
  participants?: string[];
}

export interface MeetingStats {
  total_meetings: number;
  completed_meetings: number;
  processing_meetings: number;
  failed_meetings: number;
  total_duration_minutes: number;
  average_duration_minutes: number;
  total_participants: number;
  unique_participants: number;
}