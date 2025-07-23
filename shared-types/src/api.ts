/**
 * API-related types for requests and responses
 */

import { PaginationParams, PaginationResponse, SortParams, SearchParams } from './common';
import { Meeting, MeetingListItem, CreateMeetingRequest, UpdateMeetingRequest, MeetingFilters } from './meetings';

// Generic API Response wrapper
export interface ApiResponse<T = any> {
  data: T;
  message?: string;
  timestamp: string;
  request_id: string;
}

export interface ApiError {
  detail: string;
  error_code: string;
  timestamp: string;
  request_id: string;
  field_errors?: FieldError[];
}

export interface FieldError {
  field: string;
  message: string;
  code: string;
}

// Meeting API types
export interface MeetingsListRequest extends PaginationParams, SortParams, SearchParams {
  filters?: MeetingFilters;
}

export interface MeetingsListResponse extends PaginationResponse<MeetingListItem> {}

export interface MeetingDetailRequest {
  meeting_id: string;
  include_transcripts?: boolean;
  include_summary?: boolean;
  include_processing_history?: boolean;
}

// Rate limiting
export interface RateLimitHeaders {
  'x-ratelimit-limit': string;
  'x-ratelimit-remaining': string;
  'x-ratelimit-reset': string;
  'x-ratelimit-retry-after'?: string;
}

// File upload types
export interface FileUploadProgress {
  loaded: number;
  total: number;
  percentage: number;
}

export interface UploadResponse {
  file_id: string;
  filename: string;
  size: number;
  url: string;
  expires_at?: string;
}

// API Versioning
export type ApiVersion = 'v1' | 'v2';

export interface VersionedEndpoint {
  version: ApiVersion;
  path: string;
  deprecated?: boolean;
  deprecation_date?: string;
  replacement?: string;
}

// Webhook types
export interface WebhookEvent {
  id: string;
  type: WebhookEventType;
  data: any;
  timestamp: string;
  user_id: string;
  tenant_id: string;
}

export type WebhookEventType = 
  | 'meeting.created'
  | 'meeting.updated'
  | 'meeting.deleted'
  | 'processing.started'
  | 'processing.completed'
  | 'processing.failed'
  | 'summary.generated'
  | 'user.created'
  | 'user.updated';

export interface WebhookSubscription {
  id: string;
  url: string;
  events: WebhookEventType[];
  active: boolean;
  secret: string;
  created_at: string;
  last_delivery?: string;
  failure_count: number;
}

// Batch operations
export interface BatchOperation<T = any> {
  operation: 'create' | 'update' | 'delete';
  id?: string;
  data: T;
}

export interface BatchRequest<T = any> {
  operations: BatchOperation<T>[];
  options?: {
    continue_on_error?: boolean;
    transaction?: boolean;
  };
}

export interface BatchResponse<T = any> {
  results: BatchOperationResult<T>[];
  total_operations: number;
  successful_operations: number;
  failed_operations: number;
}

export interface BatchOperationResult<T = any> {
  operation_index: number;
  success: boolean;
  data?: T;
  error?: ApiError;
}

// Search and filtering
export interface SearchRequest {
  query: string;
  filters?: Record<string, any>;
  sort?: SortParams;
  pagination?: PaginationParams;
  facets?: string[];
}

export interface SearchResponse<T = any> {
  results: T[];
  total: number;
  query: string;
  facets?: Record<string, SearchFacet[]>;
  suggestions?: string[];
  search_time_ms: number;
}

export interface SearchFacet {
  value: string;
  count: number;
}

// Export/Import
export interface ExportRequest {
  format: 'json' | 'csv' | 'xlsx' | 'pdf';
  filters?: Record<string, any>;
  fields?: string[];
  options?: ExportOptions;
}

export interface ExportOptions {
  include_metadata?: boolean;
  date_format?: string;
  timezone?: string;
  compression?: 'none' | 'gzip' | 'zip';
}

export interface ExportResponse {
  export_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  download_url?: string;
  expires_at?: string;
  file_size?: number;
  created_at: string;
}

export interface ImportRequest {
  format: 'json' | 'csv' | 'xlsx';
  file_url: string;
  options?: ImportOptions;
}

export interface ImportOptions {
  skip_validation?: boolean;
  overwrite_existing?: boolean;
  dry_run?: boolean;
  mapping?: Record<string, string>;
}

export interface ImportResponse {
  import_id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_records?: number;
  processed_records?: number;
  successful_records?: number;
  failed_records?: number;
  errors?: ImportError[];
  created_at: string;
}

export interface ImportError {
  row: number;
  field: string;
  message: string;
  value: any;
}