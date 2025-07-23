import { useCallback, useState } from 'react';
import { withRetry, RetryConfig, DEFAULT_RETRY_CONFIGS } from '@/lib/retry';

interface UseRetryState {
  isRetrying: boolean;
  retryCount: number;
  lastError: Error | null;
}

interface UseRetryOptions extends Partial<RetryConfig> {
  onRetryStart?: () => void;
  onRetryEnd?: () => void;
  onRetryError?: (error: Error, attempt: number) => void;
}

/**
 * Hook for handling retry logic in React components
 */
export function useRetry(options: UseRetryOptions = {}) {
  const [state, setState] = useState<UseRetryState>({
    isRetrying: false,
    retryCount: 0,
    lastError: null,
  });

  const executeWithRetry = useCallback(
    async <T>(
      fn: () => Promise<T>,
      retryConfig: RetryConfig = DEFAULT_RETRY_CONFIGS.network
    ): Promise<T> => {
      setState(prev => ({ ...prev, isRetrying: true, lastError: null }));
      
      if (options.onRetryStart) {
        options.onRetryStart();
      }

      try {
        const result = await withRetry(fn, {
          ...retryConfig,
          ...options,
          onRetry: (attempt, error) => {
            setState(prev => ({ ...prev, retryCount: attempt }));
            
            if (options.onRetryError) {
              options.onRetryError(error, attempt);
            }
            
            // Call original onRetry if provided
            if (retryConfig.onRetry) {
              retryConfig.onRetry(attempt, error);
            }
          },
        });

        setState(prev => ({ ...prev, isRetrying: false, retryCount: 0 }));
        
        if (options.onRetryEnd) {
          options.onRetryEnd();
        }

        return result;
      } catch (error) {
        setState(prev => ({ 
          ...prev, 
          isRetrying: false, 
          lastError: error as Error,
          retryCount: 0 
        }));
        
        if (options.onRetryEnd) {
          options.onRetryEnd();
        }

        throw error;
      }
    },
    [options]
  );

  const resetRetryState = useCallback(() => {
    setState({
      isRetrying: false,
      retryCount: 0,
      lastError: null,
    });
  }, []);

  return {
    ...state,
    executeWithRetry,
    resetRetryState,
  };
}

/**
 * Hook specifically for API calls with automatic retry
 */
export function useApiRetry(options: UseRetryOptions = {}) {
  return useRetry({
    ...DEFAULT_RETRY_CONFIGS.api,
    ...options,
  });
}

/**
 * Hook for file upload operations with retry
 */
export function useUploadRetry(options: UseRetryOptions = {}) {
  return useRetry({
    ...DEFAULT_RETRY_CONFIGS.upload,
    ...options,
  });
}