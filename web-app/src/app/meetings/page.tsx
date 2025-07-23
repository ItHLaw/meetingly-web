'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AppLayout } from '@/components/layout/AppLayout';
import { AudioUploadModal } from '@/components/audio/AudioUploadModal';
import { ProcessingProgress } from '@/components/audio/ProcessingProgress';
import { LoadingState } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { useMeetings } from '@/hooks';
import { ProcessingStatus } from '@/types';
import { Meeting } from '@/types';
import { notify } from '@/services/notificationService';
import { 
  PlusIcon, 
  MagnifyingGlassIcon,
  FunnelIcon,
  EyeIcon,
  ShareIcon,
  CloudArrowDownIcon,
  DocumentTextIcon,
  ClockIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';

export default function MeetingsPage() {
  const { meetings, loading, error, refetch } = useMeetings();
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [processingJob, setProcessingJob] = useState<{ jobId: string; meetingId: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProcessingStatus | 'all'>('all');
  const [sortBy, setSortBy] = useState<string>('created_at');

  const handleUploadSuccess = (jobId: string, meetingId: string) => {
    console.log('Upload successful:', { jobId, meetingId });
    setProcessingJob({ jobId, meetingId });
    setUploadModalOpen(false);
  };

  const handleProcessingComplete = (result: any) => {
    console.log('Processing completed:', result);
    setProcessingJob(null);
    refetch(); // Refresh meetings list
  };

  const handleProcessingError = (error: string) => {
    console.error('Processing failed:', error);
    setProcessingJob(null);
  };

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

  // Filter and sort meetings
  const filteredMeetings = meetings
    .filter(meeting => {
      const matchesSearch = !searchQuery || 
        meeting.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        meeting.participants?.some(p => p.toLowerCase().includes(searchQuery.toLowerCase()));
      
      const matchesStatus = statusFilter === 'all' || meeting.processing_status === statusFilter;
      
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'duration':
          return (b.duration || 0) - (a.duration || 0);
        case 'created_at':
        default:
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
    });

  const headerActions = (
    <Button 
      size="sm"
      onClick={() => setUploadModalOpen(true)}
      className="flex items-center space-x-2"
    >
      <PlusIcon className="h-4 w-4" />
      <span>New Meeting</span>
    </Button>
  );

  if (loading && meetings.length === 0) {
    return (
      <AppLayout 
        title="Meetings" 
        subtitle="Manage your meeting recordings and transcripts"
        actions={headerActions}
      >
        <LoadingState message="Loading meetings..." />
      </AppLayout>
    );
  }

  return (
    <AppLayout 
      title="Meetings" 
      subtitle="Manage your meeting recordings and transcripts"
      actions={headerActions}
    >
      {/* Search and Filters */}
      <div className="bg-white rounded-lg border shadow-sm p-6 mb-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1 relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search meetings..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2">
              <FunnelIcon className="w-4 h-4 text-gray-400" />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="completed">Completed</option>
                <option value="processing">Processing</option>
                <option value="failed">Failed</option>
              </select>
            </div>
            
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="created_at">Sort by Date</option>
              <option value="title">Sort by Title</option>
              <option value="duration">Sort by Duration</option>
            </select>
          </div>
        </div>
        
        {/* Results summary */}
        <div className="mt-4 text-sm text-gray-600">
          Showing {filteredMeetings.length} of {meetings.length} meetings
        </div>
      </div>

      {/* Meetings List */}
      {error ? (
        <div className="bg-white rounded-lg border shadow-sm p-6">
          <div className="text-center py-12">
            <div className="text-red-400 mb-4">
              <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h4 className="text-lg font-medium text-gray-900 mb-2">
              Error loading meetings
            </h4>
            <p className="text-gray-600 mb-4">
              {error}
            </p>
            <Button onClick={refetch}>
              Try Again
            </Button>
          </div>
        </div>
      ) : filteredMeetings.length === 0 && !loading ? (
        <div className="bg-white rounded-lg border shadow-sm p-6">
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <DocumentTextIcon className="mx-auto h-12 w-12" />
            </div>
            <h4 className="text-lg font-medium text-gray-900 mb-2">
              {searchQuery || statusFilter !== 'all' ? 'No meetings found' : 'No meetings yet'}
            </h4>
            <p className="text-gray-600 mb-4">
              {searchQuery || statusFilter !== 'all' 
                ? 'Try adjusting your search or filters'
                : 'Upload your first meeting recording to get started'
              }
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <Button onClick={() => setUploadModalOpen(true)}>
                Upload Recording
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border shadow-sm">
          <div className="divide-y divide-gray-200">
            {filteredMeetings.map((meeting) => (
              <div key={meeting.id} className="p-6 hover:bg-gray-50 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-medium text-gray-900 truncate">
                        {meeting.title}
                      </h3>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(meeting.processing_status)}`}>
                        {meeting.processing_status}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-4 text-sm text-gray-600">
                      <span className="flex items-center space-x-1">
                        <ClockIcon className="w-4 h-4" />
                        <span>Created {new Date(meeting.created_at).toLocaleDateString()}</span>
                      </span>
                      
                      {meeting.duration && (
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

                  <div className="flex items-center space-x-2 ml-4">
                    <Link href={`/meetings/${meeting.id}`}>
                      <Button variant="outline" size="sm" className="flex items-center space-x-2">
                        <EyeIcon className="w-4 h-4" />
                        <span>View</span>
                      </Button>
                    </Link>
                    
                    {meeting.processing_status === ProcessingStatus.COMPLETED && (
                      <>
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="flex items-center space-x-2"
                          onClick={() => {
                            // In real implementation, this would create a shareable link
                            navigator.clipboard.writeText(`${window.location.origin}/meetings/${meeting.id}`);
                            notify.success('Meeting link copied to clipboard!');
                          }}
                        >
                          <ShareIcon className="w-4 h-4" />
                          <span>Share</span>
                        </Button>
                        
                        <div className="relative">
                          <select
                            onChange={(e) => {
                              if (e.target.value) {
                                // In real implementation, this would trigger export
                                console.log('Exporting meeting as', e.target.value);
                                notify.success(`Export started! ${e.target.value.toUpperCase()} will be downloaded shortly.`);
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
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Audio Upload Modal */}
      <AudioUploadModal
        isOpen={uploadModalOpen}
        onClose={() => setUploadModalOpen(false)}
        onUploadSuccess={handleUploadSuccess}
      />

      {/* Processing Progress */}
      {processingJob && (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="max-w-lg w-full">
            <ProcessingProgress
              jobId={processingJob.jobId}
              meetingId={processingJob.meetingId}
              onComplete={handleProcessingComplete}
              onError={handleProcessingError}
            />
          </div>
        </div>
      )}
    </AppLayout>
  );
}