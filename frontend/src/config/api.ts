export const apiConfig = {
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5167',
  timeout: 30000,
  endpoints: {
    auth: {
      microsoftCallback: '/auth/microsoft/callback',
      microsoftToken: '/auth/microsoft/token',
      microsoftLogin: '/auth/microsoft/login',
      refresh: '/auth/refresh',
      logout: '/auth/logout',
      me: '/auth/me',
    },
    meetings: {
      list: '/api/meetings',
      create: '/api/meetings',
      get: (id: string) => `/api/meetings/${id}`,
      update: (id: string) => `/api/meetings/${id}`,
      delete: (id: string) => `/api/meetings/${id}`,
    },
    audio: {
      upload: '/api/audio/upload',
      status: (jobId: string) => `/api/audio/status/${jobId}`,
      jobs: '/api/audio/jobs',
    },
    transcripts: {
      process: '/api/transcripts/process',
    },
    config: {
      models: '/api/config/models',
      user: '/api/config/user',
    },
    websocket: {
      url: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:5167/ws',
    },
  },
} as const;

export type ApiConfig = typeof apiConfig;