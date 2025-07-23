'use client';

import React, { useState, useEffect, ReactNode } from 'react';
import { ErrorBoundary } from './ErrorBoundary';

interface AsyncErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error) => void;
  className?: string;
}

interface AsyncErrorState {
  error: Error | null;
  hasError: boolean;
}

/**
 * AsyncErrorBoundary - Catches errors from async operations that occur outside of React's render cycle
 * This includes Promise rejections and async/await errors that aren't caught by regular ErrorBoundary
 */
export function AsyncErrorBoundary({ 
  children, 
  onError, 
  className 
}: AsyncErrorBoundaryProps) {
  const [asyncError, setAsyncError] = useState<AsyncErrorState>({
    error: null,
    hasError: false
  });

  useEffect(() => {
    // Handle unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      
      const error = event.reason instanceof Error 
        ? event.reason 
        : new Error(String(event.reason));
      
      setAsyncError({ error, hasError: true });
      onError?.(error);
      
      // Prevent the default browser behavior
      event.preventDefault();
    };

    // Handle uncaught errors
    const handleError = (event: ErrorEvent) => {
      console.error('Uncaught error:', event.error);
      
      const error = event.error instanceof Error 
        ? event.error 
        : new Error(event.message);
      
      setAsyncError({ error, hasError: true });
      onError?.(error);
    };

    // Add event listeners
    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    // Cleanup
    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, [onError]);

  // Reset error state
  const resetError = () => {
    setAsyncError({ error: null, hasError: false });
  };

  // If we have an async error, throw it so the ErrorBoundary can catch it
  if (asyncError.hasError && asyncError.error) {
    throw asyncError.error;
  }

  return (
    <ErrorBoundary 
      className={className}
      onError={(error, errorInfo) => {
        onError?.(error);
        // Reset async error state when ErrorBoundary handles it
        resetError();
      }}
    >
      {children}
    </ErrorBoundary>
  );
}

// Hook for handling async errors in components
export function useAsyncError() {
  const [error, setError] = useState<Error | null>(null);

  const throwError = (error: Error) => {
    setError(error);
  };

  const clearError = () => {
    setError(null);
  };

  // Throw error during render so ErrorBoundary can catch it
  if (error) {
    throw error;
  }

  return { throwError, clearError };
}

// Hook for safe async operations with error handling
export function useSafeAsync() {
  const { throwError } = useAsyncError();

  const safeAsync = async <T,>(
    asyncFn: () => Promise<T>,
    onError?: (error: Error) => void
  ): Promise<T | null> => {
    try {
      return await asyncFn();
    } catch (error) {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      
      if (onError) {
        onError(errorObj);
      } else {
        throwError(errorObj);
      }
      
      return null;
    }
  };

  return { safeAsync };
}