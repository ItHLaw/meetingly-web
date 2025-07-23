/**
 * Audio processing types
 */

import { ProcessingJob } from './common';

export interface AudioUploadRequest {
  file: File;
  meeting_name: string;
  enable_diarization?: boolean;
  model?: WhisperModel;
  language?: string;
  temperature?: number;
  initial_prompt?: string;
  custom_vocabulary?: string[];
}

export interface AudioUploadResponse {
  job_id: string;
  meeting_id: string;
  status: 'pending' | 'processing';
  estimated_duration: number;
  message: string;
}

export interface AudioProcessingJob extends ProcessingJob {
  meeting_id: string;
  file_info: AudioFileInfo;
  processing_options: AudioProcessingOptions;
  transcription_result?: TranscriptionResult;
}

export interface AudioFileInfo {
  filename: string;
  size: number;
  duration: number;
  format: string;
  sample_rate: number;
  channels: number;
  bitrate?: number;
}

export interface AudioProcessingOptions {
  model: WhisperModel;
  language: string;
  enable_diarization: boolean;
  temperature: number;
  initial_prompt?: string;
  custom_vocabulary?: string[];
  noise_reduction: boolean;
  voice_activity_detection: boolean;
}

export interface TranscriptionResult {
  text: string;
  language: string;
  duration: number;
  segments: TranscriptionSegment[];
  speakers?: SpeakerInfo[];
  confidence_score: number;
  processing_time: number;
}

export interface TranscriptionSegment {
  id: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
  speaker_id?: string;
  speaker_label?: string;
  words?: WordTimestamp[];
}

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
  confidence: number;
}

export interface SpeakerInfo {
  speaker_id: string;
  speaker_label: string;
  total_speaking_time: number;
  segments_count: number;
  average_confidence: number;
}

export type WhisperModel = 
  | 'tiny' 
  | 'tiny.en' 
  | 'base' 
  | 'base.en' 
  | 'small' 
  | 'small.en' 
  | 'medium' 
  | 'medium.en' 
  | 'large' 
  | 'large-v2' 
  | 'large-v3';

export interface WhisperModelInfo {
  name: WhisperModel;
  size: string;
  languages: string[];
  description: string;
  memory_required: string;
  processing_speed: 'fastest' | 'fast' | 'medium' | 'slow' | 'slowest';
  accuracy: 'basic' | 'good' | 'high' | 'highest';
}

export interface AudioJobsListResponse {
  jobs: AudioProcessingJobSummary[];
  total: number;
  has_more: boolean;
}

export interface AudioProcessingJobSummary {
  job_id: string;
  meeting_id: string;
  meeting_name: string;
  status: ProcessingJob['status'];
  progress: number;
  created_at: string;
  completed_at?: string;
  file_info: Pick<AudioFileInfo, 'filename' | 'size' | 'duration'>;
}

export interface AudioQualityMetrics {
  signal_to_noise_ratio: number;
  peak_amplitude: number;
  rms_amplitude: number;
  dynamic_range: number;
  spectral_centroid: number;
  zero_crossing_rate: number;
  quality_score: number; // 0-1
}