/**
 * Common types used throughout the application
 */

export interface BaseEntity {
  id: string;
  created_at: string;
  updated_at: string;
}

export interface PaginationParams {
  skip?: number;
  limit?: number;
}

export interface PaginationResponse<T> {
  data: T[];
  total: number;
  skip: number;
  limit: number;
  has_more: boolean;
  next_skip?: number;
}

export interface SortParams {
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
}

export interface SearchParams {
  search?: string;
}

export type ProcessingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface ProcessingJob {
  job_id: string;
  status: ProcessingStatus;
  progress: number;
  current_step: string;
  estimated_completion?: string;
  error_message?: string;
  result?: any;
}

export interface FileUpload {
  file: File;
  size: number;
  type: string;
  name: string;
}

export interface ConfigurationOption<T = any> {
  key: string;
  value: T;
  default_value: T;
  description: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  required: boolean;
}

export interface HealthCheck {
  status: 'healthy' | 'unhealthy' | 'degraded';
  timestamp: string;
  version: string;
  environment: string;
  checks: Record<string, ComponentHealth>;
  metrics?: SystemMetrics;
}

export interface ComponentHealth {
  status: 'healthy' | 'unhealthy';
  message: string;
  response_time_ms?: number;
}

export interface SystemMetrics {
  cpu_usage_percent: number;
  memory_usage_percent: number;
  memory_available_mb: number;
  disk_usage_percent: number;
  disk_free_gb: number;
  active_users?: number;
  processing_jobs?: number;
  avg_response_time_ms?: number;
}