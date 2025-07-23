import { Meeting, SummaryData } from '@/types';
import { api } from '@/lib/api';

interface SummaryRequest {
  meetingId: string;
  transcriptText: string;
  options?: {
    model?: string;
    provider?: string;
    customPrompt?: string;
  };
}

class SummaryService {
  private static instance: SummaryService;

  private constructor() {}

  static getInstance(): SummaryService {
    if (!SummaryService.instance) {
      SummaryService.instance = new SummaryService();
    }
    return SummaryService.instance;
  }

  async generateSummary(request: SummaryRequest): Promise<SummaryData> {
    try {
      const response = await api.post('/api/summaries/generate', {
        meeting_id: request.meetingId,
        transcript_text: request.transcriptText,
        ...request.options,
      });

      return response.data;
    } catch (error) {
      console.error('Failed to generate summary:', error);
      throw error;
    }
  }

  async regenerateSummary(meetingId: string, options?: {
    model?: string;
    provider?: string;
    customPrompt?: string;
  }): Promise<SummaryData> {
    try {
      const response = await api.post(`/api/summaries/${meetingId}/regenerate`, options);
      return response.data;
    } catch (error) {
      console.error('Failed to regenerate summary:', error);
      throw error;
    }
  }

  async getSummary(meetingId: string): Promise<SummaryData | null> {
    try {
      const response = await api.get(`/api/summaries/${meetingId}`);
      return response.data;
    } catch (error) {
      console.error(`Failed to get summary for meeting ${meetingId}:`, error);
      return null;
    }
  }

  async updateActionItems(meetingId: string, actionItems: string[]): Promise<SummaryData> {
    try {
      const response = await api.patch(`/api/summaries/${meetingId}/action-items`, {
        action_items: actionItems,
      });
      return response.data;
    } catch (error) {
      console.error('Failed to update action items:', error);
      throw error;
    }
  }

  // Utility methods
  extractKeyInfo(summaryData: SummaryData): {
    participantCount: number;
    actionItemCount: number;
    keyPointCount: number;
    estimatedReadTime: number;
  } {
    return {
      participantCount: summaryData.participants?.length || 0,
      actionItemCount: summaryData.action_items?.length || 0,
      keyPointCount: summaryData.key_points?.length || 0,
      estimatedReadTime: Math.ceil(summaryData.summary.split(' ').length / 200), // ~200 words per minute
    };
  }

  formatSummaryForExport(summaryData: SummaryData, meeting?: Meeting): string {
    const lines: string[] = [];
    
    if (meeting) {
      lines.push(`# Meeting Summary: ${meeting.title}`);
      lines.push(`Date: ${new Date(meeting.created_at).toLocaleDateString()}`);
      lines.push('');
    }

    lines.push('## Summary');
    lines.push(summaryData.summary);
    lines.push('');

    if (summaryData.participants && summaryData.participants.length > 0) {
      lines.push('## Participants');
      summaryData.participants.forEach(participant => {
        lines.push(`- ${participant}`);
      });
      lines.push('');
    }

    if (summaryData.key_points && summaryData.key_points.length > 0) {
      lines.push('## Key Points');
      summaryData.key_points.forEach(point => {
        lines.push(`- ${point}`);
      });
      lines.push('');
    }

    if (summaryData.action_items && summaryData.action_items.length > 0) {
      lines.push('## Action Items');
      summaryData.action_items.forEach(item => {
        lines.push(`- [ ] ${item}`);
      });
      lines.push('');
    }

    if (summaryData.duration) {
      lines.push(`## Meeting Duration`);
      lines.push(`${Math.floor(summaryData.duration / 60)} minutes`);
      lines.push('');
    }

    return lines.join('\n');
  }

  validateSummaryData(data: any): data is SummaryData {
    return (
      typeof data === 'object' &&
      typeof data.summary === 'string' &&
      Array.isArray(data.key_points) &&
      Array.isArray(data.action_items) &&
      Array.isArray(data.participants)
    );
  }
}

export const summaryService = SummaryService.getInstance();