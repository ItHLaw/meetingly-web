import { useState, useEffect, useCallback } from 'react';
import { Meeting, ProcessingStatus } from '@/types';
import { meetingsAPI } from '@/lib/api';
import { useApiRetry } from './useRetry';

interface UseMeetingsReturn {
  meetings: Meeting[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  stats: {
    total: number;
    processing: number;
    completed: number;
    failed: number;
  };
}

export function useMeetings(): UseMeetingsReturn {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const { executeWithRetry, isRetrying } = useApiRetry({
    onRetryError: (error, attempt) => {
      console.warn(`Failed to fetch meetings (attempt ${attempt}):`, error.message);
    }
  });

  const fetchMeetings = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await executeWithRetry(() => meetingsAPI.list());
      setMeetings(response.data || []);
    } catch (err: any) {
      console.error('Error fetching meetings:', err);
      setError(err.response?.data?.message || 'Failed to fetch meetings');
    } finally {
      setLoading(false);
    }
  }, [executeWithRetry]);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const stats = {
    total: meetings.length,
    processing: meetings.filter(m => m.processing_status === ProcessingStatus.PROCESSING).length,
    completed: meetings.filter(m => m.processing_status === ProcessingStatus.COMPLETED).length,
    failed: meetings.filter(m => m.processing_status === ProcessingStatus.FAILED).length,
  };

  return {
    meetings,
    loading: loading || isRetrying,
    error,
    refetch: fetchMeetings,
    stats,
  };
}