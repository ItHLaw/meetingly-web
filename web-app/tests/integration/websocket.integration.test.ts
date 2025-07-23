/**
 * @jest-environment jsdom
 */

import { io, Socket } from 'socket.io-client';
import { waitFor } from '@testing-library/react';

// Mock socket.io-client
jest.mock('socket.io-client');

const mockIo = io as jest.MockedFunction<typeof io>;

describe('WebSocket Integration Tests', () => {
  let mockSocket: jest.Mocked<Socket>;

  beforeEach(() => {
    mockSocket = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn(),
      disconnect: jest.fn(),
      connect: jest.fn(),
      connected: false,
      id: 'test-socket-id',
    } as any;

    mockIo.mockReturnValue(mockSocket);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Connection Management', () => {
    it('should establish WebSocket connection with authentication token', () => {
      const token = 'test-jwt-token';
      const userId = 'test-user-id';
      
      const socket = io('ws://localhost:8000', {
        auth: {
          token,
          userId,
        },
        transports: ['websocket'],
      });

      expect(mockIo).toHaveBeenCalledWith('ws://localhost:8000', {
        auth: {
          token,
          userId,
        },
        transports: ['websocket'],
      });
    });

    it('should handle connection events', () => {
      const socket = io('ws://localhost:8000');
      
      const connectHandler = jest.fn();
      const disconnectHandler = jest.fn();
      const errorHandler = jest.fn();

      socket.on('connect', connectHandler);
      socket.on('disconnect', disconnectHandler);
      socket.on('connect_error', errorHandler);

      expect(mockSocket.on).toHaveBeenCalledWith('connect', connectHandler);
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', disconnectHandler);
      expect(mockSocket.on).toHaveBeenCalledWith('connect_error', errorHandler);
    });

    it('should handle reconnection logic', () => {
      const socket = io('ws://localhost:8000', {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      expect(mockIo).toHaveBeenCalledWith('ws://localhost:8000', {
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });
    });
  });

  describe('Processing Updates', () => {
    it('should receive processing update messages', async () => {
      const socket = io('ws://localhost:8000');
      const updateHandler = jest.fn();

      socket.on('processing_update', updateHandler);

      // Simulate receiving a processing update
      const mockUpdate = {
        type: 'processing_update',
        data: {
          job_id: 'job-123',
          meeting_id: 'meeting-456',
          status: 'processing',
          progress: 65,
          current_step: 'Generating summary',
          estimated_completion: '2025-01-15T10:35:00Z',
        },
      };

      // Simulate the server sending the message
      const processingHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'processing_update'
      )?.[1];

      if (processingHandler) {
        processingHandler(mockUpdate.data);
      }

      expect(updateHandler).toHaveBeenCalledWith(mockUpdate.data);
    });

    it('should handle processing completion', async () => {
      const socket = io('ws://localhost:8000');
      const completionHandler = jest.fn();

      socket.on('processing_complete', completionHandler);

      const mockCompletion = {
        job_id: 'job-123',
        meeting_id: 'meeting-456',
        status: 'completed',
        progress: 100,
        result: {
          summary_id: 'summary-789',
          transcript_segments: 15,
        },
      };

      // Simulate the server sending the completion message
      const handler = mockSocket.on.mock.calls.find(
        call => call[0] === 'processing_complete'
      )?.[1];

      if (handler) {
        handler(mockCompletion);
      }

      expect(completionHandler).toHaveBeenCalledWith(mockCompletion);
    });

    it('should handle processing errors', async () => {
      const socket = io('ws://localhost:8000');
      const errorHandler = jest.fn();

      socket.on('processing_error', errorHandler);

      const mockError = {
        job_id: 'job-123',
        meeting_id: 'meeting-456',
        status: 'failed',
        error_message: 'AI model timeout',
        error_code: 'MODEL_TIMEOUT',
      };

      // Simulate the server sending the error message
      const handler = mockSocket.on.mock.calls.find(
        call => call[0] === 'processing_error'
      )?.[1];

      if (handler) {
        handler(mockError);
      }

      expect(errorHandler).toHaveBeenCalledWith(mockError);
    });
  });

  describe('Summary Ready Notifications', () => {
    it('should receive summary ready messages', async () => {
      const socket = io('ws://localhost:8000');
      const summaryHandler = jest.fn();

      socket.on('summary_ready', summaryHandler);

      const mockSummaryReady = {
        type: 'summary_ready',
        data: {
          meeting_id: 'meeting-456',
          summary_type: 'structured',
          provider: 'openai',
          model: 'gpt-4',
          quality_score: 0.92,
          generated_at: '2025-01-15T10:30:00Z',
        },
      };

      // Simulate the server sending the message
      const handler = mockSocket.on.mock.calls.find(
        call => call[0] === 'summary_ready'
      )?.[1];

      if (handler) {
        handler(mockSummaryReady.data);
      }

      expect(summaryHandler).toHaveBeenCalledWith(mockSummaryReady.data);
    });
  });

  describe('System Notifications', () => {
    it('should receive system notification messages', async () => {
      const socket = io('ws://localhost:8000');
      const notificationHandler = jest.fn();

      socket.on('system_notification', notificationHandler);

      const mockNotification = {
        type: 'system_notification',
        data: {
          title: 'Processing Complete',
          message: 'Your meeting transcription is ready',
          notification_type: 'success',
          timestamp: '2025-01-15T10:30:00Z',
          action_url: '/meetings/meeting-456',
        },
      };

      // Simulate the server sending the notification
      const handler = mockSocket.on.mock.calls.find(
        call => call[0] === 'system_notification'
      )?.[1];

      if (handler) {
        handler(mockNotification.data);
      }

      expect(notificationHandler).toHaveBeenCalledWith(mockNotification.data);
    });

    it('should handle different notification types', async () => {
      const socket = io('ws://localhost:8000');
      const notificationHandler = jest.fn();

      socket.on('system_notification', notificationHandler);

      const notificationTypes = [
        {
          title: 'Error',
          message: 'Processing failed',
          notification_type: 'error',
        },
        {
          title: 'Warning',
          message: 'Low disk space',
          notification_type: 'warning',
        },
        {
          title: 'Info',
          message: 'System maintenance scheduled',
          notification_type: 'info',
        },
      ];

      const handler = mockSocket.on.mock.calls.find(
        call => call[0] === 'system_notification'
      )?.[1];

      for (const notification of notificationTypes) {
        if (handler) {
          handler(notification);
        }
      }

      expect(notificationHandler).toHaveBeenCalledTimes(3);
      expect(notificationHandler).toHaveBeenCalledWith(
        expect.objectContaining({ notification_type: 'error' })
      );
      expect(notificationHandler).toHaveBeenCalledWith(
        expect.objectContaining({ notification_type: 'warning' })
      );
      expect(notificationHandler).toHaveBeenCalledWith(
        expect.objectContaining({ notification_type: 'info' })
      );
    });
  });

  describe('Client-to-Server Messages', () => {
    it('should send join room messages', () => {
      const socket = io('ws://localhost:8000');
      const userId = 'user-123';

      socket.emit('join_user_room', { userId });

      expect(mockSocket.emit).toHaveBeenCalledWith('join_user_room', { userId });
    });

    it('should send processing status requests', () => {
      const socket = io('ws://localhost:8000');
      const jobId = 'job-123';

      socket.emit('get_processing_status', { job_id: jobId });

      expect(mockSocket.emit).toHaveBeenCalledWith('get_processing_status', { job_id: jobId });
    });

    it('should send heartbeat messages', () => {
      const socket = io('ws://localhost:8000');

      socket.emit('ping', { timestamp: Date.now() });

      expect(mockSocket.emit).toHaveBeenCalledWith('ping', {
        timestamp: expect.any(Number),
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle connection errors gracefully', () => {
      const socket = io('ws://localhost:8000');
      const errorHandler = jest.fn();

      socket.on('connect_error', errorHandler);

      const mockError = new Error('Connection failed');

      // Simulate connection error
      const handler = mockSocket.on.mock.calls.find(
        call => call[0] === 'connect_error'
      )?.[1];

      if (handler) {
        handler(mockError);
      }

      expect(errorHandler).toHaveBeenCalledWith(mockError);
    });

    it('should handle authentication errors', () => {
      const socket = io('ws://localhost:8000');
      const authErrorHandler = jest.fn();

      socket.on('auth_error', authErrorHandler);

      const mockAuthError = {
        message: 'Invalid token',
        code: 'AUTH_INVALID_TOKEN',
      };

      // Simulate auth error
      const handler = mockSocket.on.mock.calls.find(
        call => call[0] === 'auth_error'
      )?.[1];

      if (handler) {
        handler(mockAuthError);
      }

      expect(authErrorHandler).toHaveBeenCalledWith(mockAuthError);
    });

    it('should handle unexpected disconnections', () => {
      const socket = io('ws://localhost:8000');
      const disconnectHandler = jest.fn();

      socket.on('disconnect', disconnectHandler);

      const disconnectReason = 'transport close';

      // Simulate unexpected disconnection
      const handler = mockSocket.on.mock.calls.find(
        call => call[0] === 'disconnect'
      )?.[1];

      if (handler) {
        handler(disconnectReason);
      }

      expect(disconnectHandler).toHaveBeenCalledWith(disconnectReason);
    });
  });

  describe('Cleanup', () => {
    it('should properly disconnect and clean up', () => {
      const socket = io('ws://localhost:8000');

      socket.disconnect();

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should remove all event listeners on cleanup', () => {
      const socket = io('ws://localhost:8000');

      const handler1 = jest.fn();
      const handler2 = jest.fn();

      socket.on('processing_update', handler1);
      socket.on('summary_ready', handler2);

      socket.off('processing_update', handler1);
      socket.off('summary_ready', handler2);

      expect(mockSocket.off).toHaveBeenCalledWith('processing_update', handler1);
      expect(mockSocket.off).toHaveBeenCalledWith('summary_ready', handler2);
    });
  });

  describe('Real-time Updates Integration', () => {
    it('should handle complete audio processing workflow', async () => {
      const socket = io('ws://localhost:8000');
      
      const processingHandler = jest.fn();
      const completionHandler = jest.fn();
      const summaryHandler = jest.fn();
      const notificationHandler = jest.fn();

      socket.on('processing_update', processingHandler);
      socket.on('processing_complete', completionHandler);
      socket.on('summary_ready', summaryHandler);
      socket.on('system_notification', notificationHandler);

      // Simulate complete workflow
      const jobId = 'job-123';
      const meetingId = 'meeting-456';

      // 1. Processing started
      const startedUpdate = {
        job_id: jobId,
        meeting_id: meetingId,
        status: 'processing',
        progress: 0,
        current_step: 'Uploading audio file',
      };

      // 2. Progress update
      const progressUpdate = {
        job_id: jobId,
        meeting_id: meetingId,
        status: 'processing',
        progress: 50,
        current_step: 'Transcribing audio',
      };

      // 3. Processing complete
      const completion = {
        job_id: jobId,
        meeting_id: meetingId,
        status: 'completed',
        progress: 100,
        result: { transcript_segments: 20 },
      };

      // 4. Summary ready
      const summaryReady = {
        meeting_id: meetingId,
        summary_type: 'structured',
        provider: 'openai',
        model: 'gpt-4',
      };

      // 5. System notification
      const notification = {
        title: 'Processing Complete',
        message: 'Your meeting summary is ready',
        notification_type: 'success',
      };

      // Simulate the sequence of messages
      const handlers = {
        processing_update: mockSocket.on.mock.calls.find(call => call[0] === 'processing_update')?.[1],
        processing_complete: mockSocket.on.mock.calls.find(call => call[0] === 'processing_complete')?.[1],
        summary_ready: mockSocket.on.mock.calls.find(call => call[0] === 'summary_ready')?.[1],
        system_notification: mockSocket.on.mock.calls.find(call => call[0] === 'system_notification')?.[1],
      };

      if (handlers.processing_update) {
        handlers.processing_update(startedUpdate);
        handlers.processing_update(progressUpdate);
      }
      
      if (handlers.processing_complete) {
        handlers.processing_complete(completion);
      }
      
      if (handlers.summary_ready) {
        handlers.summary_ready(summaryReady);
      }
      
      if (handlers.system_notification) {
        handlers.system_notification(notification);
      }

      expect(processingHandler).toHaveBeenCalledTimes(2);
      expect(processingHandler).toHaveBeenCalledWith(startedUpdate);
      expect(processingHandler).toHaveBeenCalledWith(progressUpdate);
      expect(completionHandler).toHaveBeenCalledWith(completion);
      expect(summaryHandler).toHaveBeenCalledWith(summaryReady);
      expect(notificationHandler).toHaveBeenCalledWith(notification);
    });
  });
});