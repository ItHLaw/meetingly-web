/**
 * Unified notification service for consistent user feedback across the application
 */

import toast from 'react-hot-toast';
import { formatErrorForUI, UIError, logError } from '@/lib/errorHandling';

export interface NotificationOptions {
  duration?: number;
  position?: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
  dismissible?: boolean;
  action?: {
    label: string;
    onClick: () => void;
  };
}

class NotificationService {
  private static instance: NotificationService;

  private constructor() {}

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Show success notification
   */
  success(message: string, options: NotificationOptions = {}) {
    const { duration = 3000 } = options;
    
    toast.success(message, {
      duration,
      position: 'top-right',
      style: {
        background: '#10B981',
        color: '#FFFFFF',
        borderRadius: '8px',
        padding: '12px 16px',
      },
      iconTheme: {
        primary: '#FFFFFF',
        secondary: '#10B981',
      },
    });
  }

  /**
   * Show error notification
   */
  error(message: string, options: NotificationOptions = {}) {
    const { duration = 5000, action } = options;
    
    toast.error(message, {
      duration,
      position: 'top-right',
      style: {
        background: '#EF4444',
        color: '#FFFFFF',
        borderRadius: '8px',
        padding: '12px 16px',
        maxWidth: '400px',
      },
      iconTheme: {
        primary: '#FFFFFF',
        secondary: '#EF4444',
      },
    });

    // If there's an action, show it as a separate toast
    if (action) {
      setTimeout(() => {
        toast((t) => (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700">Need help?</span>
            <button
              onClick={() => {
                action.onClick();
                toast.dismiss(t.id);
              }}
              className="bg-blue-600 text-white px-3 py-1 rounded-md text-sm hover:bg-blue-700 transition-colors"
            >
              {action.label}
            </button>
          </div>
        ), {
          duration: 10000,
          position: 'bottom-right',
        });
      }, 1000);
    }
  }

  /**
   * Show warning notification
   */
  warning(message: string, options: NotificationOptions = {}) {
    const { duration = 4000 } = options;
    
    toast(message, {
      duration,
      position: 'top-right',
      icon: '⚠️',
      style: {
        background: '#F59E0B',
        color: '#FFFFFF',
        borderRadius: '8px',
        padding: '12px 16px',
      },
    });
  }

  /**
   * Show info notification
   */
  info(message: string, options: NotificationOptions = {}) {
    const { duration = 3000 } = options;
    
    toast(message, {
      duration,
      position: 'top-right',
      icon: 'ℹ️',
      style: {
        background: '#3B82F6',
        color: '#FFFFFF',
        borderRadius: '8px',
        padding: '12px 16px',
      },
    });
  }

