'use client';

import { useState } from 'react';
import { 
  DocumentTextIcon, 
  BulbIcon, 
  ShareIcon,
  CloudArrowDownIcon,
  PlayIcon,
  PauseIcon
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { TranscriptDisplay } from '@/components/transcript/TranscriptDisplay';
import { SummaryDisplay } from '@/components/summary/SummaryDisplay';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import toast from 'react-hot-toast';

interface MeetingData {
  id: string;
  title: string;
  created_at: string;
  duration: number;
  status: 'processing' | 'completed' | 'failed';
  transcript?: any;
  summary?: any;
  audio_url?: string;
  participants: string[];
}

interface MeetingDetailViewProps {
  meeting: MeetingData;
  isLoading?: boolean;
  className?: string;
  onExport?: (format: string) => void;
  onShare?: () => void;
}

type TabType = 'transcript' | 'summary';

export function MeetingDetailView({
  meeting,
  isLoading = false,
  className = '',
  onExport,
  onShare
}: MeetingDetailViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>('transcript');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };

  const handleSegmentClick = (segment: any) => {
    // In a real implementation, this would seek to the audio timestamp
    console.log('Seeking to timestamp:', segment.start_time);
    setCurrentTime(segment.start_time);
    toast.success(`Jumped to ${Math.floor(segment.start_time / 60)}:${Math.floor(segment.start_time % 60).toString().padStart(2, '0')}`);
  };

  const handlePlayPause = () => {
    // In a real implementation, this would control audio playback
    setIsPlaying(!isPlaying);
    toast.success(isPlaying ? 'Audio paused' : 'Audio playing');
  };

  const handleExport = (format: string) => {
    onExport?.(format);
    toast.success(`Exporting ${activeTab} as ${format.toUpperCase()}`);
  };

  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg border shadow-sm p-6 ${className}`}>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-sm text-gray-600">Loading meeting details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (meeting.status === 'failed') {
    return (
      <div className={`bg-white rounded-lg border shadow-sm p-6 ${className}`}>
        <div className="text-center py-12">
          <div className="text-red-400 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h4 className="text-lg font-medium text-gray-900 mb-2">
            Processing Failed
          </h4>
          <p className="text-gray-600 mb-4">
            There was an error processing this meeting recording
          </p>
          <Button onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (meeting.status === 'processing') {
    return (
      <div className={`bg-white rounded-lg border shadow-sm p-6 ${className}`}>
        <div className="text-center py-12">
          <div className="text-blue-400 mb-4">
            <LoadingSpinner size="lg" />
          </div>
          <h4 className="text-lg font-medium text-gray-900 mb-2">
            Processing in Progress
          </h4>
          <p className="text-gray-600 mb-4">
            Your meeting is being transcribed and analyzed
          </p>
          <div className="text-sm text-gray-500">
            This usually takes a few minutes depending on the recording length
          </div>
        </div>
      </div>
    );
  }

  const tabs = [
    {
      id: 'transcript' as TabType,
      name: 'Transcript',
      icon: DocumentTextIcon,
      count: meeting.transcript?.segments?.length || 0,
      available: !!meeting.transcript
    },
    {
      id: 'summary' as TabType,
      name: 'Summary',
      icon: BulbIcon,
      count: meeting.summary?.action_items?.length || 0,
      available: !!meeting.summary
    }
  ];

  return (
    <div className={`bg-white rounded-lg border shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {meeting.title}
            </h1>
            <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
              <span>
                Created {new Date(meeting.created_at).toLocaleDateString()}
              </span>
              <span>
                Duration: {formatDuration(meeting.duration)}
              </span>
              <span>
                {meeting.participants.length} participants
              </span>
              <span className="px-2 py-1 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                {meeting.status}
              </span>
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            {meeting.audio_url && (
              <Button
                variant="outline"
                size="sm"
                onClick={handlePlayPause}
                className="flex items-center space-x-2"
              >
                {isPlaying ? (
                  <PauseIcon className="w-4 h-4" />
                ) : (
                  <PlayIcon className="w-4 h-4" />
                )}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </Button>
            )}
            
            <div className="relative">
              <select
                onChange={(e) => handleExport(e.target.value)}
                value=""
                className="appearance-none bg-white border border-gray-300 rounded-lg px-3 py-2 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="" disabled>Export...</option>
                <option value="pdf">PDF</option>
                <option value="docx">Word</option>
                <option value="txt">Text</option>
                <option value="json">JSON</option>
              </select>
              <CloudArrowDownIcon className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
            
            {onShare && (
              <Button
                variant="outline"
                size="sm"
                onClick={onShare}
                className="flex items-center space-x-2"
              >
                <ShareIcon className="w-4 h-4" />
                <span>Share</span>
              </Button>
            )}
          </div>
        </div>

        {/* Audio Progress Bar (when playing) */}
        {isPlaying && meeting.audio_url && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center space-x-3">
              <span className="text-sm text-blue-700 font-mono">
                {formatDuration(currentTime)}
              </span>
              <div className="flex-1 bg-blue-200 rounded-full h-2 relative">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${(currentTime / meeting.duration) * 100}%` }}
                />
              </div>
              <span className="text-sm text-blue-700 font-mono">
                {formatDuration(meeting.duration)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6" aria-label="Tabs">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const isAvailable = tab.available;
            
            return (
              <button
                key={tab.id}
                onClick={() => isAvailable && handleTabChange(tab.id)}
                disabled={!isAvailable}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center space-x-2 transition-colors ${
                  isActive
                    ? 'border-blue-500 text-blue-600'
                    : isAvailable
                    ? 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    : 'border-transparent text-gray-300 cursor-not-allowed'
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.name}</span>
                {tab.count > 0 && (
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    isActive
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-gray-100 text-gray-600'
                  }`}>
                    {tab.count}
                  </span>
                )}
                {!isAvailable && (
                  <span className="text-xs text-gray-400">(Processing...)</span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="p-6">
        {activeTab === 'transcript' && meeting.transcript && (
          <TranscriptDisplay
            transcript={meeting.transcript}
            onSegmentClick={handleSegmentClick}
            showTimestamps={true}
            showSpeakers={true}
            allowSearch={true}
          />
        )}

        {activeTab === 'summary' && meeting.summary && (
          <SummaryDisplay
            summary={meeting.summary}
            allowEditing={true}
            onActionItemUpdate={(actionItem) => {
              console.log('Updated action item:', actionItem);
              toast.success('Action item updated');
            }}
          />
        )}

        {/* No data available */}
        {((activeTab === 'transcript' && !meeting.transcript) ||
          (activeTab === 'summary' && !meeting.summary)) && (
          <div className="text-center py-12">
            <div className="text-gray-400 mb-4">
              <DocumentTextIcon className="mx-auto h-12 w-12" />
            </div>
            <h4 className="text-lg font-medium text-gray-900 mb-2">
              {activeTab === 'transcript' ? 'Transcript' : 'Summary'} Not Available
            </h4>
            <p className="text-gray-600">
              {meeting.status === 'processing'
                ? 'Processing is still in progress. Please check back shortly.'
                : 'This content is not available for this meeting.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}