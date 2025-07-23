/**
 * Retry utility with exponential backoff for API calls
 * Inspired by the backend retry implementation for consistency
 */

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffStrategy: 'fixed' | 'exponential' | 'exponential_jitter';
  retryableErrors?: (error: any) => boolean;
  onRetry?: (attempt: number, error: any) => void;
}

export const DEFAULT_RETRY_CONFIGS = {
  // For network requests (GET, HEAD, OPTIONS)
  network: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffStrategy: 'exponential_jitter' as const,
    retryableErrors: (error: any) => {
      // Network errors, timeouts, and 5xx server errors
      return !error.response || 
             error.code === 'ECONNRESET' ||
             error.code === 'ECONNABORTED' ||
             error.code === 'ETIMEDOUT' ||
             (error.response?.status >= 500 && error.response?.status < 600) ||
             error.response?.status === 429; // Rate limiting
    },
  },
  
  // For API calls that modify data (POST, PUT, DELETE)
  api: {
    maxAttempts: 2,
    baseDelay: 2000,
    maxDelay: 8000,
    backoffStrategy: 'exponential' as const,
    retryableErrors: (error: any) => {
      // Only retry on network errors and 5xx errors, not 4xx client errors
      return !error.response || 
             error.code === 'ECONNRESET' ||
             error.code === 'ECONNABORTED' ||
             error.code === 'ETIMEDOUT' ||
             (error.response?.status >= 500 && error.response?.status < 600);
    },
  },
  
  // For file uploads
  upload: {
    maxAttempts: 4,
    baseDelay: 3000,
    maxDelay: 30000,
    backoffStrategy: 'exponential_jitter' as const,
    retryableErrors: (error: any) => {
      return !error.response || 
             error.code === 'ECONNRESET' ||
             error.code === 'ECONNABORTED' ||
             error.code === 'ETIMEDOUT' ||
             (error.response?.status >= 500 && error.response?.status < 600) ||
             error.response?.status === 408 || // Request timeout
             error.response?.status === 429;   // Rate limiting
    },
  },
} as const;

/**
 * Calculate delay based on backoff strategy
 */
function calculateDelay(
  attempt: number, 
  baseDelay: number, 
  maxDelay: number, 
  strategy: RetryConfig['backoffStrategy']
): number {
  let delay: number;
  
  switch (strategy) {
    case 'fixed':
      delay = baseDelay;
      break;
    case 'exponential':
      delay = baseDelay * Math.pow(2, attempt - 1);
      break;
    case 'exponential_jitter':
      delay = baseDelay * Math.pow(2, attempt - 1);
      // Add jitter (0.5 to 1.5 multiplier)
      delay = delay * (0.5 + Math.random());
      break;
    default:
      delay = baseDelay;
  }
  
  return Math.min(delay, maxDelay);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIGS.network
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Check if this error is retryable
      if (!config.retryableErrors || !config.retryableErrors(error)) {
        throw error;
      }
      
      // If this is the last attempt, throw the error
      if (attempt === config.maxAttempts) {
        throw error;
      }
      
      // Call retry callback if provided
      if (config.onRetry) {
        config.onRetry(attempt, error);
      }
      
      // Calculate delay and wait
      const delay = calculateDelay(attempt, config.baseDelay, config.maxDelay, config.backoffStrategy);
      
      console.warn(`Request failed (attempt ${attempt}/${config.maxAttempts}). Retrying in ${delay}ms...`, {
        error: error.message,
        status: error.response?.status,
        attempt,
        nextDelay: delay
      });
      
      await sleep(delay);
    }
  }
  
  throw lastError;
}

/**
 * Higher-order function to wrap async functions with retry logic
 */
export function withRetryWrapper<TArgs extends any[], TReturn>(
  fn: (...args: TArgs) => Promise<TReturn>,
  config: RetryConfig = DEFAULT_RETRY_CONFIGS.network
) {
  return async (...args: TArgs): Promise<TReturn> => {
    return withRetry(() => fn(...args), config);
  };
}

/**
 * Axios-specific retry wrapper that automatically detects request method
 */
export function getRetryConfigForAxiosRequest(method: string = 'GET'): RetryConfig {
  const upperMethod = method.toUpperCase();
  
  if (upperMethod === 'POST' && method.includes('upload')) {
    return { ...DEFAULT_RETRY_CONFIGS.upload };
  } else if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(upperMethod)) {
    return { ...DEFAULT_RETRY_CONFIGS.api };
  } else {
    return { ...DEFAULT_RETRY_CONFIGS.network };
  }
}

/**
 * Create a retry-enabled axios instance
 */
export function createAxiosWithRetry(axiosInstance: any) {
  // Store original request method
  const originalRequest = axiosInstance.request;
  
  axiosInstance.request = async function(config: any) {
    const retryConfig = getRetryConfigForAxiosRequest(config.method);
    
    return withRetry(
      () => originalRequest.call(this, config),
      {
        ...retryConfig,
        onRetry: (attempt, error) => {
          console.warn(`API request retry (${config.method} ${config.url})`, {
            attempt,
            error: error.message,
            status: error.response?.status
          });
        }
      }
    );
  };
  
  return axiosInstance;
}