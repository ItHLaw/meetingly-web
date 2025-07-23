'use client';

import { useState, useMemo } from 'react';
import { 
  MagnifyingGlassIcon, 
  SpeakerWaveIcon, 
  ClockIcon,
  DocumentTextIcon,
  FunnelIcon
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface TranscriptSegment {
  id: string;
  speaker_id: string;
  speaker_name: string;
  text: string;
  start_time: number;
  end_time: number;
  confidence: number;
  word_timestamps?: Array<{
    word: string;
    start: number;
    end: number;
    confidence: number;
  }>;
}

interface TranscriptData {
  meeting_id: string;
  segments: TranscriptSegment[];
  total_duration: number;
  language: string;
  processing_metadata: {
    model_used: string;
    diarization_enabled: boolean;
    created_at: string;
  };
}

interface TranscriptDisplayProps {
  transcript: TranscriptData;
  isLoading?: boolean;
  className?: string;
  onSegmentClick?: (segment: TranscriptSegment) => void;
  showTimestamps?: boolean;
  showSpeakers?: boolean;
  allowSearch?: boolean;
}

export function TranscriptDisplay({
  transcript,
  isLoading = false,
  className = '',
  onSegmentClick,
  showTimestamps = true,
  showSpeakers = true,
  allowSearch = true
}: TranscriptDisplayProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSpeaker, setSelectedSpeaker] = useState<string>('all');
  const [showMetadata, setShowMetadata] = useState(false);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
  };

  // Get unique speakers
  const speakers = useMemo(() => {
    const uniqueSpeakers = new Set(transcript.segments.map(s => s.speaker_name));
    return Array.from(uniqueSpeakers).sort();
  }, [transcript.segments]);

  // Filter segments based on search and speaker selection
  const filteredSegments = useMemo(() => {
    return transcript.segments.filter(segment => {
      const matchesSearch = !searchQuery || 
        segment.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        segment.speaker_name.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesSpeaker = selectedSpeaker === 'all' || 
        segment.speaker_name === selectedSpeaker;
      
      return matchesSearch && matchesSpeaker;
    });
  }, [transcript.segments, searchQuery, selectedSpeaker]);

  // Highlight search terms in text
  const highlightText = (text: string, query: string) => {
    if (!query) return text;
    
    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) => 
      regex.test(part) ? (
        <span key={index} className="bg-yellow-200 text-yellow-900 px-1 rounded">
          {part}
        </span>
      ) : part
    );
  };

  const getSpeakerColor = (speakerName: string) => {
    const colors = [
      'bg-blue-100 text-blue-800 border-blue-200',
      'bg-green-100 text-green-800 border-green-200',
      'bg-purple-100 text-purple-800 border-purple-200',
      'bg-orange-100 text-orange-800 border-orange-200',
      'bg-pink-100 text-pink-800 border-pink-200',
      'bg-indigo-100 text-indigo-800 border-indigo-200',
    ];
    
    const index = speakers.indexOf(speakerName) % colors.length;
    return colors[index];
  };

  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg border shadow-sm p-6 ${className}`}>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-sm text-gray-600">Loading transcript...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border shadow-sm ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <DocumentTextIcon className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                Meeting Transcript
              </h3>
              <div className="flex items-center space-x-4 text-sm text-gray-600">
                <span className="flex items-center space-x-1">
                  <ClockIcon className="w-4 h-4" />
                  <span>{formatDuration(transcript.total_duration)}</span>
                </span>
                <span className="flex items-center space-x-1">
                  <SpeakerWaveIcon className="w-4 h-4" />
                  <span>{speakers.length} speakers</span>
                </span>
                <span>Language: {transcript.language.toUpperCase()}</span>
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMetadata(!showMetadata)}
          >
            {showMetadata ? 'Hide Details' : 'Show Details'}
          </Button>
        </div>

        {/* Metadata */}
        {showMetadata && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Processing Details</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <span className="text-gray-600">Model:</span>
                <span className="ml-2 font-medium">{transcript.processing_metadata.model_used}</span>
              </div>
              <div>
                <span className="text-gray-600">Speaker Diarization:</span>
                <span className="ml-2 font-medium">
                  {transcript.processing_metadata.diarization_enabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <div>
                <span className="text-gray-600">Processed:</span>
                <span className="ml-2 font-medium">
                  {new Date(transcript.processing_metadata.created_at).toLocaleDateString()}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Search and Filters */}
        {allowSearch && (
          <div className="mt-4 flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search transcript..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            
            {showSpeakers && speakers.length > 1 && (
              <div className="flex items-center space-x-2">
                <FunnelIcon className="w-4 h-4 text-gray-400" />
                <select
                  value={selectedSpeaker}
                  onChange={(e) => setSelectedSpeaker(e.target.value)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Speakers</option>
                  {speakers.map(speaker => (
                    <option key={speaker} value={speaker}>
                      {speaker}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Results summary */}
        {(searchQuery || selectedSpeaker !== 'all') && (
          <div className="mt-2 text-sm text-gray-600">
            Showing {filteredSegments.length} of {transcript.segments.length} segments
          </div>
        )}
      </div>

      {/* Transcript Content */}
      <div className="px-6 py-4">
        {filteredSegments.length === 0 ? (
          <div className="text-center py-12">
            <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h4 className="text-lg font-medium text-gray-900 mt-4">
              No segments found
            </h4>
            <p className="text-gray-600 mt-2">
              Try adjusting your search or speaker filter
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredSegments.map((segment) => (
              <div
                key={segment.id}
                className={`p-4 rounded-lg border transition-colors ${
                  onSegmentClick 
                    ? 'cursor-pointer hover:bg-gray-50 hover:border-gray-300' 
                    : ''
                }`}
                onClick={() => onSegmentClick?.(segment)}
              >
                <div className="flex items-start space-x-3">
                  {/* Speaker and Time */}
                  <div className="flex-shrink-0 space-y-2">
                    {showSpeakers && (
                      <div className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getSpeakerColor(segment.speaker_name)}`}>
                        {segment.speaker_name}
                      </div>
                    )}
                    {showTimestamps && (
                      <div className="text-xs text-gray-500 font-mono">
                        {formatTime(segment.start_time)} - {formatTime(segment.end_time)}
                      </div>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="text-gray-900 leading-relaxed">
                      {highlightText(segment.text, searchQuery)}
                    </div>
                    
                    {/* Confidence Score */}
                    {segment.confidence < 0.8 && (
                      <div className="mt-2 text-xs text-amber-600 flex items-center space-x-1">
                        <span>⚠️</span>
                        <span>Lower confidence ({Math.round(segment.confidence * 100)}%)</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}