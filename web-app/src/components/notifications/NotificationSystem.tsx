'use client';

import { useEffect, useState } from 'react';
import { 
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  XCircleIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { webSocketService, SystemNotification, ErrorNotification } from '@/services/websocket';

interface Toast {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
  timestamp: Date;
  duration?: number; // Auto-dismiss after this many ms (0 = no auto-dismiss)
}

const DEFAULT_DURATIONS = {
  info: 5000,
  success: 4000,
  warning: 7000,
  error: 0, // Don't auto-dismiss errors
};

export function NotificationSystem() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const handleSystemNotification = (notification: SystemNotification) => {
      addToast({
        type: notification.notification_type,
        title: notification.title,
        message: notification.message,
        duration: DEFAULT_DURATIONS[notification.notification_type]
      });
    };

    const handleErrorNotification = (error: ErrorNotification) => {
      addToast({
        type: 'error',
        title: 'Error',
        message: error.error_message,
        duration: 0 // Don't auto-dismiss errors
      });
    };

    const handleMaintenanceNotice = (notice: any) => {
      addToast({
        type: 'warning',
        title: 'Maintenance Notice',
        message: notice.message,
        duration: 0 // Don't auto-dismiss maintenance notices
      });
    };

    // Register WebSocket event listeners
    webSocketService.addEventListener('system_notification', handleSystemNotification);
    webSocketService.addEventListener('error', handleErrorNotification);
    webSocketService.addEventListener('maintenance_notice', handleMaintenanceNotice);

    // Cleanup
    return () => {
      webSocketService.removeEventListener('system_notification', handleSystemNotification);
      webSocketService.removeEventListener('error', handleErrorNotification); 
      webSocketService.removeEventListener('maintenance_notice', handleMaintenanceNotice);
    };
  }, []);

  const addToast = (toast: Omit<Toast, 'id' | 'timestamp'>) => {
    const newToast: Toast = {
      id: `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      ...toast
    };

    setToasts(prev => [...prev, newToast]);

    // Auto-dismiss if duration is set
    if (toast.duration && toast.duration > 0) {
      setTimeout(() => {
        removeToast(newToast.id);
      }, toast.duration);
    }
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const removeAllToasts = () => {
    setToasts([]);
  };

  const getToastIcon = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircleIcon className="w-6 h-6 text-green-500" />;
      case 'warning':
        return <ExclamationTriangleIcon className="w-6 h-6 text-yellow-500" />;
      case 'error':
        return <XCircleIcon className="w-6 h-6 text-red-500" />;
      default:
        return <InformationCircleIcon className="w-6 h-6 text-blue-500" />;
    }
  };

  const getToastStyles = (type: Toast['type']) => {
    switch (type) {
      case 'success':
        return 'bg-green-50 border-green-200 text-green-800';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      case 'error':
        return 'bg-red-50 border-red-200 text-red-800';
      default:
        return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full">
      {/* Clear all button when there are multiple toasts */}
      {toasts.length > 1 && (
        <div className="flex justify-end">
          <button
            onClick={removeAllToasts}
            className="text-xs text-gray-500 hover:text-gray-700 bg-white px-2 py-1 rounded border shadow-sm"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Toast list */}
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`p-4 rounded-lg border shadow-lg transition-all duration-300 ease-in-out transform hover:scale-105 ${getToastStyles(toast.type)}`}
        >
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0">
              {getToastIcon(toast.type)}
            </div>
            
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h4 className="text-sm font-semibold">{toast.title}</h4>
                  <p className="text-sm mt-1 leading-relaxed">{toast.message}</p>
                  <p className="text-xs mt-2 opacity-75">
                    {toast.timestamp.toLocaleTimeString()}
                  </p>
                </div>
                
                <button
                  onClick={() => removeToast(toast.id)}
                  className="ml-2 flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Dismiss notification"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// Hook for programmatically showing toasts
export function useNotifications() {
  const showNotification = (
    type: Toast['type'],
    title: string,
    message: string,
    duration?: number
  ) => {
    // This could dispatch to a global state or emit a custom event
    // For now, we'll trigger it through a custom event
    const event = new CustomEvent('show-notification', {
      detail: { type, title, message, duration }
    });
    window.dispatchEvent(event);
  };

  return {
    showSuccess: (title: string, message: string, duration?: number) =>
      showNotification('success', title, message, duration),
    showError: (title: string, message: string, duration?: number) =>
      showNotification('error', title, message, duration),
    showWarning: (title: string, message: string, duration?: number) =>
      showNotification('warning', title, message, duration),
    showInfo: (title: string, message: string, duration?: number) =>
      showNotification('info', title, message, duration),
  };
}