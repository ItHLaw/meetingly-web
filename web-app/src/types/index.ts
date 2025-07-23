// Core type definitions
export interface User {
  id: string;
  microsoft_id: string;
  email: string;
  name: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  preferences: Record<string, any>;
  avatar?: string;
}

export interface Meeting {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
  updated_at: string;
  audio_file_path?: string;
  transcript_text?: string;
  summary_data?: SummaryData;
  processing_status: ProcessingStatus;
  // Derived properties for UI convenience
  participants?: string[];
  duration?: number;
}

export interface Transcript {
  id: string;
  meeting_id: string;
  user_id: string;
  text: string;
  timestamp: string;
  confidence_score?: number;
  speaker_id?: string;
}

export interface ProcessingJob {
  id: string;
  user_id: string;
  meeting_id: string;
  job_type: JobType;
  status: JobStatus;
  created_at: string;
  updated_at: string;
  result?: Record<string, any>;
  error_message?: string;
  progress: number;
}

export interface UserSession {
  id: string;
  user_id: string;
  session_token: string;
  expires_at: string;
  created_at: string;
}

export interface ModelConfig {
  id: string;
  user_id: string;
  provider: string;
  model: string;
  whisper_model: string;
  api_key_encrypted?: string;
  created_at: string;
  updated_at: string;
}

export interface SummaryData {
  summary: string;
  key_points: string[];
  action_items: string[];
  participants: string[];
  duration: number;
  confidence: number;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  session?: UserSession;
}

export interface MeetingState {
  meetings: Meeting[];
  currentMeeting: Meeting | null;
  isLoading: boolean;
  error: string | null;
}

export interface UIState {
  theme: 'light' | 'dark';
  sidebarOpen: boolean;
  notifications: Notification[];
  modals: {
    settings: boolean;
    upload: boolean;
    delete: boolean;
  };
}

export interface UploadProgress {
  jobId: string;
  fileName: string;
  progress: number;
  status: JobStatus;
  error?: string;
}

export interface WebSocketMessage {
  type: 'processing_update' | 'transcription_complete' | 'summary_complete' | 'error';
  payload: any;
  timestamp: string;
}

export interface Notification {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  actions?: NotificationAction[];
}

export interface NotificationAction {
  label: string;
  action: () => void;
  variant?: 'primary' | 'secondary';
}

export enum ProcessingStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export enum JobType {
  TRANSCRIPTION = 'transcription',
  SUMMARY = 'summary',
}

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export interface ApiResponse<T> {
  data: T;
  message?: string;
  success: boolean;
}

export interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
  request_id: string;
}

// Additional type aliases
export type AudioFormat = 'mp3' | 'wav' | 'm4a' | 'flac';
export type ModelProvider = 'anthropic' | 'groq' | 'ollama' | 'openai';