# Error Handling and Offline Functionality Guide

## Overview

This guide documents the comprehensive error handling patterns and offline functionality implemented in the Meetingly Web application. The system provides robust error recovery, user-friendly feedback, and seamless offline/online transitions.

## Architecture Overview

### Error Handling Components

1. **Error Boundaries** (`/web-app/src/components/error/`)
   - React Error Boundaries for component-level error catching
   - Graceful degradation and recovery options

2. **Unified Error Handling** (`/web-app/src/lib/errorHandling.ts`)
   - Error categorization and standardized processing
   - User-friendly message formatting
   - Enhanced logging with context

3. **Notification Service** (`/web-app/src/services/notificationService.ts`)
   - Centralized user feedback system
   - Specialized error notifications with retry actions
   - Multi-type notification support

4. **Retry Logic** (`/web-app/src/lib/retry.ts`)
   - Exponential backoff retry mechanisms
   - Configurable retry strategies per operation type
   - Circuit breaker patterns

5. **Offline Handling** (`/web-app/src/lib/offline.ts`)
   - Network status detection
   - Request queuing for offline operations
   - Automatic retry when online

## Error Categories and Handling

### Error Classification System

The system categorizes all errors into specific types for consistent handling:

```typescript
export enum ErrorCategory {
  NETWORK = 'network',           // Connection issues
  AUTHENTICATION = 'authentication', // Auth failures  
  AUTHORIZATION = 'authorization',   // Permission denied
  VALIDATION = 'validation',         // Input validation
  NOT_FOUND = 'not_found',          // Resource not found
  SERVER = 'server',                // 5xx server errors
  CLIENT = 'client',                // 4xx client errors
  UNKNOWN = 'unknown'               // Uncategorized errors
}
```

### Category-Specific Handling

#### Network Errors (Connection Issues)

**Characteristics:**
- No response from server
- Connection timeouts
- DNS resolution failures

**Handling Strategy:**
```typescript
{
  title: 'Connection Error',
  message: 'Unable to connect to the server. Please check your internet connection and try again.',
  type: 'error',
  retryable: true,
  duration: 5000
}
```

**User Experience:**
- Automatic retry with exponential backoff
- Offline mode activation if persistent
- Queue operations for when connection restored

#### Authentication Errors (401)

**Characteristics:**
- Invalid or expired JWT tokens
- Microsoft SSO failures
- Session timeouts

**Handling Strategy:**
```typescript
{
  title: 'Authentication Required',
  message: 'Your session has expired. Please log in again.',
  type: 'warning',
  retryable: false,
  duration: 0 // Persistent until action taken
}
```

**User Experience:**
- Immediate logout and redirect to login
- Preserve current page for post-login redirect
- Clear stored authentication data

#### Authorization Errors (403)

**Characteristics:**
- Valid authentication but insufficient permissions
- Tenant isolation violations
- Feature access restrictions

**Handling Strategy:**
```typescript
{
  title: 'Access Denied',
  message: 'You do not have permission to perform this action.',
  type: 'error',
  retryable: false,
  duration: 4000
}
```

**User Experience:**
- Clear explanation of permission requirements
- Contact administrator suggestions
- Navigation to accessible areas

#### Validation Errors (400, 422)

**Characteristics:**
- Invalid input data
- Missing required fields
- Format violations

**Handling Strategy:**
```typescript
{
  title: 'Invalid Input',
  message: validationMessage,
  type: 'warning',
  retryable: true,
  duration: 6000
}
```

**User Experience:**
- Field-specific error messages
- Form validation highlighting
- Guidance on correct input format

## Retry Logic System

### Retry Configurations

Different operation types use optimized retry configurations:

```typescript
export const DEFAULT_RETRY_CONFIGS = {
  network: {
    maxAttempts: 3,
    baseDelay: 1000,
    maxDelay: 10000,
    backoffMultiplier: 2,
    jitter: true
  },
  upload: {
    maxAttempts: 5,
    baseDelay: 2000,
    maxDelay: 30000,
    backoffMultiplier: 1.5,
    jitter: true
  },
  auth: {
    maxAttempts: 2,
    baseDelay: 1000,
    maxDelay: 5000,
    backoffMultiplier: 2,
    jitter: false
  }
};
```

### Retry Implementation

The retry system uses a sophisticated approach with:

1. **Exponential Backoff**: Increasing delays between attempts
2. **Jitter**: Random delay variation to prevent thundering herd
3. **Circuit Breaker**: Temporary failure tracking
4. **Condition-based Retry**: Only retry appropriate error types

