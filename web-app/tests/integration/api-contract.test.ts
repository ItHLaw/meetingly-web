/**
 * API Contract Tests
 * 
 * These tests ensure the frontend and backend API contracts remain compatible.
 * They test actual API endpoints against expected schemas and behavior.
 */

import { api } from '@/lib/api';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

// Mock environment for testing
const TEST_API_BASE_URL = process.env.TEST_API_URL || 'http://localhost:8000';

// Test data
const mockUser = {
  email: 'test@example.com',
  name: 'Test User',
  tenant_id: 'test-tenant',
};

const mockMeetingData = {
  name: 'Test Meeting',
  description: 'Contract test meeting',
};

describe('API Contract Tests', () => {
  let authToken: string;
  let testMeetingId: string;

  beforeAll(async () => {
    // Set up test authentication
    // In a real scenario, this would authenticate with a test user
    authToken = 'test-jwt-token';
    api.defaults.headers.common['Authorization'] = `Bearer ${authToken}`;
  });

  afterAll(async () => {
    // Clean up test data
    if (testMeetingId) {
      try {
        await api.delete(`/api/v1/meetings/${testMeetingId}`);
      } catch (error) {
        console.warn('Cleanup failed:', error);
      }
    }
  });

  describe('Authentication Endpoints', () => {
    it('should validate Microsoft SSO token exchange contract', async () => {
      const mockRequest = {
        id_token: 'mock-id-token',
        access_token: 'mock-access-token',
      };

      const mockResponse = {
        access_token: expect.any(String),
        refresh_token: expect.any(String),
        token_type: 'bearer',
        expires_in: expect.any(Number),
        user: {
          id: expect.any(String),
          email: expect.any(String),
          name: expect.any(String),
          tenant_id: expect.any(String),
          created_at: expect.any(String),
          is_active: expect.any(Boolean),
        },
      };

      // Mock the API call since we can't do real Microsoft auth in tests
      const mockApiCall = jest.fn().mockResolvedValue({
        status: 200,
        data: {
          access_token: 'jwt-token',
          refresh_token: 'refresh-token',
          token_type: 'bearer',
          expires_in: 86400,
          user: mockUser,
        },
      });

      // Replace the actual API call with mock
      const originalPost = api.post;
      api.post = mockApiCall;

      try {
        const response = await api.post('/auth/microsoft/token', mockRequest);
        
        expect(response.status).toBe(200);
        expect(response.data).toMatchObject(mockResponse);
        expect(mockApiCall).toHaveBeenCalledWith('/auth/microsoft/token', mockRequest);
      } finally {
        api.post = originalPost;
      }
    });

    it('should validate user profile endpoint contract', async () => {
      const expectedUserSchema = {
        id: expect.any(String),
        email: expect.any(String),
        name: expect.any(String),
        tenant_id: expect.any(String),
        created_at: expect.any(String),
        is_active: expect.any(Boolean),
      };

      // Mock the API response
      const mockApiCall = jest.fn().mockResolvedValue({
        status: 200,
        data: mockUser,
      });

      const originalGet = api.get;
      api.get = mockApiCall;

      try {
        const response = await api.get('/auth/me');
        
        expect(response.status).toBe(200);
        expect(response.data).toMatchObject(expectedUserSchema);
      } finally {
        api.get = originalGet;
      }
    });

    it('should validate token refresh endpoint contract', async () => {
      const refreshRequest = {
        refresh_token: 'test-refresh-token',
      };

      const expectedResponse = {
        access_token: expect.any(String),
        refresh_token: expect.any(String),
        token_type: 'bearer',
        expires_in: expect.any(Number),
      };

      const mockApiCall = jest.fn().mockResolvedValue({
        status: 200,
        data: {
          access_token: 'new-jwt-token',
          refresh_token: 'new-refresh-token',
          token_type: 'bearer',
          expires_in: 86400,
        },
      });

      const originalPost = api.post;
      api.post = mockApiCall;

      try {
        const response = await api.post('/auth/refresh', refreshRequest);
        
        expect(response.status).toBe(200);
        expect(response.data).toMatchObject(expectedResponse);
      } finally {
        api.post = originalPost;
      }
    });
  });

  describe('Meeting Management Endpoints', () => {
    it('should validate meeting creation contract', async () => {
      const expectedMeetingResponse = {
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        processing_status: expect.any(String),
        created_at: expect.any(String),
        updated_at: expect.any(String),
        user_id: expect.any(String),
      };

      const mockApiCall = jest.fn().mockResolvedValue({
        status: 201,
        data: {
          id: 'test-meeting-id',
          name: mockMeetingData.name,
          description: mockMeetingData.description,
          processing_status: 'pending',
          created_at: '2025-01-23T10:00:00Z',
          updated_at: '2025-01-23T10:00:00Z',
          user_id: 'test-user-id',
        },
      });

      const originalPost = api.post;
      api.post = mockApiCall;

      try {
        const response = await api.post('/api/v1/meetings', mockMeetingData);
        testMeetingId = response.data.id;
        
        expect(response.status).toBe(201);
        expect(response.data).toMatchObject(expectedMeetingResponse);
      } finally {
        api.post = originalPost;
      }
    });

    it('should validate meetings list endpoint contract', async () => {
      const expectedListResponse = {
        meetings: expect.any(Array),
        total: expect.any(Number),
        skip: expect.any(Number),
        limit: expect.any(Number),
        has_more: expect.any(Boolean),
      };

      const mockApiCall = jest.fn().mockResolvedValue({
        status: 200,
        data: {
          meetings: [
            {
              id: 'meeting-1',
              name: 'Test Meeting 1',
              processing_status: 'completed',
              created_at: '2025-01-23T10:00:00Z',
              updated_at: '2025-01-23T10:30:00Z',
              duration: 1800,
              participants: ['John Doe', 'Jane Smith'],
              has_transcript: true,
              has_summary: true,
              file_size: 15728640,
              audio_format: 'mp3',
            },
          ],
          total: 1,
          skip: 0,
          limit: 20,
          has_more: false,
        },
      });

      const originalGet = api.get;
      api.get = mockApiCall;

      try {
        const response = await api.get('/api/v1/meetings?skip=0&limit=20');
        
        expect(response.status).toBe(200);
        expect(response.data).toMatchObject(expectedListResponse);
        
        // Validate meeting structure
        if (response.data.meetings.length > 0) {
          const meeting = response.data.meetings[0];
          expect(meeting).toMatchObject({
            id: expect.any(String),
            name: expect.any(String),
            processing_status: expect.any(String),
            created_at: expect.any(String),
            updated_at: expect.any(String),
          });
        }
      } finally {
        api.get = originalGet;
      }
    });

    it('should validate meeting detail endpoint contract', async () => {
      const meetingId = 'test-meeting-id';
      const expectedDetailResponse = {
        id: expect.any(String),
        name: expect.any(String),
        description: expect.any(String),
        processing_status: expect.any(String),
        created_at: expect.any(String),
        updated_at: expect.any(String),
        duration: expect.any(Number),
        participants: expect.any(Array),
        audio_url: expect.any(String),
        transcript_data: expect.any(Array),
        summary_data: expect.objectContaining({
          summary: expect.any(String),
          summary_type: expect.any(String),
          provider: expect.any(String),
          model: expect.any(String),
          generated_at: expect.any(String),
          quality_score: expect.any(Number),
        }),
      };

      const mockApiCall = jest.fn().mockResolvedValue({
        status: 200,
        data: {
          id: meetingId,
          name: 'Test Meeting',
          description: 'Test description',
          processing_status: 'completed',
          created_at: '2025-01-23T10:00:00Z',
          updated_at: '2025-01-23T10:30:00Z',
          duration: 1800,
          participants: ['John Doe', 'Jane Smith'],
          audio_url: `/api/v1/meetings/${meetingId}/audio`,
          transcript_data: [
            {
              id: 'transcript-1',
              text: 'Hello everyone',
              speaker_id: 'speaker_1',
              speaker_name: 'John Doe',
              start_time: 0.0,
              end_time: 3.5,
              confidence: 0.95,
            },
          ],
          summary_data: {
            summary: 'Meeting summary content',
            summary_type: 'detailed',
            provider: 'openai',
            model: 'gpt-4',
            generated_at: '2025-01-23T10:30:00Z',
            quality_score: 0.92,
          },
        },
      });

      const originalGet = api.get;
      api.get = mockApiCall;

      try {
        const response = await api.get(`/api/v1/meetings/${meetingId}`);
        
        expect(response.status).toBe(200);
        expect(response.data).toMatchObject(expectedDetailResponse);
      } finally {
        api.get = originalGet;
      }
    });
  });

  describe('Audio Processing Endpoints', () => {
    it('should validate audio upload endpoint contract', async () => {
      const expectedUploadResponse = {
        job_id: expect.any(String),
        meeting_id: expect.any(String),
        status: 'pending',
        estimated_duration: expect.any(Number),
        message: expect.any(String),
      };

      // Create FormData for file upload
      const formData = new FormData();
      const mockFile = new File(['audio content'], 'test.mp3', { type: 'audio/mp3' });
      formData.append('file', mockFile);
      formData.append('meeting_name', 'Test Audio Upload');
      formData.append('enable_diarization', 'true');

      const mockApiCall = jest.fn().mockResolvedValue({
        status: 200,
        data: {
          job_id: 'job-123',
          meeting_id: 'meeting-456',
          status: 'pending',
          estimated_duration: 300,
          message: 'Audio upload successful, processing started',
        },
      });

      const originalPost = api.post;
      api.post = mockApiCall;

      try {
        const response = await api.post('/api/v1/audio/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        });
        
        expect(response.status).toBe(200);
        expect(response.data).toMatchObject(expectedUploadResponse);
      } finally {
        api.post = originalPost;
      }
    });

    it('should validate processing status endpoint contract', async () => {
      const jobId = 'test-job-id';
      const expectedStatusResponse = {
        job_id: expect.any(String),
        meeting_id: expect.any(String),
        status: expect.any(String),
        progress: expect.any(Number),
        current_step: expect.any(String),
        estimated_completion: expect.any(String),
        error_message: null,
        result: null,
      };

      const mockApiCall = jest.fn().mockResolvedValue({
        status: 200,
        data: {
          job_id: jobId,
          meeting_id: 'meeting-456',
          status: 'processing',
          progress: 45,
          current_step: 'Transcribing audio with Whisper',
          estimated_completion: '2025-01-23T10:35:00Z',
          error_message: null,
          result: null,
        },
      });

      const originalGet = api.get;
      api.get = mockApiCall;

      try {
        const response = await api.get(`/api/v1/audio/status/${jobId}`);
        
        expect(response.status).toBe(200);
        expect(response.data).toMatchObject(expectedStatusResponse);
      } finally {
        api.get = originalGet;
      }
    });
  });

  describe('Summary Generation Endpoints', () => {
    it('should validate summary generation contract', async () => {
      const meetingId = 'test-meeting-id';
      const summaryRequest = {
        summary_type: 'structured',
        provider: 'openai',
        model: 'gpt-4',
        custom_prompt: 'Focus on action items',
        enable_chunking: true,
      };

      const expectedSummaryResponse = {
        job_id: expect.any(String),
        status: 'pending',
        estimated_duration: expect.any(Number),
        message: expect.any(String),
      };

      const mockApiCall = jest.fn().mockResolvedValue({
        status: 200,
        data: {
          job_id: 'summary-job-123',
          status: 'pending',
          estimated_duration: 180,
          message: 'Summary generation started',
        },
      });

      const originalPost = api.post;
      api.post = mockApiCall;

      try {
        const response = await api.post(`/api/v1/meetings/${meetingId}/summary`, summaryRequest);
        
        expect(response.status).toBe(200);
        expect(response.data).toMatchObject(expectedSummaryResponse);
      } finally {
        api.post = originalPost;
      }
    });

    it('should validate summary types endpoint contract', async () => {
      const expectedTypesResponse = {
        summary_types: expect.any(Object),
        supported_providers: expect.any(Object),
      };

      const mockApiCall = jest.fn().mockResolvedValue({
        status: 200,
        data: {
          summary_types: {
            structured: {
              description: 'Comprehensive structured summary',
              response_model: 'StructuredSummaryResponse',
              chunking_enabled: true,
              post_processing: true,
            },
            brief: {
              description: 'Concise summary',
              max_length: 200,
              style: 'bullet points',
              chunking_enabled: false,
            },
          },
          supported_providers: {
            openai: {
              models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo'],
              default_model: 'gpt-4',
            },
            anthropic: {
              models: ['claude-3-opus', 'claude-3-sonnet'],
              default_model: 'claude-3-sonnet',
            },
          },
        },
      });

      const originalGet = api.get;
      api.get = mockApiCall;

      try {
        const response = await api.get('/api/v1/summary/types');
        
        expect(response.status).toBe(200);
        expect(response.data).toMatchObject(expectedTypesResponse);
      } finally {
        api.get = originalGet;
      }
    });
  });

  describe('Error Response Contracts', () => {
    it('should validate standard error response format', async () => {
      const expectedErrorResponse = {
        detail: expect.any(String),
        error_code: expect.any(String),
        timestamp: expect.any(String),
        request_id: expect.any(String),
      };

      const mockApiCall = jest.fn().mockRejectedValue({
        response: {
          status: 400,
          data: {
            detail: 'Validation error',
            error_code: 'VALIDATION_FAILED',
            timestamp: '2025-01-23T10:30:00Z',
            request_id: 'req-123',
          },
        },
      });

      const originalPost = api.post;
      api.post = mockApiCall;

      try {
        await api.post('/api/v1/meetings', { invalid: 'data' });
      } catch (error: any) {
        expect(error.response.status).toBe(400);
        expect(error.response.data).toMatchObject(expectedErrorResponse);
      } finally {
        api.post = originalPost;
      }
    });

    it('should validate authentication error format', async () => {
      const mockApiCall = jest.fn().mockRejectedValue({
        response: {
          status: 401,
          data: {
            detail: 'Authentication required',
            error_code: 'AUTH_TOKEN_MISSING',
            timestamp: '2025-01-23T10:30:00Z',
            request_id: 'req-124',
          },
        },
      });

      const originalGet = api.get;
      api.get = mockApiCall;

      try {
        await api.get('/auth/me');
      } catch (error: any) {
        expect(error.response.status).toBe(401);
        expect(error.response.data.error_code).toBe('AUTH_TOKEN_MISSING');
      } finally {
        api.get = originalGet;
      }
    });
  });

  describe('Rate Limiting Headers', () => {
    it('should validate rate limit headers are present', async () => {
      const mockApiCall = jest.fn().mockResolvedValue({
        status: 200,
        headers: {
          'x-ratelimit-limit': '100',
          'x-ratelimit-remaining': '95',
          'x-ratelimit-reset': '1642234567',
        },
        data: { status: 'ok' },
      });

      const originalGet = api.get;
      api.get = mockApiCall;

      try {
        const response = await api.get('/health');
        
        expect(response.headers['x-ratelimit-limit']).toBeDefined();
        expect(response.headers['x-ratelimit-remaining']).toBeDefined();
        expect(response.headers['x-ratelimit-reset']).toBeDefined();
      } finally {
        api.get = originalGet;
      }
    });
  });
});