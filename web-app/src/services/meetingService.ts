import { Meeting, ApiResponse, ProcessingStatus } from '@/types';
import { meetingsAPI } from '@/lib/api';

class MeetingService {
  private static instance: MeetingService;

  private constructor() {}

  static getInstance(): MeetingService {
    if (!MeetingService.instance) {
      MeetingService.instance = new MeetingService();
    }
    return MeetingService.instance;
  }

  async getAllMeetings(): Promise<Meeting[]> {
    try {
      const response = await meetingsAPI.list();
      return response.data || [];
    } catch (error) {
      console.error('Failed to fetch meetings:', error);
      throw error;
    }
  }

  async getMeetingById(id: string): Promise<Meeting | null> {
    try {
      const response = await meetingsAPI.get(id);
      return response.data;
    } catch (error) {
      console.error(`Failed to fetch meeting ${id}:`, error);
      throw error;
    }
  }

  async createMeeting(data: Partial<Meeting>): Promise<Meeting> {
    try {
      const response = await meetingsAPI.create(data);
      return response.data;
    } catch (error) {
      console.error('Failed to create meeting:', error);
      throw error;
    }
  }

  async updateMeeting(id: string, data: Partial<Meeting>): Promise<Meeting> {
    try {
      const response = await meetingsAPI.update(id, data);
      return response.data;
    } catch (error) {
      console.error(`Failed to update meeting ${id}:`, error);
      throw error;
    }
  }

  async deleteMeeting(id: string): Promise<void> {
    try {
      await meetingsAPI.delete(id);
    } catch (error) {
      console.error(`Failed to delete meeting ${id}:`, error);
      throw error;
    }
  }

  // Helper methods
  filterMeetingsByStatus(meetings: Meeting[], status: ProcessingStatus): Meeting[] {
    return meetings.filter(meeting => meeting.processing_status === status);
  }

  sortMeetingsByDate(meetings: Meeting[], ascending = false): Meeting[] {
    return [...meetings].sort((a, b) => {
      const dateA = new Date(a.created_at).getTime();
      const dateB = new Date(b.created_at).getTime();
      return ascending ? dateA - dateB : dateB - dateA;
    });
  }

  searchMeetings(meetings: Meeting[], query: string): Meeting[] {
    const lowercaseQuery = query.toLowerCase();
    return meetings.filter(meeting =>
      meeting.title.toLowerCase().includes(lowercaseQuery) ||
      meeting.transcript_text?.toLowerCase().includes(lowercaseQuery) ||
      meeting.summary_data?.summary.toLowerCase().includes(lowercaseQuery)
    );
  }

  // Get statistics
  getMeetingStats(meetings: Meeting[]) {
    const stats = {
      total: meetings.length,
      completed: 0,
      processing: 0,
      failed: 0,
      pending: 0,
      totalDuration: 0,
    };

    meetings.forEach(meeting => {
      switch (meeting.processing_status) {
        case ProcessingStatus.COMPLETED:
          stats.completed++;
          break;
        case ProcessingStatus.PROCESSING:
          stats.processing++;
          break;
        case ProcessingStatus.FAILED:
          stats.failed++;
          break;
        case ProcessingStatus.PENDING:
          stats.pending++;
          break;
      }

      if (meeting.duration) {
        stats.totalDuration += meeting.duration;
      }
    });

    return stats;
  }
}

export const meetingService = MeetingService.getInstance();