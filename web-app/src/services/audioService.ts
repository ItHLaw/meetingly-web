import { audioAPI } from '@/lib/api';
import { UploadProgress, JobStatus } from '@/types';
import { withRetry, DEFAULT_RETRY_CONFIGS } from '@/lib/retry';

interface AudioUploadOptions {
  meetingId?: string;
  enableDiarization?: boolean;
  model?: string;
  language?: string;
}

class AudioService {
  private static instance: AudioService;

  private constructor() {}

  static getInstance(): AudioService {
    if (!AudioService.instance) {
      AudioService.instance = new AudioService();
    }
    return AudioService.instance;
  }

  async uploadFile(file: File, options?: AudioUploadOptions): Promise<string> {
    try {
      // Validate file
      this.validateAudioFile(file);

      const response = await withRetry(
        () => audioAPI.upload(file, options),
        DEFAULT_RETRY_CONFIGS.upload
      );
      return response.data.job_id;
    } catch (error) {
      console.error('Audio file upload failed:', error);
      throw error;
    }
  }

  async getProcessingStatus(jobId: string): Promise<UploadProgress> {
    try {
      const response = await withRetry(
        () => audioAPI.status(jobId),
        DEFAULT_RETRY_CONFIGS.network
      );
      const data = response.data;

      return {
        jobId,
        fileName: data.fileName || 'Unknown',
        progress: data.progress || 0,
        status: data.status as JobStatus,
        error: data.error_message,
      };
    } catch (error) {
      console.error(`Failed to get processing status for job ${jobId}:`, error);
      throw error;
    }
  }

  async getAllJobs(): Promise<UploadProgress[]> {
    try {
      const response = await withRetry(
        () => audioAPI.jobs(),
        DEFAULT_RETRY_CONFIGS.network
      );
      return response.data.map((job: any) => ({
        jobId: job.id,
        fileName: job.fileName || 'Unknown',
        progress: job.progress || 0,
        status: job.status as JobStatus,
        error: job.error_message,
      }));
    } catch (error) {
      console.error('Failed to fetch audio processing jobs:', error);
      throw error;
    }
  }

  // File validation
  private validateAudioFile(file: File): void {
    const maxSize = 100 * 1024 * 1024; // 100MB
    const allowedTypes = [
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/wave',
      'audio/x-wav',
      'audio/mp4',
      'audio/m4a',
      'audio/flac',
    ];

    if (file.size > maxSize) {
      throw new Error(`File size exceeds 100MB limit. Current size: ${this.formatFileSize(file.size)}`);
    }

    if (!allowedTypes.includes(file.type)) {
      throw new Error(`Unsupported file type: ${file.type}. Supported types: ${allowedTypes.join(', ')}`);
    }
  }

  private formatFileSize(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${Math.round(size * 100) / 100} ${units[unitIndex]}`;
  }

  // Utility methods
  getSupportedFormats(): string[] {
    return ['mp3', 'wav', 'm4a', 'flac', 'mp4'];
  }

  getMaxFileSize(): number {
    return 100 * 1024 * 1024; // 100MB
  }

  // Progress polling
  async pollProcessingStatus(
    jobId: string,
    onProgress: (progress: UploadProgress) => void,
    intervalMs = 2000,
    timeoutMs = 300000 // 5 minutes
  ): Promise<UploadProgress> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      const poll = async () => {
        try {
          const progress = await this.getProcessingStatus(jobId);
          onProgress(progress);

          if (progress.status === JobStatus.COMPLETED) {
            resolve(progress);
            return;
          }

          if (progress.status === JobStatus.FAILED) {
            reject(new Error(progress.error || 'Processing failed'));
            return;
          }

          if (Date.now() - startTime > timeoutMs) {
            reject(new Error('Processing timeout'));
            return;
          }

          if (progress.status === JobStatus.PROCESSING || progress.status === JobStatus.PENDING) {
            setTimeout(poll, intervalMs);
          }
        } catch (error) {
          reject(error);
        }
      };

      poll();
    });
  }
}

export const audioService = AudioService.getInstance();