```typescript
async function withRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIGS.network
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Don't retry non-retryable errors
      if (!shouldRetryError(error)) {
        throw error;
      }
      
      // Don't retry on last attempt
      if (attempt === config.maxAttempts) {
        break;
      }
      
      // Calculate delay with jitter
      const delay = calculateRetryDelay(config, attempt);
      await sleep(delay);
    }
  }
  
  throw lastError;
}
```

### Integration with API Calls

All API services use retry-enabled HTTP clients:

```typescript
// Enhanced API client with retry logic
export const api = createAxiosWithRetry({
  baseURL: apiConfig.baseURL,
  timeout: 30000,
  retryConfig: DEFAULT_RETRY_CONFIGS.network
});

// Usage in services
const response = await api.post('/meetings', meetingData);
```

## Offline Functionality

### Network Status Detection

The system continuously monitors network connectivity:

```typescript
class OfflineManager {
  private isOnline: boolean = navigator.onLine;
  private listeners = new Set<(online: boolean) => void>();
  
  constructor() {
    window.addEventListener('online', this.handleOnline);
    window.addEventListener('offline', this.handleOffline);
    
    // Additional connectivity checks
    this.startConnectivityPolling();
  }
  
  private startConnectivityPolling() {
    setInterval(async () => {
      try {
        await fetch('/api/health', { method: 'HEAD' });
        this.setOnlineStatus(true);
      } catch {
        this.setOnlineStatus(false);
      }
    }, 30000);
  }
}
```

### Request Queue Management

When offline, operations are queued for later execution:

```typescript
interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  data?: any;
  headers?: Record<string, string>;
  timestamp: number;
  retryCount: number;
  priority: 'high' | 'medium' | 'low';
}

class RequestQueue {
  private queue: QueuedRequest[] = [];
  private processing = false;
  
  async enqueue(request: Omit<QueuedRequest, 'id' | 'timestamp' | 'retryCount'>) {
    const queuedRequest: QueuedRequest = {
      ...request,
      id: generateId(),
      timestamp: Date.now(),
      retryCount: 0
    };
    
    this.queue.push(queuedRequest);
    this.persistQueue();
    
    // Show user feedback
    notify.info(`Operation queued for when connection is restored`, {
      action: {
        label: 'View Queue',
        onClick: () => this.showQueueStatus()
      }
    });
  }
  
  async processQueue() {
    if (this.processing || !this.isOnline()) return;
    
    this.processing = true;
    const sortedQueue = this.queue.sort((a, b) => 
      this.getPriorityWeight(b.priority) - this.getPriorityWeight(a.priority)
    );
    
    for (const request of sortedQueue) {
      try {
        await this.executeRequest(request);
        this.removeFromQueue(request.id);
        
        notify.success(`Queued operation completed: ${request.method} ${request.url}`);
      } catch (error) {
        request.retryCount++;
        
        if (request.retryCount >= 3) {
          this.removeFromQueue(request.id);
          notify.error(`Queued operation failed: ${request.method} ${request.url}`);
        }
      }
    }
    
    this.processing = false;
  }
}
```

### Offline UI Components

#### Offline Status Indicator

Shows current connection status and queued operations:

```typescript
export function OfflineStatus() {
  const { isOnline, queuedRequests } = useOffline();
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (isOnline && queuedRequests.length === 0) {
    return null;
  }
  
  return (
    <div className="fixed bottom-4 right-4 z-50">
      <div className={`rounded-lg shadow-lg transition-all ${
        isOnline ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
      }`}>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center space-x-2 px-4 py-2"
        >
          <div className={`w-2 h-2 rounded-full ${
            isOnline ? 'bg-green-500' : 'bg-red-500'
          }`} />
          <span className="text-sm font-medium">
            {isOnline ? 'Online' : 'Offline'}
          </span>
          {queuedRequests.length > 0 && (
            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded-full">
              {queuedRequests.length} queued
            </span>
          )}
        </button>
        
        {isExpanded && (
          <div className="border-t p-4 space-y-2">
            <h4 className="font-medium text-sm">Connection Status</h4>
            <p className="text-xs text-gray-600">
              {isOnline 
                ? 'Connected to server'
                : 'Disconnected - operations will be queued'
              }
            </p>
            
            {queuedRequests.length > 0 && (
              <div className="space-y-1">
                <h5 className="font-medium text-xs">Queued Operations:</h5>
                {queuedRequests.slice(0, 3).map(req => (
                  <div key={req.id} className="text-xs text-gray-500">
                    {req.method} {req.url}
                  </div>
                ))}
                {queuedRequests.length > 3 && (
                  <div className="text-xs text-gray-400">
                    +{queuedRequests.length - 3} more
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

## Error Boundaries

### Component-Level Error Boundaries

React Error Boundaries catch JavaScript errors in component trees:

```typescript
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<
  PropsWithChildren<ErrorBoundaryProps>,
  ErrorBoundaryState
