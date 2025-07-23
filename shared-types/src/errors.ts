/**
 * Error types and error handling utilities
 */

export enum ErrorCategory {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  SERVER = 'server',
  CLIENT = 'client',
  PROCESSING = 'processing',
  EXTERNAL_SERVICE = 'external_service',
  RATE_LIMIT = 'rate_limit',
  UNKNOWN = 'unknown'
}

export interface BaseError {
  code: string;
  message: string;
  category: ErrorCategory;
  timestamp: string;
  request_id?: string;
  user_id?: string;
  context?: ErrorContext;
}

export interface ErrorContext {
  component?: string;
  action?: string;
  resource_id?: string;
  additional_data?: Record<string, any>;
}

// API Error codes
export enum ApiErrorCode {
  // Authentication errors
  AUTH_TOKEN_MISSING = 'AUTH_TOKEN_MISSING',
  AUTH_TOKEN_INVALID = 'AUTH_TOKEN_INVALID',
  AUTH_TOKEN_EXPIRED = 'AUTH_TOKEN_EXPIRED',
  AUTH_MICROSOFT_FAILED = 'AUTH_MICROSOFT_FAILED',
  AUTH_USER_INACTIVE = 'AUTH_USER_INACTIVE',
  AUTH_INSUFFICIENT_PERMISSIONS = 'AUTH_INSUFFICIENT_PERMISSIONS',

  // Validation errors
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  VALIDATION_MISSING_FIELD = 'VALIDATION_MISSING_FIELD',
  VALIDATION_INVALID_FORMAT = 'VALIDATION_INVALID_FORMAT',
  VALIDATION_OUT_OF_RANGE = 'VALIDATION_OUT_OF_RANGE',
  
  // File errors
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  FILE_FORMAT_UNSUPPORTED = 'FILE_FORMAT_UNSUPPORTED',
  FILE_CORRUPTED = 'FILE_CORRUPTED',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  FILE_UPLOAD_FAILED = 'FILE_UPLOAD_FAILED',

  // Processing errors
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  PROCESSING_TIMEOUT = 'PROCESSING_TIMEOUT',
  PROCESSING_CANCELLED = 'PROCESSING_CANCELLED',
  PROCESSING_QUOTA_EXCEEDED = 'PROCESSING_QUOTA_EXCEEDED',
  
  // Summary generation errors
  SUMMARY_GENERATION_FAILED = 'SUMMARY_GENERATION_FAILED',
  SUMMARY_MODEL_UNAVAILABLE = 'SUMMARY_MODEL_UNAVAILABLE',
  SUMMARY_INVALID_PROMPT = 'SUMMARY_INVALID_PROMPT',
  SUMMARY_CONTENT_TOO_LONG = 'SUMMARY_CONTENT_TOO_LONG',

  // Resource errors
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  RESOURCE_ALREADY_EXISTS = 'RESOURCE_ALREADY_EXISTS',
  RESOURCE_CONFLICT = 'RESOURCE_CONFLICT',
  RESOURCE_LOCKED = 'RESOURCE_LOCKED',

  // Rate limiting
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  CONCURRENT_LIMIT_EXCEEDED = 'CONCURRENT_LIMIT_EXCEEDED',

  // External service errors
  EXTERNAL_SERVICE_UNAVAILABLE = 'EXTERNAL_SERVICE_UNAVAILABLE',
  EXTERNAL_SERVICE_TIMEOUT = 'EXTERNAL_SERVICE_TIMEOUT',
  EXTERNAL_SERVICE_AUTH_FAILED = 'EXTERNAL_SERVICE_AUTH_FAILED',
  EXTERNAL_SERVICE_QUOTA_EXCEEDED = 'EXTERNAL_SERVICE_QUOTA_EXCEEDED',

  // Server errors
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
  MAINTENANCE_MODE = 'MAINTENANCE_MODE',

  // Network errors
  NETWORK_TIMEOUT = 'NETWORK_TIMEOUT',
  NETWORK_CONNECTION_FAILED = 'NETWORK_CONNECTION_FAILED',
  NETWORK_DNS_FAILED = 'NETWORK_DNS_FAILED'
}

export interface ApiError extends BaseError {
  code: ApiErrorCode;
  status_code: number;
  field_errors?: FieldValidationError[];
  retry_after?: number;
  documentation_url?: string;
}

export interface FieldValidationError {
  field: string;
  code: string;
  message: string;
  value?: any;
}

// Client-side error types
export interface ClientError extends BaseError {
  original_error?: Error;
  stack_trace?: string;
  user_agent?: string;
  url?: string;
}

export interface NetworkError extends ClientError {
  category: ErrorCategory.NETWORK;
  timeout?: number;
  retry_count?: number;
  connection_type?: string;
}

export interface ValidationError extends ClientError {
  category: ErrorCategory.VALIDATION;
  field_errors: FieldValidationError[];
}

// Processing error types
export interface ProcessingError extends BaseError {
  category: ErrorCategory.PROCESSING;
  job_id: string;
  meeting_id?: string;
  stage: string;
  progress: number;
  retry_possible: boolean;
  estimated_retry_time?: number;
}

export interface ExternalServiceError extends BaseError {
  category: ErrorCategory.EXTERNAL_SERVICE;
  service_name: string;
  service_status: 'timeout' | 'unavailable' | 'auth_failed' | 'quota_exceeded';
  retry_after?: number;
}

// Error response formats
export interface ErrorResponse {
  error: ApiError;
  timestamp: string;
  path: string;
  method: string;
  trace_id?: string;
}

export interface BatchErrorResponse {
  errors: ApiError[];
  partial_success: boolean;
  successful_operations: number;
  failed_operations: number;
  timestamp: string;
}

// Error handling types
export interface ErrorHandler {
  canHandle(error: BaseError): boolean;
  handle(error: BaseError): Promise<ErrorHandlingResult>;
}

export interface ErrorHandlingResult {
  handled: boolean;
  retry: boolean;
  retry_after?: number;
  user_message?: string;
  log_error?: boolean;
  report_error?: boolean;
}

export interface RetryPolicy {
  max_retries: number;
  base_delay: number;
  max_delay: number;
  exponential_backoff: boolean;
  retry_on_codes: ApiErrorCode[];
}

// Error reporting
export interface ErrorReport {
  id: string;
  error: BaseError;
  user_id?: string;
  session_id?: string;
  environment: string;
  version: string;
  timestamp: string;
  browser_info?: BrowserInfo;
  additional_context?: Record<string, any>;
}

export interface BrowserInfo {
  user_agent: string;
  platform: string;
  language: string;
  screen_resolution: string;
  viewport_size: string;
  timezone: string;
}

// Error utility types
export interface ErrorMatcher {
  category?: ErrorCategory;
  code?: ApiErrorCode | string;
  message_pattern?: RegExp;
  status_code?: number;
}

export interface ErrorTransformation {
  matcher: ErrorMatcher;
  transform: (error: BaseError) => BaseError;
}

export interface UIErrorDisplay {
  title: string;
  message: string;
  type: 'error' | 'warning' | 'info';
  retryable: boolean;
  duration: number;
  actions?: ErrorAction[];
}

export interface ErrorAction {
  text: string;
  action: () => void | Promise<void>;
  style: 'primary' | 'secondary' | 'danger';
}