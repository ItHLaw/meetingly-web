'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ExportModal } from '@/components/ExportModal';
import { AudioUploadModal } from '@/components/audio/AudioUploadModal';
import { ProcessingProgress } from '@/components/audio/ProcessingProgress';
import { AppLayout } from '@/components/layout/AppLayout';
import { LoadingState } from '@/components/ui/LoadingSpinner';
import { RealtimeMeetingsList } from '@/components/realtime/RealtimeMeetingsList';
import { useMeetings } from '@/hooks';
import { Meeting } from '@/types';
import { PlusIcon, ArrowPathIcon } from '@heroicons/react/24/outline';

export default function DashboardPage() {
  const { meetings, loading, error, stats, refetch } = useMeetings();
  const [exportModal, setExportModal] = useState<{ isOpen: boolean; meeting: Meeting | null }>({
    isOpen: false,
    meeting: null,
  });
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [processingJob, setProcessingJob] = useState<{ jobId: string; meetingId: string } | null>(null);

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

  if (loading) {
    return (
      <AppLayout title="Dashboard" subtitle="Manage your meeting recordings and transcripts">
        <LoadingState message="Loading dashboard data..." />
      </AppLayout>
    );
  }

  const headerActions = (
    <>
      <Button 
        variant="outline" 
        size="sm" 
        onClick={refetch}
        disabled={loading}
        className="flex items-center space-x-2"
      >
        <ArrowPathIcon className="h-4 w-4" />
        <span>Refresh</span>
      </Button>
      <Button 
        size="sm"
        onClick={() => setUploadModalOpen(true)}
        className="flex items-center space-x-2"
      >
        <PlusIcon className="h-4 w-4" />
        <span>New Meeting</span>
      </Button>
    </>
  );

  return (
    <AppLayout 
      title="Dashboard" 
      subtitle="Manage your meeting recordings and transcripts"
      actions={headerActions}
    >

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Total Meetings</h3>
              <p className="text-3xl font-bold text-blue-600">{stats.total}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Processing</h3>
              <p className="text-3xl font-bold text-yellow-600">{stats.processing}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Completed</h3>
              <p className="text-3xl font-bold text-green-600">{stats.completed}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-lg shadow-sm border hover:shadow-md transition-shadow">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-red-100 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            </div>
            <div className="ml-4">
              <h3 className="text-lg font-medium text-gray-900">Failed</h3>
              <p className="text-3xl font-bold text-red-600">{stats.failed}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Meetings with Real-time Updates */}
      <RealtimeMeetingsList limit={5} />

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

      {/* Export Modal */}
      {exportModal.meeting && (
        <ExportModal
          isOpen={exportModal.isOpen}
          onClose={() => setExportModal({ isOpen: false, meeting: null })}
          meeting={exportModal.meeting}
        />
      )}
    </AppLayout>
  );
}