> {
  constructor(props: PropsWithChildren<ErrorBoundaryProps>) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }
  
  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }
  
  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    
    // Log error with context
    logError(error, {
      component: this.props.fallbackComponent || 'ErrorBoundary',
      errorInfo: errorInfo.componentStack,
      additionalData: {
        props: this.props,
        timestamp: new Date().toISOString()
      }
    });
    
    // Send to error reporting service
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }
  
  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.state.errorInfo);
      }
      
      return (
        <ErrorFallback
          error={this.state.error}
          resetError={() => this.setState({ hasError: false, error: null, errorInfo: null })}
          level={this.props.level || 'component'}
        />
      );
    }
    
    return this.props.children;
  }
}
```

### Error Boundary Placement Strategy

Error boundaries are strategically placed at multiple levels:

1. **Root Level** (`layout.tsx`): Catches all uncaught errors
2. **Page Level**: Prevents entire page crashes
3. **Component Level**: Isolates complex component failures
4. **Feature Level**: Protects critical application features

```typescript
// Root layout with comprehensive error handling
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <ErrorBoundary level="application">
          <AuthProvider>
            <ErrorBoundary level="auth">
              {children}
            </ErrorBoundary>
            <Toaster />
            <NotificationSystem />
            <OfflineStatus />
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
```

## Notification System

### Unified Notification Service

The notification service provides consistent user feedback across all error scenarios:

```typescript
class NotificationService {
  // Standard notification types
  success(message: string, options?: NotificationOptions) { /* ... */ }
  error(message: string, options?: NotificationOptions) { /* ... */ }
  warning(message: string, options?: NotificationOptions) { /* ... */ }
  info(message: string, options?: NotificationOptions) { /* ... */ }
  
  // Specialized error handlers
  apiError(error: any, context?: ErrorContext) {
    const uiError = formatErrorForUI(error);
    
    switch (uiError.type) {
      case 'error':
        this.error(uiError.message, {
          duration: uiError.duration,
          action: uiError.retryable ? {
            label: 'Retry',
            onClick: () => this.emitRetryEvent()
          } : undefined
        });
        break;
      // Handle other types...
    }
  }
  
  authError(message?: string) {
    // Show immediate feedback
    this.error(message || 'Your session has expired. Please log in again.');
    
    // Show persistent login action
    setTimeout(() => {
      this.persistent('Session expired', 'error');
    }, 2000);
  }
  
  networkError(retryAction?: () => void) {
    this.error('Connection failed. Check your internet connection.');
    
    if (retryAction) {
      setTimeout(() => {
        // Show retry option after connection might be restored
        this.showRetryOption(retryAction);
      }, 3000);
    }
  }
}
```

### Smart Notification Features

1. **Context-Aware Messaging**: Different messages based on error context
2. **Retry Actions**: Interactive retry buttons for recoverable errors
3. **Progressive Disclosure**: More details available on demand
4. **Auto-Dismissal**: Smart timing based on message importance
5. **Persistent Notifications**: Critical errors stay until addressed

## Implementation Patterns

### Service Integration

All services integrate with the error handling system:

```typescript
class AudioService {
  async uploadFile(file: File, options?: AudioUploadOptions): Promise<string> {
    try {
      const response = await withRetry(
        () => audioAPI.upload(file, options),
        DEFAULT_RETRY_CONFIGS.upload
      );
      return response.data.job_id;
    } catch (error) {
      // Centralized error handling
      notify.apiError(error, {
        action: 'audio_upload',
        component: 'AudioService'
      });
      throw error;
    }
  }
}
```

### Component Integration

Components use standardized error handling patterns:

```typescript
export function AudioUploadModal({ isOpen, onClose, onUploadSuccess }: Props) {
  const [error, setError] = useState<string | null>(null);
  
  const handleUpload = async () => {
    try {
      setError(null);
      
      // API call with built-in retry logic
      const result = await audioService.uploadFile(selectedFile, options);
      
      notify.success('Upload successful! Processing started.');
      onUploadSuccess(result.jobId, result.meetingId);
      
    } catch (error: any) {
      // Use unified error handling
      const uiError = notify.apiError(error, {
        action: 'audio_upload',
        component: 'AudioUploadModal',
        showNotification: false // Handle in component
      });
      
      setError(uiError.message);
    }
  };
  
  return (
    <ErrorBoundary>
      {/* Modal content */}
      {error && <FormError error={error} />}
    </ErrorBoundary>
  );
}
```

## Testing Error Scenarios

### Error Simulation

For development and testing, the system includes error simulation utilities:

```typescript
// Simulate network errors
export const errorSimulator = {
  networkError: () => {
    throw new Error('Network Error');
  },
  
  authError: () => {
    const error = new Error('Unauthorized');
    error.response = { status: 401 };
    throw error;
  },
  
  serverError: () => {
    const error = new Error('Internal Server Error');
    error.response = { status: 500 };
    throw error;
  }
};

