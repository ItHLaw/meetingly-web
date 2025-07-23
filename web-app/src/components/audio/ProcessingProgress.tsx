'use client';

import { useState, useEffect } from 'react';
import { 
  CheckCircleIcon, 
  ExclamationCircleIcon, 
  ClockIcon,
  XCircleIcon 
} from '@heroicons/react/24/outline';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { webSocketService, ProcessingStatusUpdate } from '@/services/websocket';

interface ProcessingStatus {
  job_id: string;
  meeting_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current_step: string;
  error_message?: string;
  result?: any;
  created_at: string;
  updated_at: string;
  estimated_duration?: number;
  actual_duration?: number;
}

interface ProcessingProgressProps {
  jobId: string;
  meetingId: string;
  onComplete?: (result: any) => void;
  onError?: (error: string) => void;
  className?: string;
}

const statusConfig = {
  pending: {
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    icon: ClockIcon,
    label: 'Queued'
  },
  running: {
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    icon: LoadingSpinner,
    label: 'Processing'
  },
  completed: {
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    icon: CheckCircleIcon,
    label: 'Completed'
  },
  failed: {
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    icon: XCircleIcon,
    label: 'Failed'
  },
  cancelled: {
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    icon: XCircleIcon,
    label: 'Cancelled'
  }
};

