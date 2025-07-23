'use client';

import { useEffect, useState } from 'react';
import { 
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  XCircleIcon
} from '@heroicons/react/24/outline';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { webSocketService, ProcessingStatusUpdate } from '@/services/websocket';

interface ProcessingJob {
  job_id: string;
  meeting_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  current_step?: string;
  error_message?: string;
  result?: any;
  started_at?: Date;
  estimated_duration?: number;
}

interface ProcessingStatusCardProps {
  job: ProcessingJob;
  onJobComplete?: (jobId: string, result: any) => void;
  onJobError?: (jobId: string, error: string) => void;
  className?: string;
}

export function ProcessingStatusCard({
  job: initialJob,
  onJobComplete,
  onJobError,
  className = ''
}: ProcessingStatusCardProps) {
  const [job, setJob] = useState<ProcessingJob>(initialJob);
  const [timeElapsed, setTimeElapsed] = useState(0);

  useEffect(() => {
    // Subscribe to job updates
    webSocketService.subscribeToJob(job.job_id);

    const handleStatusUpdate = (update: ProcessingStatusUpdate) => {
      if (update.job_id === job.job_id) {
        setJob(prev => ({
          ...prev,
          status: update.status,
          progress: update.progress || prev.progress,
          error_message: update.error_message || prev.error_message,
          result: update.result || prev.result
        }));

        // Call callbacks based on status
        if (update.status === 'completed' && update.result) {
          onJobComplete?.(update.job_id, update.result);
        } else if (update.status === 'failed' && update.error_message) {
          onJobError?.(update.job_id, update.error_message);
        }
      }
    };

    webSocketService.addEventListener('processing_status_update', handleStatusUpdate);

    // Timer for elapsed time
    const timer = setInterval(() => {
      if (job.status === 'running' && job.started_at) {
        const elapsed = Math.floor((Date.now() - job.started_at.getTime()) / 1000);
        setTimeElapsed(elapsed);
      }
    }, 1000);

    return () => {
      webSocketService.removeEventListener('processing_status_update', handleStatusUpdate);
      webSocketService.unsubscribeFromJob(job.job_id);
      clearInterval(timer);
    };
  }, [job.job_id, job.status, job.started_at, onJobComplete, onJobError]);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusIcon = () => {
    switch (job.status) {
      case 'completed':
        return <CheckCircleIcon className="w-6 h-6 text-green-500" />;
      case 'failed':
        return <XCircleIcon className="w-6 h-6 text-red-500" />;
      case 'running':
        return <LoadingSpinner size="sm" />;
      case 'pending':
        return <ClockIcon className="w-6 h-6 text-gray-400" />;
      case 'cancelled':
        return <XCircleIcon className="w-6 h-6 text-gray-400" />;
      default:
        return <ClockIcon className="w-6 h-6 text-gray-400" />;
    }
  };

  const getStatusColor = () => {
    switch (job.status) {
      case 'completed':
        return 'text-green-700 bg-green-50 border-green-200';
      case 'failed':
        return 'text-red-700 bg-red-50 border-red-200';
      case 'running':
        return 'text-blue-700 bg-blue-50 border-blue-200';
      case 'pending':
        return 'text-gray-700 bg-gray-50 border-gray-200';
      case 'cancelled':
        return 'text-gray-700 bg-gray-50 border-gray-200';
      default:
        return 'text-gray-700 bg-gray-50 border-gray-200';
    }
  };

  const getStatusLabel = () => {
    switch (job.status) {
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'running':
        return 'Processing';
      case 'pending':
        return 'Queued';
      case 'cancelled':
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  };

  const getProgressSteps = () => {
    const steps = [
      { label: 'Queued', threshold: 0 },
      { label: 'Loading file', threshold: 10 },
      { label: 'Transcribing', threshold: 30 },
      { label: 'Processing segments', threshold: 70 },
      { label: 'Finalizing', threshold: 90 },
      { label: 'Complete', threshold: 100 }
    ];

    return steps.map((step, index) => ({
      ...step,
      completed: job.progress >= step.threshold,
      current: job.progress >= step.threshold && (index === steps.length - 1 || job.progress < steps[index + 1].threshold)
    }));
  };

  return (
    <div className={`bg-white rounded-lg border shadow-sm p-6 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          {getStatusIcon()}
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Audio Processing
            </h3>
            <p className="text-sm text-gray-600">
              Job ID: {job.job_id.slice(0, 8)}...
            </p>
          </div>
        </div>
        
        <span className={`px-3 py-1 text-sm font-medium rounded-full border ${getStatusColor()}`}>
          {getStatusLabel()}
        </span>
      </div>

      {/* Progress Bar (for running jobs) */}
      {job.status === 'running' && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-700">
              {job.current_step || 'Processing...'}
            </span>
            <span className="text-sm text-gray-500">{job.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-500"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Time Information */}
      <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
        {job.status === 'running' && (
          <div>
            <span className="text-gray-600">Time Elapsed:</span>
            <div className="font-mono font-medium">{formatTime(timeElapsed)}</div>
          </div>
        )}
        
        {job.estimated_duration && (
          <div>
            <span className="text-gray-600">Estimated:</span>
            <div className="font-mono font-medium">{formatTime(job.estimated_duration)}</div>
          </div>
        )}
      </div>

      {/* Processing Steps */}
      {job.status === 'running' && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-700 mb-3">Processing Steps</h4>
          <div className="space-y-2">
            {getProgressSteps().map((step, index) => (
              <div key={index} className="flex items-center space-x-3">
                <div className={`w-3 h-3 rounded-full flex-shrink-0 ${
                  step.completed
                    ? 'bg-green-500'
                    : step.current
                    ? 'bg-blue-500 animate-pulse'
                    : 'bg-gray-200'
                }`} />
                <span className={`text-sm ${
                  step.completed
                    ? 'text-green-700'
                    : step.current
                    ? 'text-blue-700 font-medium'
                    : 'text-gray-500'
                }`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error Message */}
      {job.status === 'failed' && job.error_message && (
        <div className="mb-4 p-4 bg-red-50 rounded-lg">
          <div className="flex items-start space-x-2">
            <ExclamationCircleIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-800">Processing Failed</h4>
              <p className="text-sm text-red-700 mt-1">{job.error_message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {job.status === 'completed' && (
        <div className="mb-4 p-4 bg-green-50 rounded-lg">
          <div className="flex items-start space-x-2">
            <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-green-800">Processing Complete!</h4>
              <p className="text-sm text-green-700 mt-1">
                Your audio has been successfully transcribed and is ready for review.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex justify-end space-x-3">
        {job.status === 'failed' && (
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        )}
        
        {job.status === 'completed' && (
          <Button 
            size="sm"
            onClick={() => {
              // Navigate to meeting details or transcript view
              window.location.href = `/meetings/${job.meeting_id}`;
            }}
          >
            View Result
          </Button>
        )}
      </div>
    </div>
  );
}