// Test retry logic
await testRetryBehavior(errorSimulator.networkError, 3);
```

### Integration Testing

Test error handling across the full stack:

```typescript
describe('Error Handling Integration', () => {
  it('should handle network errors with retry', async () => {
    // Mock network failure
    mockAPI.onPost('/upload').networkError();
    
    // Attempt upload
    const result = await audioService.uploadFile(testFile);
    
    // Verify retry attempts
    expect(mockAPI.history.post).toHaveLength(3);
  });
  
  it('should queue requests when offline', async () => {
    // Simulate offline state
    mockNetworkStatus(false);
    
    // Attempt operation
    await meetingService.updateMeeting(meetingId, updates);
    
    // Verify request was queued
    expect(getQueuedRequests()).toHaveLength(1);
    
    // Simulate online state
    mockNetworkStatus(true);
    
    // Verify queue processing
    await waitFor(() => {
      expect(getQueuedRequests()).toHaveLength(0);
    });
  });
});
```

## Monitoring and Analytics

### Error Tracking

The system tracks error patterns for monitoring:

```typescript
interface ErrorMetrics {
  errorCategory: string;
  errorCode: string;
  component: string;
  userId?: string;
  timestamp: string;
  retryAttempts: number;
  resolved: boolean;
}

export function trackError(error: any, context: any) {
  const metrics: ErrorMetrics = {
    errorCategory: categorizeError(error),
    errorCode: getErrorCode(error),
    component: context.component,
    userId: context.userId,
    timestamp: new Date().toISOString(),
    retryAttempts: context.retryAttempts || 0,
    resolved: false
  };
  
  // Send to analytics service
  analytics.track('error_occurred', metrics);
}
```

### Performance Monitoring

Track error handling performance:

```typescript
export function monitorErrorHandling() {
  // Track retry success rates
  const retrySuccessRate = getRetrySuccessRate();
  
  // Track offline queue efficiency
  const queueProcessingTime = getAverageQueueProcessingTime();
  
  // Track user error resolution
  const errorResolutionRate = getUserErrorResolutionRate();
  
  // Send metrics
  metrics.gauge('error_handling.retry_success_rate', retrySuccessRate);
  metrics.gauge('error_handling.queue_processing_time', queueProcessingTime);
  metrics.gauge('error_handling.resolution_rate', errorResolutionRate);
}
```

## Best Practices

### Error Handling Guidelines

1. **Fail Gracefully**: Always provide fallback functionality
2. **Be Specific**: Give users actionable error messages
3. **Log Context**: Include relevant context in error logs
4. **Retry Intelligently**: Only retry operations that can succeed
5. **Notify Appropriately**: Match notification urgency to error severity

### Offline Functionality Guidelines

1. **Queue Critical Operations**: Save important user actions
2. **Provide Feedback**: Always inform users of offline state
3. **Prioritize Sync**: Process most important operations first
4. **Handle Conflicts**: Manage data conflicts on reconnection
5. **Test Thoroughly**: Verify offline/online transitions work smoothly

### User Experience Guidelines

1. **Progressive Enhancement**: Work offline when possible
2. **Clear Communication**: Explain what's happening and why
3. **Recovery Options**: Always provide paths to resolution
4. **Prevent Loss**: Never lose user data due to errors
5. **Learn and Adapt**: Use error patterns to improve the system

## Conclusion

The comprehensive error handling and offline functionality system ensures that users have a robust, reliable experience even when things go wrong. By combining intelligent retry logic, graceful degradation, and proactive user communication, the application maintains usability across various failure scenarios.

The system is designed to be maintainable and extensible, allowing for easy addition of new error types and offline scenarios as the application evolves.