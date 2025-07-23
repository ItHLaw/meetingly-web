/**
 * WebSocket client service for real-time communication
 * Handles connection management, message routing, and automatic reconnection
 */

import { getAuthToken } from '@/lib/auth';

export interface WebSocketMessage {
  type: string;
  timestamp: string;
  [key: string]: any;
}

export interface ProcessingStatusUpdate extends WebSocketMessage {
  type: 'processing_status_update';
  job_id: string;
  meeting_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress?: number;
  error_message?: string;
  result?: any;
}

export interface MeetingCreated extends WebSocketMessage {
  type: 'meeting_created';
  meeting: {
    id: string;
    name: string;
    status: string;
    processing_status: string;
    created_at: string;
    participants: string[];
  };
}

export interface MeetingUpdated extends WebSocketMessage {
  type: 'meeting_updated';
  meeting: {
    id: string;
    name: string;
    status: string;
    processing_status: string;
    updated_at: string;
    participants: string[];
  };
}

export interface TranscriptReady extends WebSocketMessage {
  type: 'transcript_ready';
  meeting_id: string;
  transcript: any;
}

export interface SummaryReady extends WebSocketMessage {
  type: 'summary_ready';
  meeting_id: string;
  summary: any;
}

export interface SystemNotification extends WebSocketMessage {
  type: 'system_notification';
  notification_type: 'info' | 'success' | 'warning' | 'error';
  title: string;
  message: string;
}

export interface ErrorNotification extends WebSocketMessage {
  type: 'error';
  error_type: string;
  error_message: string;
  context?: Record<string, any>;
}

export type WebSocketEventMap = {
  'processing_status_update': ProcessingStatusUpdate;
  'meeting_created': MeetingCreated;
  'meeting_updated': MeetingUpdated;
  'transcript_ready': TranscriptReady;
  'summary_ready': SummaryReady;
  'system_notification': SystemNotification;
  'error': ErrorNotification;
  'connection_established': WebSocketMessage;
  'ping': WebSocketMessage;
  'maintenance_notice': WebSocketMessage;
  'broadcast': WebSocketMessage;
};

type EventListener<T extends keyof WebSocketEventMap> = (event: WebSocketEventMap[T]) => void;

class WebSocketService {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000; // Start with 1 second
  private maxReconnectDelay = 30000; // Max 30 seconds
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnecting = false;
  private shouldReconnect = true;
  
  private listeners: Map<string, Set<Function>> = new Map();
  private subscriptions: Set<string> = new Set();
  
  private baseUrl: string;
  
  constructor() {
    // Determine WebSocket URL based on environment
    if (typeof window !== 'undefined') {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, '') || window.location.host;
      this.baseUrl = `${protocol}//${host}/api/ws`;
    } else {
      this.baseUrl = '';
    }
  }
  
  /**
   * Connect to WebSocket server
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }
    
    this.isConnecting = true;
    
    try {
      const token = getAuthToken();
      if (!token) {
        throw new Error('No authentication token available');
      }
      
      const wsUrl = `${this.baseUrl}?token=${encodeURIComponent(token)}`;
      this.ws = new WebSocket(wsUrl);
      
      this.ws.onopen = this.handleOpen.bind(this);
      this.ws.onmessage = this.handleMessage.bind(this);
      this.ws.onclose = this.handleClose.bind(this);
      this.ws.onerror = this.handleError.bind(this);
      
    } catch (error) {
      console.error('WebSocket connection failed:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }
  
  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.shouldReconnect = false;
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }
    
    this.isConnecting = false;
    this.reconnectAttempts = 0;
  }
  
  /**
   * Send a message to the server
   */
  send(message: Record<string, any>): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error('Failed to send WebSocket message:', error);
        return false;
      }
    }
    return false;
  }
  
  /**
   * Subscribe to specific job updates
   */
  subscribeToJob(jobId: string): void {
    const subscription = `job:${jobId}`;
    if (!this.subscriptions.has(subscription)) {
      this.subscriptions.add(subscription);
      this.send({
        type: 'subscribe_to_job',
        job_id: jobId
      });
    }
  }
  
  /**
   * Unsubscribe from job updates
   */
  unsubscribeFromJob(jobId: string): void {
    const subscription = `job:${jobId}`;
    if (this.subscriptions.has(subscription)) {
      this.subscriptions.delete(subscription);
      this.send({
        type: 'unsubscribe_from_job',
        job_id: jobId
      });
    }
  }
  
  /**
   * Add event listener
   */
  addEventListener<T extends keyof WebSocketEventMap>(
    event: T,
    listener: EventListener<T>
  ): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
  }
  
  /**
   * Remove event listener
   */
  removeEventListener<T extends keyof WebSocketEventMap>(
    event: T,
    listener: EventListener<T>
  ): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.delete(listener);
      if (eventListeners.size === 0) {
        this.listeners.delete(event);
      }
    }
  }
  
  /**
   * Get connection status
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
  
  /**
   * Get ready state
   */
  get readyState(): number {
    return this.ws?.readyState ?? WebSocket.CLOSED;
  }
  
  private handleOpen(): void {
    console.log('WebSocket connected');
    this.isConnecting = false;
    this.reconnectAttempts = 0;
    this.reconnectDelay = 1000;
    
    // Start heartbeat
    this.startHeartbeat();
    
    // Re-subscribe to any existing subscriptions
    this.subscriptions.forEach(subscription => {
      if (subscription.startsWith('job:')) {
        const jobId = subscription.replace('job:', '');
        this.send({
          type: 'subscribe_to_job',
          job_id: jobId
        });
      }
    });
    
    // Emit connection event
    this.emit('connection_established', {
      type: 'connection_established',
      timestamp: new Date().toISOString()
    });
  }
  
  private handleMessage(event: MessageEvent): void {
    try {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      // Handle ping/pong
      if (message.type === 'ping') {
        this.send({ type: 'pong', timestamp: new Date().toISOString() });
        return;
      }
      
      // Emit the message to listeners
      this.emit(message.type, message);
      
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error);
    }
  }
  
  private handleClose(event: CloseEvent): void {
    console.log('WebSocket disconnected:', event.code, event.reason);
    this.isConnecting = false;
    
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    
    // Attempt to reconnect if it wasn't a clean disconnect
    if (this.shouldReconnect && event.code !== 1000) {
      this.scheduleReconnect();
    }
  }
  
  private handleError(error: Event): void {
    console.error('WebSocket error:', error);
    this.isConnecting = false;
  }
  
  private scheduleReconnect(): void {
    if (!this.shouldReconnect || this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnection attempts reached or reconnection disabled');
      return;
    }
    
    this.reconnectAttempts++;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), this.maxReconnectDelay);
    
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      if (this.shouldReconnect) {
        this.connect();
      }
    }, delay);
  }
  
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', timestamp: new Date().toISOString() });
      }
    }, 30000); // Send ping every 30 seconds
  }
  
  private emit<T extends keyof WebSocketEventMap>(
    event: T,
    data: WebSocketEventMap[T]
  ): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          (listener as EventListener<T>)(data);
        } catch (error) {
          console.error(`Error in WebSocket event listener for ${event}:`, error);
        }
      });
    }
  }
}

// Create singleton instance
export const webSocketService = new WebSocketService();

// Auto-connect when imported in browser environment
if (typeof window !== 'undefined') {
  // Connect after a short delay to allow for auth token to be available
  setTimeout(() => {
    webSocketService.connect();
  }, 1000);
  
  // Clean up on page unload
  window.addEventListener('beforeunload', () => {
    webSocketService.disconnect();
  });
}