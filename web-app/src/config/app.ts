export const appConfig = {
  name: 'Meetily',
  description: 'AI-powered meeting transcription and summarization',
  version: '2.0.0',
  environment: process.env.NODE_ENV || 'development',
  websocket: {
    url: process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8000/ws',
    reconnectInterval: 5000,
    maxReconnectAttempts: 5,
  },
  upload: {
    maxFileSize: 100 * 1024 * 1024, // 100MB
    allowedTypes: ['audio/mpeg', 'audio/wav', 'audio/m4a', 'audio/flac'],
    chunkSize: 1024 * 1024, // 1MB chunks
  },
  ui: {
    theme: 'light',
    animations: true,
    notifications: {
      duration: 5000,
      position: 'top-right',
    },
  },
} as const;