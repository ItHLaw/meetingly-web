import { useState } from 'react';
import { 
  WifiIcon, 
  ExclamationTriangleIcon, 
  ClockIcon,
  XMarkIcon 
} from '@heroicons/react/24/outline';
import { useNetworkStatus, useOfflineQueue } from '@/lib/offline';

/**
 * Network status indicator that shows connection state and queued requests
 */
export function OfflineStatus() {
  const networkStatus = useNetworkStatus();
  const { queuedRequests, clearQueue } = useOfflineQueue();
  const [isExpanded, setIsExpanded] = useState(false);

  // Don't show anything if online and no queued requests
  if (networkStatus.isOnline && queuedRequests.length === 0) {
    return null;
  }

  const getConnectionText = () => {
    if (!networkStatus.isOnline) {
      return 'Offline';
    }
    
    if (networkStatus.effectiveType) {
      return `Online (${networkStatus.effectiveType.toUpperCase()})`;
    }
    
    return 'Online';
  };

  const getConnectionColor = () => {
    if (!networkStatus.isOnline) {
      return 'bg-red-500';
    }
    
    if (queuedRequests.length > 0) {
      return 'bg-yellow-500';
    }
    
    return 'bg-green-500';
  };

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Main status indicator */}
      <div 
        className={`
          flex items-center gap-2 px-3 py-2 rounded-lg shadow-lg cursor-pointer
          transition-all duration-200 hover:shadow-xl
          ${networkStatus.isOnline 
            ? queuedRequests.length > 0 
              ? 'bg-yellow-50 border-yellow-200 text-yellow-800 border' 
              : 'bg-green-50 border-green-200 text-green-800 border'
            : 'bg-red-50 border-red-200 text-red-800 border'
          }
        `}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {networkStatus.isOnline ? (
          <WifiIcon className="h-4 w-4" />
        ) : (
          <ExclamationTriangleIcon className="h-4 w-4" />
        )}
        
        <span className="text-sm font-medium">
          {getConnectionText()}
        </span>
        
        {queuedRequests.length > 0 && (
          <div className="flex items-center gap-1">
            <ClockIcon className="h-4 w-4" />
            <span className="text-xs bg-white px-1.5 py-0.5 rounded-full">
              {queuedRequests.length}
            </span>
          </div>
        )}

        {/* Connection quality indicator */}
        <div className={`w-2 h-2 rounded-full ${getConnectionColor()}`} />
      </div>

      {/* Expanded details */}
      {isExpanded && (
        <div className="mt-2 bg-white border border-gray-200 rounded-lg shadow-lg p-4 max-w-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-900">Network Status</h3>
            <button
              onClick={() => setIsExpanded(false)}
              className="text-gray-400 hover:text-gray-600"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Connection details */}
          <div className="space-y-2 text-xs text-gray-600 mb-4">
            <div>Status: {networkStatus.isOnline ? 'Online' : 'Offline'}</div>
            {networkStatus.effectiveType && (
              <div>Connection: {networkStatus.effectiveType.toUpperCase()}</div>
            )}
            {networkStatus.downlink && (
              <div>Speed: {networkStatus.downlink} Mbps</div>
            )}
            {networkStatus.rtt && (
              <div>Latency: {networkStatus.rtt}ms</div>
            )}
          </div>

          {/* Queued requests */}
          {queuedRequests.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-900">
                  Queued Requests ({queuedRequests.length})
                </h4>
                <button
                  onClick={clearQueue}
                  className="text-xs text-red-600 hover:text-red-800"
                >
                  Clear All
                </button>
              </div>
              
              <div className="space-y-2 max-h-32 overflow-y-auto">
                {queuedRequests.slice(0, 5).map((request) => (
                  <div
                    key={request.id}
                    className="p-2 bg-gray-50 rounded text-xs"
                  >
                    <div className="font-medium text-gray-900">
                      {request.method} {new URL(request.url).pathname}
                    </div>
                    <div className="text-gray-500 mt-1">
                      Queued: {formatTimestamp(request.timestamp)}
                      {request.retryCount > 0 && (
                        <span className="ml-2 text-yellow-600">
                          (Retry {request.retryCount}/{request.maxRetries})
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                
                {queuedRequests.length > 5 && (
                  <div className="text-xs text-gray-500 text-center">
                    ... and {queuedRequests.length - 5} more
                  </div>
                )}
              </div>
            </div>
          )}

          {/* No requests message */}
          {queuedRequests.length === 0 && networkStatus.isOnline && (
            <div className="text-xs text-green-600 text-center py-2">
              All requests processed successfully
            </div>
          )}

          {!networkStatus.isOnline && (
            <div className="text-xs text-red-600 text-center py-2">
              Requests will be processed when connection is restored
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Simple inline network status indicator for use in headers or navigation
 */
export function InlineNetworkStatus() {
  const networkStatus = useNetworkStatus();
  const { queuedRequests } = useOfflineQueue();

  if (networkStatus.isOnline && queuedRequests.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      {networkStatus.isOnline ? (
        <div className="flex items-center gap-1 text-yellow-600">
          <ClockIcon className="h-4 w-4" />
          <span>{queuedRequests.length} pending</span>
        </div>
      ) : (
        <div className="flex items-center gap-1 text-red-600">
          <ExclamationTriangleIcon className="h-4 w-4" />
          <span>Offline</span>
        </div>
      )}
    </div>
  );
}