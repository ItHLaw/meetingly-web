'use client';

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { 
  ExclamationTriangleIcon,
  ArrowPathIcon,
  ChevronDownIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  showDetails?: boolean;
  className?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
  retryCount: number;
}

export class ErrorBoundary extends Component<Props, State> {
  private maxRetries = 3;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      showDetails: props.showDetails || false,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    
    // Log error details
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Report to error tracking service
    this.reportError(error, errorInfo);
    
    // Call optional error callback
    this.props.onError?.(error, errorInfo);
  }

  private reportError = async (error: Error, errorInfo: ErrorInfo) => {
    try {
      // In a real application, this would send to an error tracking service
      // like Sentry, LogRocket, or a custom endpoint
      const errorReport = {
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
        timestamp: new Date().toISOString(),
        userAgent: navigator.userAgent,
        url: window.location.href,
        userId: localStorage.getItem('userId') || 'anonymous'
      };
      
      // For now, just log to console in development
      if (process.env.NODE_ENV === 'development') {
        console.log('Error Report:', errorReport);
      }
      
      // In production, send to error tracking service
      // await fetch('/api/errors', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(errorReport)
      // });
      
    } catch (reportingError) {
      console.error('Failed to report error:', reportingError);
    }
  };

  private handleRetry = () => {
    if (this.state.retryCount < this.maxRetries) {
      this.setState(prevState => ({
        hasError: false,
        error: null,
        errorInfo: null,
        retryCount: prevState.retryCount + 1
      }));
    } else {
      // Max retries reached, reload the page
      window.location.reload();
    }
  };

  private handleReload = () => {
    window.location.reload();
  };

  private toggleDetails = () => {
    this.setState(prevState => ({
      showDetails: !prevState.showDetails
    }));
  };

  private getErrorMessage = (error: Error): string => {
    if (error.message.includes('ChunkLoadError')) {
      return 'Failed to load application resources. This might be due to a network issue or a recent update.';
    }
    
    if (error.message.includes('Loading chunk')) {
      return 'There was a problem loading part of the application. Please try refreshing the page.';
    }
    
    if (error.message.includes('NetworkError')) {
      return 'Network connection issue. Please check your internet connection and try again.';
    }
    
    if (error.message.includes('TypeError')) {
      return 'An unexpected error occurred while processing your request.';
    }
    
    return error.message || 'An unexpected error occurred.';
  };

  private getErrorSuggestions = (error: Error): string[] => {
    const suggestions: string[] = [];
    
    if (error.message.includes('ChunkLoadError') || error.message.includes('Loading chunk')) {
      suggestions.push('Refresh the page to reload the latest version');
      suggestions.push('Clear your browser cache and cookies');
      suggestions.push('Check your internet connection');
    } else if (error.message.includes('NetworkError')) {
      suggestions.push('Check your internet connection');
      suggestions.push('Try again in a few moments');
      suggestions.push('Contact support if the problem persists');
    } else {
      suggestions.push('Try refreshing the page');
      suggestions.push('If the problem persists, contact support');
    }
    
    return suggestions;
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI can be provided via props
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { error } = this.state;
      const errorMessage = error ? this.getErrorMessage(error) : 'An unexpected error occurred.';
      const suggestions = error ? this.getErrorSuggestions(error) : [];
      const canRetry = this.state.retryCount < this.maxRetries;

      return (
        <div className={`min-h-[400px] flex items-center justify-center p-8 ${this.props.className || ''}`}>
          <div className="max-w-2xl w-full">
            <div className="bg-white rounded-lg border border-red-200 shadow-lg p-8">
              {/* Error Icon and Title */}
              <div className="flex items-center space-x-4 mb-6">
                <div className="flex-shrink-0">
                  <ExclamationTriangleIcon className="h-12 w-12 text-red-500" />
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">
                    Something went wrong
                  </h2>
                  <p className="text-gray-600">
                    We're sorry, but something unexpected happened.
                  </p>
                </div>
              </div>

              {/* Error Message */}
              <div className="mb-6">
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-red-800 font-medium">
                    {errorMessage}
                  </p>
                </div>
              </div>

              {/* Suggestions */}
              {suggestions.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3">
                    What you can try:
                  </h3>
                  <ul className="space-y-2">
                    {suggestions.map((suggestion, index) => (
                      <li key={index} className="flex items-start space-x-2">
                        <span className="text-blue-500 mt-1">•</span>
                        <span className="text-gray-700">{suggestion}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-3 mb-6">
                {canRetry ? (
                  <Button
                    onClick={this.handleRetry}
                    className="flex items-center space-x-2"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                    <span>Try Again ({this.maxRetries - this.state.retryCount} attempts left)</span>
                  </Button>
                ) : (
                  <Button
                    onClick={this.handleReload}
                    className="flex items-center space-x-2"
                  >
                    <ArrowPathIcon className="h-4 w-4" />
                    <span>Reload Page</span>
                  </Button>
                )}
                
                <Button
                  variant="outline"
                  onClick={() => window.history.back()}
                >
                  Go Back
                </Button>
                
                <Button
                  variant="outline"
                  onClick={() => window.location.href = '/dashboard'}
                >
                  Go to Dashboard
                </Button>
              </div>

              {/* Error Details (Collapsible) */}
              {error && (
                <div className="border-t border-gray-200 pt-6">
                  <button
                    onClick={this.toggleDetails}
                    className="flex items-center space-x-2 text-gray-600 hover:text-gray-800 transition-colors"
                  >
                    {this.state.showDetails ? (
                      <ChevronDownIcon className="h-4 w-4" />
                    ) : (
                      <ChevronRightIcon className="h-4 w-4" />
                    )}
                    <span className="text-sm">
                      {this.state.showDetails ? 'Hide' : 'Show'} technical details
                    </span>
                  </button>
                  
                  {this.state.showDetails && (
                    <div className="mt-4 space-y-4">
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900 mb-2">
                          Error Message:
                        </h4>
                        <pre className="text-xs bg-gray-100 p-3 rounded border overflow-auto">
                          {error.message}
                        </pre>
                      </div>
                      
                      {error.stack && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-2">
                            Stack Trace:
                          </h4>
                          <pre className="text-xs bg-gray-100 p-3 rounded border overflow-auto max-h-40">
                            {error.stack}
                          </pre>
                        </div>
                      )}
                      
                      {this.state.errorInfo?.componentStack && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-900 mb-2">
                            Component Stack:
                          </h4>
                          <pre className="text-xs bg-gray-100 p-3 rounded border overflow-auto max-h-40">
                            {this.state.errorInfo.componentStack}
                          </pre>
                        </div>
                      )}
                      
                      <div className="text-xs text-gray-500">
                        <p>Error ID: {Date.now()}</p>
                        <p>Timestamp: {new Date().toISOString()}</p>
                        <p>User Agent: {navigator.userAgent}</p>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

// Higher-order component for wrapping components with error boundary
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>
) {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );
  
  WrappedComponent.displayName = `withErrorBoundary(${Component.displayName || Component.name})`;
  
  return WrappedComponent;
}