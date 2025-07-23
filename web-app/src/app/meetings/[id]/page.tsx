'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AppLayout } from '@/components/layout/AppLayout';
import { MeetingDetailView } from '@/components/meeting/MeetingDetailView';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Button } from '@/components/ui/button';
import { ArrowLeftIcon, ShareIcon } from '@heroicons/react/24/outline';
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

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const meetingId = params.id as string;
  
  const [meeting, setMeeting] = useState<MeetingData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMeeting = async () => {
      try {
        setIsLoading(true);
        
        // Simulate API call - in real implementation this would call the API
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // Mock data
        const mockMeeting: MeetingData = {
          id: meetingId,
          title: `Meeting ${meetingId}`,
          created_at: new Date().toISOString(),
          duration: 3600, // 1 hour
          status: 'completed',
          participants: ['John Doe', 'Jane Smith', 'Bob Johnson'],
          audio_url: '/api/meetings/' + meetingId + '/audio',
          transcript: {
            meeting_id: meetingId,
            segments: [
              {
                id: '1',
                speaker_id: 'speaker_1',
                speaker_name: 'John Doe',
                text: 'Welcome everyone to today\'s meeting. Let\'s start by reviewing our quarterly results.',
                start_time: 5.2,
                end_time: 12.8,
                confidence: 0.95,
              },
              {
                id: '2',
                speaker_id: 'speaker_2',
                speaker_name: 'Jane Smith',
                text: 'Thanks John. I\'ve prepared a comprehensive report on our Q3 performance. Overall, we\'ve exceeded our targets by 15%.',
                start_time: 13.1,
                end_time: 22.4,
                confidence: 0.92,
              },
              {
                id: '3',
                speaker_id: 'speaker_3',
                speaker_name: 'Bob Johnson',
                text: 'That\'s fantastic news! What were the key drivers behind this success?',
                start_time: 23.0,
                end_time: 28.5,
                confidence: 0.98,
              },
              {
                id: '4',
                speaker_id: 'speaker_2',
                speaker_name: 'Jane Smith',
                text: 'The main factors were improved customer acquisition and better retention rates. We also saw significant growth in our premium product line.',
                start_time: 29.2,
                end_time: 38.7,
                confidence: 0.89,
              },
              {
                id: '5',
                speaker_id: 'speaker_1',
                speaker_name: 'John Doe',
                text: 'Excellent work, Jane. Let\'s discuss our plans for Q4. Bob, can you share your thoughts on the marketing strategy?',
                start_time: 39.5,
                end_time: 47.8,
                confidence: 0.94,
              }
            ],
            total_duration: 3600,
            language: 'en',
            processing_metadata: {
              model_used: 'whisper-large-v2',
              diarization_enabled: true,
              created_at: new Date().toISOString(),
            }
          },
          summary: {
            meeting_id: meetingId,
            overview: 'This quarterly review meeting focused on analyzing Q3 performance results and planning for Q4. The team discussed exceeding targets by 15%, key success drivers including improved customer acquisition and retention, and outlined strategic priorities for the upcoming quarter.',
            key_points: [
              {
                id: '1',
                text: 'Q3 performance exceeded targets by 15%',
                timestamp: 18.0,
                category: 'information'
              },
              {
                id: '2',
                text: 'Key success drivers: improved customer acquisition and retention',
                timestamp: 32.0,
                category: 'information'
              },
              {
                id: '3',
                text: 'Significant growth in premium product line',
                timestamp: 35.0,
                category: 'information'
              },
              {
                id: '4',
                text: 'Discussion needed on Q4 marketing strategy',
                timestamp: 45.0,
                category: 'discussion'
              }
            ],
            action_items: [
              {
                id: '1',
                text: 'Prepare detailed Q4 marketing strategy presentation',
                assignee: 'Bob Johnson',
                due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                priority: 'high',
                completed: false
              },
              {
                id: '2',
                text: 'Analyze customer retention data for premium products',
                assignee: 'Jane Smith',
                due_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
                priority: 'medium',
                completed: false
              },
              {
                id: '3',
                text: 'Schedule follow-up meeting for next week',
                assignee: 'John Doe',
                due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
                priority: 'low',
                completed: false
              }
            ],
            participants: ['John Doe', 'Jane Smith', 'Bob Johnson'],
            topics_discussed: [
              'Q3 Performance Review',
              'Customer Acquisition Metrics',
              'Premium Product Growth',
              'Q4 Marketing Strategy',
              'Team Performance Analysis'
            ],
            sentiment_analysis: {
              overall_sentiment: 'positive',
              confidence: 0.87
            },
            processing_metadata: {
              created_at: new Date().toISOString(),
              model_used: 'gpt-4',
              processing_time_seconds: 45
            }
          }
        };
        
        setMeeting(mockMeeting);
      } catch (err: any) {
        console.error('Failed to fetch meeting:', err);
        setError(err.message || 'Failed to load meeting');
      } finally {
        setIsLoading(false);
      }
    };

    if (meetingId) {
      fetchMeeting();
    }
  }, [meetingId]);

  const handleExport = (format: string) => {
    // In real implementation, this would call the export API
    console.log('Exporting meeting as', format);
    toast.success(`Export started! ${format.toUpperCase()} will be downloaded shortly.`);
  };

  const handleShare = () => {
    // In real implementation, this would create a shareable link
    const shareUrl = window.location.href;
    navigator.clipboard.writeText(shareUrl);
    toast.success('Meeting link copied to clipboard!');
  };

  const handleGoBack = () => {
    router.push('/meetings');
  };

  if (isLoading) {
    return (
      <AppLayout title="Loading..." subtitle="Please wait">
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-gray-600">Loading meeting details...</p>
          </div>
        </div>
      </AppLayout>
    );
  }

  if (error || !meeting) {
    return (
      <AppLayout title="Error" subtitle="Failed to load meeting">
        <div className="text-center py-12">
          <div className="text-red-400 mb-4">
            <svg className="mx-auto h-12 w-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L4.268 18.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h4 className="text-lg font-medium text-gray-900 mb-2">
            Failed to Load Meeting
          </h4>
          <p className="text-gray-600 mb-4">
            {error || 'The meeting could not be found or loaded.'}
          </p>
          <div className="space-x-3">
            <Button onClick={handleGoBack} variant="outline">
              Back to Meetings
            </Button>
            <Button onClick={() => window.location.reload()}>
              Try Again
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  const breadcrumbs = [
    { name: 'Meetings', href: '/meetings' },
    { name: meeting.title, href: `/meetings/${meeting.id}` }
  ];

  const headerActions = (
    <div className="flex items-center space-x-3">
      <Button
        variant="outline"
        size="sm"
        onClick={handleGoBack}
        className="flex items-center space-x-2"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        <span>Back</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleShare}
        className="flex items-center space-x-2"
      >
        <ShareIcon className="w-4 h-4" />
        <span>Share</span>
      </Button>
    </div>
  );

  return (
    <AppLayout
      title={meeting.title}
      subtitle={`Meeting from ${new Date(meeting.created_at).toLocaleDateString()}`}
      actions={headerActions}
      breadcrumbs={breadcrumbs}
    >
      <MeetingDetailView
        meeting={meeting}
        onExport={handleExport}
        onShare={handleShare}
      />
    </AppLayout>
  );
}