import { useState, useCallback } from 'react';
import { audioAPI } from '@/lib/api';
import { UploadProgress, JobStatus } from '@/types';
import { useUploadRetry } from './useRetry';

interface UseAudioUploadReturn {
  uploads: UploadProgress[];
  isUploading: boolean;
  uploadFile: (
    file: File,
    options?: {
      meetingId?: string;
      enableDiarization?: boolean;
      model?: string;
      language?: string;
    }
  ) => Promise<string>;
  getUploadStatus: (jobId: string) => Promise<UploadProgress>;
  clearUploads: () => void;
}

export function useAudioUpload(): UseAudioUploadReturn {
  const [uploads, setUploads] = useState<UploadProgress[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const { executeWithRetry } = useUploadRetry({
    onRetryError: (error, attempt) => {
      console.warn(`Audio upload failed (attempt ${attempt}):`, error.message);
    }
  });

  const uploadFile = useCallback(async (
    file: File,
    options?: {
      meetingId?: string;
      enableDiarization?: boolean;
      model?: string;
      language?: string;
    }
  ): Promise<string> => {
    setIsUploading(true);

    try {
      const response = await executeWithRetry(() => audioAPI.upload(file, options));
      const jobId = response.data.job_id;

      // Add to uploads list
      const newUpload: UploadProgress = {
        jobId,
        fileName: file.name,
        progress: 0,
        status: JobStatus.PENDING,
      };

      setUploads(prev => [...prev, newUpload]);
      
      return jobId;
    } catch (error) {
      console.error('Upload failed:', error);
      throw error;
    } finally {
      setIsUploading(false);
    }
  }, []);

  const getUploadStatus = useCallback(async (jobId: string): Promise<UploadProgress> => {
    try {
      const response = await executeWithRetry(() => audioAPI.status(jobId));
      const status = response.data;

      const upload: UploadProgress = {
        jobId,
        fileName: uploads.find(u => u.jobId === jobId)?.fileName || 'Unknown',
        progress: status.progress || 0,
        status: status.status,
        error: status.error_message,
      };

      // Update uploads list
      setUploads(prev => 
        prev.map(u => u.jobId === jobId ? upload : u)
      );

      return upload;
    } catch (error) {
      console.error('Status check failed:', error);
      throw error;
    }
  }, [uploads, executeWithRetry]);

  const clearUploads = useCallback(() => {
    setUploads([]);
  }, [executeWithRetry]);

  return {
    uploads,
    isUploading,
    uploadFile,
    getUploadStatus,
    clearUploads,
  };
}