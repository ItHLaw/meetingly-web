import axios from 'axios';
import { createAxiosWithRetry } from './retry';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const baseApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
});

// Add retry logic to the axios instance
export const api = createAxiosWithRetry(baseApi);

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    // Token will be handled by cookies for now
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized access
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// API endpoints
export const authAPI = {
  me: () => api.get('/auth/me'),
  logout: () => api.post('/auth/logout'),
};

export const meetingsAPI = {
  list: () => api.get('/api/meetings'),
  create: (data: any) => api.post('/api/meetings', data),
  get: (id: string) => api.get(`/api/meetings/${id}`),
  update: (id: string, data: any) => api.put(`/api/meetings/${id}`, data),
  delete: (id: string) => api.delete(`/api/meetings/${id}`),
};

export const audioAPI = {
  upload: (file: File, options?: {
    meetingId?: string;
    enableDiarization?: boolean;
    model?: string;
    language?: string;
  }) => {
    const formData = new FormData();
    formData.append('file', file);
    
    if (options?.meetingId) {
      formData.append('meeting_id', options.meetingId);
    }
    if (options?.enableDiarization !== undefined) {
      formData.append('enable_diarization', options.enableDiarization.toString());
    }
    if (options?.model) {
      formData.append('model', options.model);
    }
    if (options?.language) {
      formData.append('language', options.language);
    }
    
    return api.post('/api/audio/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
  },
  status: (jobId: string) => api.get(`/api/audio/status/${jobId}`),
  jobs: () => api.get('/api/audio/jobs'),
};