'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { 
  DocumentTextIcon,
  ClockIcon,
  UserGroupIcon,
  EyeIcon,
  ShareIcon,
  CloudArrowDownIcon
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/ui/LoadingSpinner';
import { webSocketService, MeetingCreated, MeetingUpdated } from '@/services/websocket';
import { useMeetings } from '@/hooks';
import { Meeting } from '@/types';
import toast from 'react-hot-toast';

interface RealtimeMeetingsListProps {
  className?: string;
  limit?: number;
  showActions?: boolean;
}

export function RealtimeMeetingsList({
  className = '',
  limit,
  showActions = true
}: RealtimeMeetingsListProps) {
  const { meetings, loading, error, refetch } = useMeetings();
  const [realtimeMeetings, setRealtimeMeetings] = useState<Meeting[]>([]);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date>(new Date());

  useEffect(() => {
    // Initialize with fetched meetings
    setRealtimeMeetings(meetings);
  }, [meetings]);

  useEffect(() => {
    const handleMeetingCreated = (event: MeetingCreated) => {
      const newMeeting: Meeting = {
        id: event.meeting.id,
        title: event.meeting.name,
        description: '',
        status: event.meeting.status,
        processing_status: event.meeting.processing_status,
        created_at: event.meeting.created_at,
        updated_at: event.meeting.created_at,
        participants: event.meeting.participants,
        duration: 0,
        user_id: '', // Will be populated by the API
        meeting_date: null,
        transcript_text: null,
        transcript_language: null,
        summary_data: null,
        tags: [],
        metadata: {},
        is_archived: false,
        processing_started_at: null,
        processing_completed_at: null
      };

      setRealtimeMeetings(prev => [newMeeting, ...prev]);
      setLastUpdateTime(new Date());
      
      toast.success(`New meeting "${event.meeting.name}" created`, {
        duration: 4000,
        position: 'top-right'
      });
    };

    const handleMeetingUpdated = (event: MeetingUpdated) => {
      setRealtimeMeetings(prev => 
        prev.map(meeting => 
          meeting.id === event.meeting.id
            ? {
                ...meeting,
                title: event.meeting.name,
                status: event.meeting.status,
                processing_status: event.meeting.processing_status,
                updated_at: event.meeting.updated_at,
                participants: event.meeting.participants
              }
            : meeting
        )
      );
      setLastUpdateTime(new Date());
      
      // Show toast for significant status changes
      if (event.meeting.processing_status === 'completed') {
        toast.success(`"${event.meeting.name}" processing completed`, {
          duration: 4000,
          position: 'top-right'
        });
      } else if (event.meeting.processing_status === 'failed') {
        toast.error(`"${event.meeting.name}" processing failed`, {
          duration: 6000,
          position: 'top-right'
        });
      }
    };

    // Register WebSocket event listeners
    webSocketService.addEventListener('meeting_created', handleMeetingCreated);
    webSocketService.addEventListener('meeting_updated', handleMeetingUpdated);

    return () => {
      webSocketService.removeEventListener('meeting_created', handleMeetingCreated);
      webSocketService.removeEventListener('meeting_updated', handleMeetingUpdated);
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'processing':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'failed':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const handleShare = (meeting: Meeting) => {
    const shareUrl = `${window.location.origin}/meetings/${meeting.id}`;
    navigator.clipboard.writeText(shareUrl);
    toast.success('Meeting link copied to clipboard!');
  };

  const handleExport = (meeting: Meeting, format: string) => {
    // In real implementation, this would trigger export
    toast.success(`Export started! ${format.toUpperCase()} will be downloaded shortly.`);
  };

  const displayMeetings = limit ? realtimeMeetings.slice(0, limit) : realtimeMeetings;

  if (loading && realtimeMeetings.length === 0) {
    return (
      <div className={className}>
        <LoadingState message="Loading meetings..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`bg-white rounded-lg border shadow-sm p-6 ${className}`}>
        <div className="text-center py-12">
          <div className="text-red-400 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h4 className="text-lg font-medium text-gray-900 mb-2">
            Error loading meetings
          </h4>
          <p className="text-gray-600 mb-4">{error}</p>
          <Button onClick={refetch}>Try Again</Button>
        </div>
      </div>
    );
  }

  if (displayMeetings.length === 0) {
    return (
      <div className={`bg-white rounded-lg border shadow-sm p-6 ${className}`}>
        <div className="text-center py-12">
          <div className="text-gray-400 mb-4">
            <DocumentTextIcon className="mx-auto h-12 w-12" />
          </div>
          <h4 className="text-lg font-medium text-gray-900 mb-2">
            No meetings yet
          </h4>
          <p className="text-gray-600 mb-4">
            Upload your first meeting recording to get started
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">
            Recent Meetings
          </h3>
          <div className="flex items-center space-x-3">
            {/* Real-time indicator */}
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-xs text-gray-500">Live</span>
            </div>
            
            {/* Last update time */}
            <span className="text-xs text-gray-500">
              Updated {lastUpdateTime.toLocaleTimeString()}
            </span>
          </div>
        </div>
      </div>

      {/* Meetings List */}
      <div className="divide-y divide-gray-200">
        {displayMeetings.map((meeting) => (
          <div key={meeting.id} className="p-6 hover:bg-gray-50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-3 mb-2">
                  <h4 className="text-lg font-medium text-gray-900 truncate">
                    {meeting.title}
                  </h4>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(meeting.processing_status)}`}>
                    {meeting.processing_status}
                  </span>
                </div>
                
                <div className="flex items-center space-x-4 text-sm text-gray-600">
                  <span className="flex items-center space-x-1">
                    <ClockIcon className="w-4 h-4" />
                    <span>Created {new Date(meeting.created_at).toLocaleDateString()}</span>
                  </span>
                  
                  {meeting.duration && meeting.duration > 0 && (
                    <span className="flex items-center space-x-1">
                      <ClockIcon className="w-4 h-4" />
                      <span>{formatDuration(meeting.duration)}</span>
                    </span>
                  )}
                  
                  {meeting.participants && meeting.participants.length > 0 && (
                    <span className="flex items-center space-x-1">
                      <UserGroupIcon className="w-4 h-4" />
                      <span>{meeting.participants.length} participants</span>
                    </span>
                  )}
                </div>

                {/* Participants */}
                {meeting.participants && meeting.participants.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {meeting.participants.slice(0, 3).map((participant, index) => (
                      <span
                        key={index}
                        className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full"
                      >
                        {participant}
                      </span>
                    ))}
                    {meeting.participants.length > 3 && (
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                        +{meeting.participants.length - 3} more
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Actions */}
              {showActions && (
                <div className="flex items-center space-x-2 ml-4">
                  <Link href={`/meetings/${meeting.id}`}>
                    <Button variant="outline" size="sm" className="flex items-center space-x-2">
                      <EyeIcon className="w-4 h-4" />
                      <span>View</span>
                    </Button>
                  </Link>
                  
                  {meeting.processing_status === 'completed' && (
                    <>
                      <Button 
                        variant="outline" 
                        size="sm"
                        className="flex items-center space-x-2"
                        onClick={() => handleShare(meeting)}
                      >
                        <ShareIcon className="w-4 h-4" />
                        <span>Share</span>
                      </Button>
                      
                      <div className="relative">
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleExport(meeting, e.target.value);
                              e.target.value = '';
                            }
                          }}
                          className="appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">Export...</option>
                          <option value="pdf">PDF</option>
                          <option value="docx">Word</option>
                          <option value="txt">Text</option>
                          <option value="json">JSON</option>
                        </select>
                        <CloudArrowDownIcon className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* View All Link */}
      {limit && realtimeMeetings.length > limit && (
        <div className="px-6 py-4 border-t border-gray-200">
          <Link href="/meetings">
            <Button variant="outline" className="w-full">
              View All Meetings ({realtimeMeetings.length - limit} more)
            </Button>
          </Link>
        </div>
      )}
    </div>
  );
}