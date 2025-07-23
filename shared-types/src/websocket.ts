/**
 * WebSocket event types for real-time communication
 */

export interface WebSocketMessage<T = any> {
  type: WebSocketEventType;
  data: T;
  timestamp: string;
  user_id?: string;
  room?: string;
}

export type WebSocketEventType =
  // Connection events
  | 'connect'
  | 'disconnect'
  | 'error'
  | 'auth_required'
  | 'auth_success'
  | 'auth_error'
  
  // Room management
  | 'join_room'
  | 'leave_room'
  | 'room_joined'
  | 'room_left'
  
  // Processing events
  | 'processing_update'
  | 'processing_complete'
  | 'processing_error'
  
  // Summary events
  | 'summary_ready'
  | 'summary_error'
  
  // System notifications
  | 'system_notification'
  | 'user_notification'
  
  // Health and status
  | 'ping'
  | 'pong'
  | 'status_update';

// Connection and authentication
export interface ConnectData {
  user_id: string;
  token: string;
  client_info?: ClientInfo;
}

export interface AuthData {
  token: string;
  user_id: string;
}

export interface ClientInfo {
  user_agent: string;
  platform: string;
  version: string;
  capabilities: string[];
}

// Room management
export interface RoomData {
  room_id: string;
  room_type: 'user' | 'meeting' | 'broadcast';
  metadata?: Record<string, any>;
}

// Processing updates
export interface ProcessingUpdateData {
  job_id: string;
  meeting_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  current_step: string;
  estimated_completion?: string;
  processing_time?: number;
  stages?: ProcessingStage[];
}

export interface ProcessingStage {
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  start_time?: string;
  end_time?: string;
  details?: Record<string, any>;
}

export interface ProcessingCompleteData {
  job_id: string;
  meeting_id: string;
  status: 'completed';
  result: ProcessingResult;
  processing_time: number;
  quality_metrics?: QualityMetrics;
}

export interface ProcessingResult {
  transcript_id?: string;
  transcript_segments: number;
  summary_id?: string;
  speakers_detected?: number;
  duration: number;
  file_info: ProcessingFileInfo;
}

export interface ProcessingFileInfo {
  original_filename: string;
  processed_filename: string;
  size: number;
  duration: number;
  format: string;
}

export interface QualityMetrics {
  transcription_confidence: number;
  audio_quality: number;
  speaker_separation: number;
  overall_quality: number;
}

export interface ProcessingErrorData {
  job_id: string;
  meeting_id: string;
  status: 'failed';
  error_code: string;
  error_message: string;
  error_details?: Record<string, any>;
  retry_possible: boolean;
}

// Summary events
export interface SummaryReadyData {
  meeting_id: string;
  summary_id: string;
  summary_type: string;
  provider: string;
  model: string;
  quality_score: number;
  generated_at: string;
  processing_time: number;
}

export interface SummaryErrorData {
  meeting_id: string;
  summary_job_id: string;
  error_code: string;
  error_message: string;
  retry_possible: boolean;
}

// Notifications
export interface SystemNotificationData {
  id: string;
  title: string;
  message: string;
  notification_type: 'info' | 'success' | 'warning' | 'error';
  timestamp: string;
  action_url?: string;
  action_text?: string;
  dismiss_after?: number;
  persistent?: boolean;
}

export interface UserNotificationData extends SystemNotificationData {
  user_id: string;
  read: boolean;
  categories: string[];
  metadata?: Record<string, any>;
}

// Status and health
export interface StatusUpdateData {
  component: string;
  status: 'healthy' | 'degraded' | 'down';
  message?: string;
  timestamp: string;
  metrics?: Record<string, number>;
}

export interface PingData {
  timestamp: number;
  client_id?: string;
}

export interface PongData {
  timestamp: number;
  server_timestamp: number;
  latency?: number;
}

// Error types
export interface WebSocketError {
  code: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
}

// Connection state
export interface ConnectionState {
  connected: boolean;
  authenticated: boolean;
  rooms: string[];
  last_ping?: number;
  latency?: number;
  reconnect_attempts: number;
  user_id?: string;
}

// Event handlers
export type WebSocketEventHandler<T = any> = (data: T) => void;

export interface WebSocketEventHandlers {
  connect?: WebSocketEventHandler<void>;
  disconnect?: WebSocketEventHandler<{ reason: string }>;
  error?: WebSocketEventHandler<WebSocketError>;
  auth_required?: WebSocketEventHandler<void>;
  auth_success?: WebSocketEventHandler<{ user_id: string }>;
  auth_error?: WebSocketEventHandler<WebSocketError>;
  
  room_joined?: WebSocketEventHandler<RoomData>;
  room_left?: WebSocketEventHandler<RoomData>;
  
  processing_update?: WebSocketEventHandler<ProcessingUpdateData>;
  processing_complete?: WebSocketEventHandler<ProcessingCompleteData>;
  processing_error?: WebSocketEventHandler<ProcessingErrorData>;
  
  summary_ready?: WebSocketEventHandler<SummaryReadyData>;
  summary_error?: WebSocketEventHandler<SummaryErrorData>;
  
  system_notification?: WebSocketEventHandler<SystemNotificationData>;
  user_notification?: WebSocketEventHandler<UserNotificationData>;
  
  status_update?: WebSocketEventHandler<StatusUpdateData>;
  pong?: WebSocketEventHandler<PongData>;
}

// Client configuration
export interface WebSocketClientConfig {
  url: string;
  auth_token?: string;
  user_id?: string;
  reconnect?: boolean;
  reconnect_attempts?: number;
  reconnect_delay?: number;
  ping_interval?: number;
  pong_timeout?: number;
  event_handlers?: WebSocketEventHandlers;
}