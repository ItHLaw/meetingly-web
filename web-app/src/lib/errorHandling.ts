/**
 * Unified error handling utilities for consistent error processing across the application
 */

export interface ErrorResponse {
  error: string;
  message: string;
  details?: Record<string, any>;
  timestamp: string;
  request_id: string;
  status?: number;
}

export interface UIError {
  title: string;
  message: string;
  type: 'error' | 'warning' | 'info';
  retryable: boolean;
  duration?: number;
}

/**
 * Standard error categories for consistent handling
 */
export enum ErrorCategory {
  NETWORK = 'network',
  AUTHENTICATION = 'authentication',
  AUTHORIZATION = 'authorization',
  VALIDATION = 'validation',
  NOT_FOUND = 'not_found',
  SERVER = 'server',
  CLIENT = 'client',
  UNKNOWN = 'unknown',
}

/**
 * Categorize errors based on status code and error content
 */
export function categorizeError(error: any): ErrorCategory {
  if (!error.response) {
    return ErrorCategory.NETWORK;
  }

  const status = error.response.status;
  const errorData = error.response.data;

  switch (status) {
    case 401:
      return ErrorCategory.AUTHENTICATION;
    case 403:
      return ErrorCategory.AUTHORIZATION;
    case 404:
      return ErrorCategory.NOT_FOUND;
    case 422:
    case 400:
      return ErrorCategory.VALIDATION;
    case 500:
    case 502:
    case 503:
    case 504:
      return ErrorCategory.SERVER;
    default:
      if (status >= 400 && status < 500) {
        return ErrorCategory.CLIENT;
      }
      return ErrorCategory.UNKNOWN;
  }
}

/**
 * Convert API errors to user-friendly messages
 */
export function formatErrorForUI(error: any): UIError {
  const category = categorizeError(error);
  const status = error.response?.status;
  const errorData = error.response?.data;

  switch (category) {
    case ErrorCategory.NETWORK:
      return {
        title: 'Connection Error',
        message: 'Unable to connect to the server. Please check your internet connection and try again.',
        type: 'error',
        retryable: true,
        duration: 5000,
      };

    case ErrorCategory.AUTHENTICATION:
      return {
        title: 'Authentication Required',
        message: 'Your session has expired. Please log in again.',
        type: 'warning',
        retryable: false,
        duration: 0, // Persistent until action taken
      };

    case ErrorCategory.AUTHORIZATION:
      return {
        title: 'Access Denied',
        message: 'You do not have permission to perform this action.',
        type: 'error',
        retryable: false,
        duration: 4000,
      };

    case ErrorCategory.VALIDATION:
      const validationMessage = errorData?.message || errorData?.detail || 'Please check your input and try again.';
      return {
        title: 'Invalid Input',
        message: validationMessage,
        type: 'warning',
        retryable: true,
        duration: 6000,
      };

    case ErrorCategory.NOT_FOUND:
      return {
        title: 'Not Found',
        message: 'The requested resource could not be found.',
        type: 'info',
        retryable: false,
        duration: 4000,
      };

    case ErrorCategory.SERVER:
      return {
        title: 'Server Error',
        message: 'We\'re experiencing technical difficulties. Please try again in a few moments.',
        type: 'error',
        retryable: true,
        duration: 5000,
      };

    case ErrorCategory.CLIENT:
      return {
        title: 'Request Error',
        message: errorData?.message || 'There was a problem with your request. Please try again.',
        type: 'error',
        retryable: true,
        duration: 4000,
      };

    default:
      return {
        title: 'Unexpected Error',
        message: 'Something went wrong. Please try again.',
        type: 'error',
        retryable: true,
        duration: 4000,
      };
  }
}

/**
 * Enhanced error logger with context
 */
export function logError(error: any, context: {
  action?: string;
  component?: string;
  userId?: string;
  additionalData?: Record<string, any>;
} = {}) {
  const errorInfo = {
    timestamp: new Date().toISOString(),
    error: {
      message: error.message,
      stack: error.stack,
      name: error.name,
    },
    apiError: error.response ? {
      status: error.response.status,
      statusText: error.response.statusText,
      data: error.response.data,
      url: error.config?.url,
      method: error.config?.method,
    } : null,
    context,
    userAgent: typeof window !== 'undefined' ? window.navigator.userAgent : null,
    url: typeof window !== 'undefined' ? window.location.href : null,
  };

  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.group('🚨 Error Details');
    console.error('Error:', error);
    console.log('Context:', context);
    console.log('Full Info:', errorInfo);
    console.groupEnd();
  }

  // In production, you would send this to your error monitoring service
  // Example: Sentry, LogRocket, etc.
  // sendToErrorMonitoring(errorInfo);

  return errorInfo;
}

/**
 * Determine if an error should trigger a retry
 */
export function shouldRetryError(error: any): boolean {
  const category = categorizeError(error);
  
  switch (category) {
    case ErrorCategory.NETWORK:
    case ErrorCategory.SERVER:
      return true;
    case ErrorCategory.CLIENT:
      // Some 400-level errors might be retryable (like rate limiting)
      return error.response?.status === 429;
    default:
      return false;
  }
}

/**
 * Get retry delay based on error type and attempt number
 */
export function getRetryDelay(error: any, attempt: number): number {
  const category = categorizeError(error);
  const baseDelay = 1000; // 1 second base delay
  
  switch (category) {
    case ErrorCategory.NETWORK:
      return Math.min(baseDelay * Math.pow(2, attempt), 10000); // Max 10 seconds
    case ErrorCategory.SERVER:
      return Math.min(baseDelay * Math.pow(1.5, attempt), 5000); // Max 5 seconds
    default:
      return baseDelay;
  }
}

/**
 * Global error handler for unhandled promises and errors
 */
export function setupGlobalErrorHandling() {
  if (typeof window === 'undefined') return;

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    logError(event.reason, { action: 'unhandled_promise_rejection' });
    
    // Prevent the default browser console error
    event.preventDefault();
  });

  // Handle uncaught errors
  window.addEventListener('error', (event) => {
    console.error('Uncaught error:', event.error);
    logError(event.error, { 
      action: 'uncaught_error',
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });
}

/**
 * Utility to wrap async functions with error handling
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<any>>(
  fn: T,
  context: { component?: string; action?: string } = {}
): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      logError(error, context);
      throw error;
    }
  }) as T;
}