  /**
   * Show loading notification with promise handling
   */
  loading<T>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    }
  ): Promise<T> {
    return toast.promise(
      promise,
      {
        loading: messages.loading,
        success: (data) => {
          return typeof messages.success === 'function' 
            ? messages.success(data) 
            : messages.success;
        },
        error: (error) => {
          logError(error, { action: 'promise_notification' });
          return typeof messages.error === 'function' 
            ? messages.error(error) 
            : messages.error;
        },
      },
      {
        position: 'top-right',
        style: {
          borderRadius: '8px',
          padding: '12px 16px',
        },
      }
    );
  }

  /**
   * Handle API errors with consistent formatting and user feedback
   */
  handleApiError(error: any, context: {
    action?: string;
    component?: string;
    showNotification?: boolean;
    fallbackMessage?: string;
  } = {}) {
    const { showNotification = true, fallbackMessage, ...logContext } = context;
    
    // Log the error with context
    logError(error, logContext);
    
    // Format error for UI
    const uiError = formatErrorForUI(error);
    
    // Show notification if requested
    if (showNotification) {
      switch (uiError.type) {
        case 'error':
          this.error(uiError.message, { 
            duration: uiError.duration,
            action: uiError.retryable ? {
              label: 'Retry',
              onClick: () => {
                // Emit a retry event that can be caught by components
                window.dispatchEvent(new CustomEvent('retry-last-action'));
              }
            } : undefined
          });
          break;
        case 'warning':
          this.warning(uiError.message, { duration: uiError.duration });
          break;
        case 'info':
          this.info(uiError.message, { duration: uiError.duration });
          break;
      }
    }
    
    return uiError;
  }

  /**
   * Show authentication error with login redirect
   */
  authError(message: string = 'Your session has expired. Please log in again.') {
    toast.error(message, {
      duration: 6000,
      position: 'top-center',
      style: {
        background: '#EF4444',
        color: '#FFFFFF',
        borderRadius: '8px',
        padding: '16px 20px',
        fontSize: '16px',
        fontWeight: '500',
      },
    });

    // Show login action after a delay
    setTimeout(() => {
      toast((t) => (
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-700">Session expired</span>
          <button
            onClick={() => {
              window.location.href = '/login';
              toast.dismiss(t.id);
            }}
            className="bg-blue-600 text-white px-4 py-2 rounded-md text-sm hover:bg-blue-700 transition-colors"
          >
            Login Again
          </button>
        </div>
      ), {
        duration: 0, // Persistent until dismissed
        position: 'top-center',
      });
    }, 2000);
  }

  /**
   * Show network error with retry option
   */
  networkError(retryAction?: () => void) {
    const message = 'Connection failed. Check your internet connection.';
    
    toast.error(message, {
      duration: 6000,
      position: 'top-right',
      style: {
        background: '#EF4444',
        color: '#FFFFFF',
        borderRadius: '8px',
        padding: '12px 16px',
      },
    });

    if (retryAction) {
      setTimeout(() => {
        toast((t) => (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-700">Connection restored?</span>
            <button
              onClick={() => {
                retryAction();
                toast.dismiss(t.id);
              }}
              className="bg-green-600 text-white px-3 py-1 rounded-md text-sm hover:bg-green-700 transition-colors"
            >
              Retry Now
            </button>
          </div>
        ), {
          duration: 15000,
          position: 'bottom-right',
        });
      }, 3000);
    }
  }

  /**
   * Dismiss all notifications
   */
  dismissAll() {
    toast.dismiss();
  }

  /**
   * Create a persistent notification that stays until manually dismissed
   */
  persistent(message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') {
    const styles = {
      success: { background: '#10B981', color: '#FFFFFF' },
      error: { background: '#EF4444', color: '#FFFFFF' },
      warning: { background: '#F59E0B', color: '#FFFFFF' },
      info: { background: '#3B82F6', color: '#FFFFFF' },
    };

    return toast(message, {
      duration: 0, // Persistent
      position: 'top-center',
      style: {
        ...styles[type],
        borderRadius: '8px',
        padding: '16px 20px',
        fontSize: '16px',
        fontWeight: '500',
        maxWidth: '500px',
      },
    });
  }
}

// Export singleton instance
export const notificationService = NotificationService.getInstance();

// Convenience exports
export const notify = {
  success: (message: string, options?: NotificationOptions) => 
    notificationService.success(message, options),
  error: (message: string, options?: NotificationOptions) => 
    notificationService.error(message, options),
  warning: (message: string, options?: NotificationOptions) => 
    notificationService.warning(message, options),
  info: (message: string, options?: NotificationOptions) => 
    notificationService.info(message, options),
  loading: <T,>(promise: Promise<T>, messages: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((error: any) => string);
  }) => notificationService.loading(promise, messages),
  apiError: (error: any, context?: Parameters<typeof notificationService.handleApiError>[1]) => 
    notificationService.handleApiError(error, context),
  authError: (message?: string) => 
    notificationService.authError(message),
  networkError: (retryAction?: () => void) => 
    notificationService.networkError(retryAction),
};