export function ProcessingProgress({ 
  jobId, 
  meetingId, 
  onComplete, 
  onError,
  className = '' 
}: ProcessingProgressProps) {
  const [status, setStatus] = useState<ProcessingStatus | null>(null);
  const [isPolling, setIsPolling] = useState(true);
  const [timeElapsed, setTimeElapsed] = useState(0);

  useEffect(() => {
    let timeInterval: NodeJS.Timeout;

    // Subscribe to WebSocket updates for this job
    webSocketService.subscribeToJob(jobId);

    const handleStatusUpdate = (update: ProcessingStatusUpdate) => {
      if (update.job_id === jobId) {
        const updatedStatus: ProcessingStatus = {
          job_id: update.job_id,
          meeting_id: update.meeting_id,
          status: update.status,
          progress: update.progress || 0,
          current_step: getCurrentStepFromProgress(update.progress || 0),
          error_message: update.error_message,
          result: update.result,
          created_at: new Date().toISOString(),
          updated_at: update.timestamp,
          estimated_duration: 180, // 3 minutes default
          actual_duration: update.status === 'completed' ? timeElapsed : undefined
        };

        setStatus(updatedStatus);

        if (update.status === 'completed') {
          setIsPolling(false);
          onComplete?.(update.result);
        } else if (update.status === 'failed') {
          setIsPolling(false);
          onError?.(update.error_message || 'Processing failed');
        }
      }
    };

    // Register WebSocket listener
    webSocketService.addEventListener('processing_status_update', handleStatusUpdate);

    // Start time tracking
    if (isPolling) {
      timeInterval = setInterval(() => {
        setTimeElapsed(prev => prev + 1);
      }, 1000);
    }

    return () => {
      webSocketService.removeEventListener('processing_status_update', handleStatusUpdate);
      webSocketService.unsubscribeFromJob(jobId);
      if (timeInterval) clearInterval(timeInterval);
    };
  }, [jobId, meetingId, isPolling, onComplete, onError]);

  const getCurrentStepFromProgress = (progress: number): string => {
    if (progress < 10) return 'Loading audio file...';
    if (progress < 30) return 'Transcribing with Whisper...';
    if (progress < 70) return 'Processing transcript segments...';
    if (progress < 95) return 'Finalizing results...';
    return 'Processing completed';
  };

  const handleRetry = () => {
    setTimeElapsed(0);
    setIsPolling(true);
  };

  const handleCancel = async () => {
    try {
      // In real implementation: await audioAPI.cancelProcessingJob(jobId)
      setStatus(prev => prev ? { ...prev, status: 'cancelled' } : null);
      setIsPolling(false);
    } catch (error) {
      console.error('Failed to cancel job:', error);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    return `${Math.floor(diffInSeconds / 3600)}h ago`;
  };

  if (!status) {
    return (
      <div className={`bg-white rounded-lg border p-4 ${className}`}>
        <div className="flex items-center space-x-3">
          <LoadingSpinner size="sm" />
          <span className="text-sm text-gray-600">Loading processing status...</span>
        </div>
      </div>
    );
  }

  const config = statusConfig[status.status];
  const StatusIcon = config.icon;

  return (
    <div className={`bg-white rounded-lg border shadow-sm ${className}`}>
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className={`w-10 h-10 ${config.bgColor} rounded-lg flex items-center justify-center`}>
              {status.status === 'running' ? (
                <LoadingSpinner size="sm" />
              ) : (
                <StatusIcon className={`w-5 h-5 ${config.color}`} />
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-900">
                Audio Processing
              </h3>
              <p className="text-xs text-gray-500">
                Job ID: {jobId.slice(0, 8)}...
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.bgColor} ${config.color}`}>
              {config.label}
            </span>
            {status.status === 'running' && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCancel}
                className="text-xs"
              >
                Cancel
              </Button>
            )}
          </div>
        </div>

        {/* Progress Bar */}
        {(status.status === 'running' || status.status === 'pending') && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-700">{status.current_step}</span>
              <span className="text-sm text-gray-500">{Math.round(status.progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                style={{ width: `${status.progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Status Details */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-600">Started:</span>
            <span className="text-gray-900">{formatTimeAgo(status.created_at)}</span>
          </div>
          
          {status.estimated_duration && (
            <div className="flex justify-between">
              <span className="text-gray-600">Estimated Duration:</span>
              <span className="text-gray-900">{formatDuration(status.estimated_duration)}</span>
            </div>
          )}
          
          <div className="flex justify-between">
            <span className="text-gray-600">Time Elapsed:</span>
            <span className="text-gray-900">{formatDuration(timeElapsed)}</span>
          </div>

          {status.actual_duration && (
            <div className="flex justify-between">
              <span className="text-gray-600">Total Duration:</span>
              <span className="text-gray-900">{formatDuration(status.actual_duration)}</span>
            </div>
          )}
        </div>

        {/* Error Message */}
        {status.status === 'failed' && status.error_message && (
          <div className="mt-4 p-3 bg-red-50 rounded-lg">
            <div className="flex items-center space-x-2">
              <ExclamationCircleIcon className="w-5 h-5 text-red-500" />
              <span className="text-sm text-red-700">{status.error_message}</span>
            </div>
            <div className="mt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRetry}
                className="text-red-600 border-red-300 hover:bg-red-50"
              >
                Retry Processing
              </Button>
            </div>
          </div>
        )}

        {/* Success Result */}
        {status.status === 'completed' && status.result && (
          <div className="mt-4 p-3 bg-green-50 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <CheckCircleIcon className="w-5 h-5 text-green-500" />
              <span className="text-sm font-medium text-green-800">Processing Complete!</span>
            </div>
            <div className="text-xs text-green-700 space-y-1">
              {status.result.language && (
                <div>Language detected: {status.result.language.toUpperCase()}</div>
              )}
              {status.result.duration && (
                <div>Audio duration: {formatDuration(status.result.duration)}</div>
              )}
              <div>Transcript ready for review</div>
            </div>
          </div>
        )}

        {/* Processing Steps Indicator */}
        {status.status === 'running' && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <h4 className="text-xs font-medium text-gray-700 mb-2">Processing Steps:</h4>
            <div className="space-y-2">
              {[
                { step: 'File Upload', completed: true },
                { step: 'Audio Validation', completed: true },
                { step: 'Whisper Transcription', completed: status.progress > 30 },
                { step: 'Speaker Diarization', completed: status.progress > 60 },
                { step: 'Final Processing', completed: status.progress > 90 },
              ].map((item, index) => (
                <div key={index} className="flex items-center space-x-2">
                  {item.completed ? (
                    <CheckCircleIcon className="w-4 h-4 text-green-500" />
                  ) : status.current_step.toLowerCase().includes(item.step.toLowerCase()) ? (
                    <LoadingSpinner size="sm" />
                  ) : (
                    <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                  )}
                  <span className={`text-xs ${
                    item.completed ? 'text-green-700' : 
                    status.current_step.toLowerCase().includes(item.step.toLowerCase()) ? 'text-blue-700' : 
                    'text-gray-500'
                  }`}>
                    {item.step}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}