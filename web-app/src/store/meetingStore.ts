import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { Meeting, MeetingState } from '@/types';
import { meetingService } from '@/services/meetingService';

interface MeetingStore extends MeetingState {
  // Actions
  setMeetings: (meetings: Meeting[]) => void;
  setCurrentMeeting: (meeting: Meeting | null) => void;
  setLoading: (isLoading: boolean) => void;
  setError: (error: string | null) => void;
  
  // Async actions
  fetchMeetings: () => Promise<void>;
  fetchMeetingById: (id: string) => Promise<Meeting | null>;
  createMeeting: (data: Partial<Meeting>) => Promise<Meeting>;
  updateMeeting: (id: string, data: Partial<Meeting>) => Promise<Meeting>;
  deleteMeeting: (id: string) => Promise<void>;
  
  // Utility actions
  addMeeting: (meeting: Meeting) => void;
  removeMeeting: (id: string) => void;
  updateMeetingInList: (id: string, updates: Partial<Meeting>) => void;
  clearMeetings: () => void;
  reset: () => void;
}

const initialState: MeetingState = {
  meetings: [],
  currentMeeting: null,
  isLoading: false,
  error: null,
};

export const useMeetingStore = create<MeetingStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Synchronous actions
      setMeetings: (meetings) => {
        set({ meetings, error: null }, false, 'meetings/setMeetings');
      },

      setCurrentMeeting: (meeting) => {
        set({ currentMeeting: meeting }, false, 'meetings/setCurrentMeeting');
      },

      setLoading: (isLoading) => {
        set({ isLoading }, false, 'meetings/setLoading');
      },

      setError: (error) => {
        set({ error, isLoading: false }, false, 'meetings/setError');
      },

      // Async actions
      fetchMeetings: async () => {
        try {
          set({ isLoading: true, error: null }, false, 'meetings/fetchStart');
          const meetings = await meetingService.getAllMeetings();
          set({ 
            meetings, 
            isLoading: false, 
            error: null 
          }, false, 'meetings/fetchSuccess');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to fetch meetings';
          set({ 
            isLoading: false, 
            error: errorMessage 
          }, false, 'meetings/fetchError');
          throw error;
        }
      },

      fetchMeetingById: async (id: string) => {
        try {
          set({ isLoading: true, error: null }, false, 'meetings/fetchByIdStart');
          const meeting = await meetingService.getMeetingById(id);
          
          if (meeting) {
            set({ 
              currentMeeting: meeting, 
              isLoading: false, 
              error: null 
            }, false, 'meetings/fetchByIdSuccess');
          } else {
            set({ 
              isLoading: false, 
              error: 'Meeting not found' 
            }, false, 'meetings/fetchByIdNotFound');
          }
          
          return meeting;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to fetch meeting';
          set({ 
            isLoading: false, 
            error: errorMessage 
          }, false, 'meetings/fetchByIdError');
          throw error;
        }
      },

      createMeeting: async (data: Partial<Meeting>) => {
        try {
          set({ isLoading: true, error: null }, false, 'meetings/createStart');
          const meeting = await meetingService.createMeeting(data);
          
          // Add to the list
          const { meetings } = get();
          set({ 
            meetings: [meeting, ...meetings],
            currentMeeting: meeting,
            isLoading: false, 
            error: null 
          }, false, 'meetings/createSuccess');
          
          return meeting;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to create meeting';
          set({ 
            isLoading: false, 
            error: errorMessage 
          }, false, 'meetings/createError');
          throw error;
        }
      },

      updateMeeting: async (id: string, data: Partial<Meeting>) => {
        try {
          set({ isLoading: true, error: null }, false, 'meetings/updateStart');
          const updatedMeeting = await meetingService.updateMeeting(id, data);
          
          // Update in the list
          const { meetings, currentMeeting } = get();
          const updatedMeetings = meetings.map(m => 
            m.id === id ? updatedMeeting : m
          );
          
          set({ 
            meetings: updatedMeetings,
            currentMeeting: currentMeeting?.id === id ? updatedMeeting : currentMeeting,
            isLoading: false, 
            error: null 
          }, false, 'meetings/updateSuccess');
          
          return updatedMeeting;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to update meeting';
          set({ 
            isLoading: false, 
            error: errorMessage 
          }, false, 'meetings/updateError');
          throw error;
        }
      },

      deleteMeeting: async (id: string) => {
        try {
          set({ isLoading: true, error: null }, false, 'meetings/deleteStart');
          await meetingService.deleteMeeting(id);
          
          // Remove from the list
          const { meetings, currentMeeting } = get();
          const filteredMeetings = meetings.filter(m => m.id !== id);
          
          set({ 
            meetings: filteredMeetings,
            currentMeeting: currentMeeting?.id === id ? null : currentMeeting,
            isLoading: false, 
            error: null 
          }, false, 'meetings/deleteSuccess');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Failed to delete meeting';
          set({ 
            isLoading: false, 
            error: errorMessage 
          }, false, 'meetings/deleteError');
          throw error;
        }
      },

      // Utility actions
      addMeeting: (meeting) => {
        const { meetings } = get();
        set({ 
          meetings: [meeting, ...meetings] 
        }, false, 'meetings/addMeeting');
      },

      removeMeeting: (id) => {
        const { meetings, currentMeeting } = get();
        const filteredMeetings = meetings.filter(m => m.id !== id);
        set({ 
          meetings: filteredMeetings,
          currentMeeting: currentMeeting?.id === id ? null : currentMeeting
        }, false, 'meetings/removeMeeting');
      },

      updateMeetingInList: (id, updates) => {
        const { meetings, currentMeeting } = get();
        const updatedMeetings = meetings.map(m => 
          m.id === id ? { ...m, ...updates } : m
        );
        
        set({ 
          meetings: updatedMeetings,
          currentMeeting: currentMeeting?.id === id ? { ...currentMeeting, ...updates } : currentMeeting
        }, false, 'meetings/updateMeetingInList');
      },

      clearMeetings: () => {
        set({ 
          meetings: [], 
          currentMeeting: null,
          error: null 
        }, false, 'meetings/clearMeetings');
      },

      reset: () => {
        set(initialState, false, 'meetings/reset');
      },
    }),
    { name: 'MeetingStore' }
  )
);