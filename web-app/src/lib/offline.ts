/**
 * Offline handling utilities with network detection and request queuing
 */

export interface QueuedRequest {
  id: string;
  url: string;
  method: string;
  data?: any;
  headers?: Record<string, string>;
  timestamp: number;
  retryCount: number;
  maxRetries: number;
}

export interface NetworkStatus {
  isOnline: boolean;
  connectionType?: string;
  effectiveType?: string;
  downlink?: number;
  rtt?: number;
}

class OfflineManager {
  private isOnline: boolean = navigator.onLine;
  private requestQueue: QueuedRequest[] = [];
  private listeners: Set<(status: NetworkStatus) => void> = new Set();
  private retryInterval: NodeJS.Timeout | null = null;
  private readonly STORAGE_KEY = 'meetingly_offline_queue';
  private readonly RETRY_INTERVAL = 30000; // 30 seconds
  private readonly MAX_QUEUE_SIZE = 100;

  constructor() {
    this.initializeEventListeners();
    this.loadQueueFromStorage();
    this.startRetryInterval();
  }

  private initializeEventListeners() {
    // Basic online/offline events
    window.addEventListener('online', this.handleOnline.bind(this));
    window.addEventListener('offline', this.handleOffline.bind(this));

    // Network Information API (if available)
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      connection?.addEventListener('change', this.handleConnectionChange.bind(this));
    }
  }

  private handleOnline() {
    console.log('Network: Back online');
    this.isOnline = true;
    this.notifyListeners();
    this.processQueue();
  }

  private handleOffline() {
    console.log('Network: Gone offline');
    this.isOnline = false;
    this.notifyListeners();
  }

  private handleConnectionChange() {
    console.log('Network: Connection changed');
    this.notifyListeners();
  }

  private notifyListeners() {
    const status = this.getNetworkStatus();
    this.listeners.forEach(listener => listener(status));
  }

  private loadQueueFromStorage() {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        this.requestQueue = JSON.parse(stored);
        console.log(`Loaded ${this.requestQueue.length} queued requests from storage`);
      }
    } catch (error) {
      console.error('Failed to load request queue from storage:', error);
      this.requestQueue = [];
    }
  }

  private saveQueueToStorage() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.requestQueue));
    } catch (error) {
      console.error('Failed to save request queue to storage:', error);
    }
  }

  private startRetryInterval() {
    this.retryInterval = setInterval(() => {
      if (this.isOnline && this.requestQueue.length > 0) {
        this.processQueue();
      }
    }, this.RETRY_INTERVAL);
  }

  private async processQueue() {
    if (!this.isOnline || this.requestQueue.length === 0) {
      return;
    }

    console.log(`Processing ${this.requestQueue.length} queued requests`);
    const requestsToProcess = [...this.requestQueue];
    this.requestQueue = [];

    for (const request of requestsToProcess) {
      try {
        await this.executeRequest(request);
        console.log(`Successfully executed queued request: ${request.method} ${request.url}`);
      } catch (error) {
        console.error(`Failed to execute queued request: ${request.method} ${request.url}`, error);
        
        // Retry logic
        if (request.retryCount < request.maxRetries) {
          request.retryCount++;
          request.timestamp = Date.now();
          this.requestQueue.push(request);
        } else {
          console.warn(`Giving up on request after ${request.maxRetries} retries: ${request.method} ${request.url}`);
        }
      }
    }

    this.saveQueueToStorage();
  }

  private async executeRequest(request: QueuedRequest): Promise<any> {
    const response = await fetch(request.url, {
      method: request.method,
      headers: {
        'Content-Type': 'application/json',
        ...request.headers,
      },
      body: request.data ? JSON.stringify(request.data) : undefined,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  public getNetworkStatus(): NetworkStatus {
    let status: NetworkStatus = { isOnline: this.isOnline };

    // Add connection information if available
    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      status = {
        ...status,
        connectionType: connection?.type,
        effectiveType: connection?.effectiveType,
        downlink: connection?.downlink,
        rtt: connection?.rtt,
      };
    }

    return status;
  }

  public queueRequest(
    url: string,
    method: string = 'GET',
    data?: any,
    headers?: Record<string, string>,
    maxRetries: number = 3
  ): string {
    // Don't queue if we're online and can execute immediately
    if (this.isOnline) {
      throw new Error('Cannot queue request while online - execute immediately instead');
    }

    // Limit queue size
    if (this.requestQueue.length >= this.MAX_QUEUE_SIZE) {
      // Remove oldest request
      this.requestQueue.shift();
      console.warn('Request queue full, removing oldest request');
    }

    const request: QueuedRequest = {
      id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      url,
      method: method.toUpperCase(),
      data,
      headers,
      timestamp: Date.now(),
      retryCount: 0,
      maxRetries,
    };

    this.requestQueue.push(request);
    this.saveQueueToStorage();

    console.log(`Queued request: ${method} ${url}`);
    return request.id;
  }

  public removeQueuedRequest(id: string): boolean {
    const initialLength = this.requestQueue.length;
    this.requestQueue = this.requestQueue.filter(req => req.id !== id);
    
    if (this.requestQueue.length < initialLength) {
      this.saveQueueToStorage();
      return true;
    }
    
    return false;
  }

  public getQueuedRequests(): QueuedRequest[] {
    return [...this.requestQueue];
  }

  public clearQueue(): void {
    this.requestQueue = [];
    this.saveQueueToStorage();
    console.log('Request queue cleared');
  }

  public addListener(callback: (status: NetworkStatus) => void): () => void {
    this.listeners.add(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(callback);
    };
  }

  public destroy(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }

    window.removeEventListener('online', this.handleOnline.bind(this));
    window.removeEventListener('offline', this.handleOffline.bind(this));

    if ('connection' in navigator) {
      const connection = (navigator as any).connection;
      connection?.removeEventListener('change', this.handleConnectionChange.bind(this));
    }

    this.listeners.clear();
  }
}

// Singleton instance
export const offlineManager = new OfflineManager();

/**
 * React hook for network status
 */
import { useState, useEffect } from 'react';

export function useNetworkStatus() {
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(
    offlineManager.getNetworkStatus()
  );

  useEffect(() => {
    const unsubscribe = offlineManager.addListener(setNetworkStatus);
    return unsubscribe;
  }, []);

  return networkStatus;
}

/**
 * React hook for offline queue management
 */
export function useOfflineQueue() {
  const [queuedRequests, setQueuedRequests] = useState<QueuedRequest[]>(
    offlineManager.getQueuedRequests()
  );

  useEffect(() => {
    const interval = setInterval(() => {
      setQueuedRequests(offlineManager.getQueuedRequests());
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  const queueRequest = (
    url: string,
    method: string = 'GET',
    data?: any,
    headers?: Record<string, string>,
    maxRetries: number = 3
  ) => {
    try {
      const id = offlineManager.queueRequest(url, method, data, headers, maxRetries);
      setQueuedRequests(offlineManager.getQueuedRequests());
      return id;
    } catch (error) {
      console.error('Failed to queue request:', error);
      throw error;
    }
  };

  const removeRequest = (id: string) => {
    const removed = offlineManager.removeQueuedRequest(id);
    if (removed) {
      setQueuedRequests(offlineManager.getQueuedRequests());
    }
    return removed;
  };

  const clearQueue = () => {
    offlineManager.clearQueue();
    setQueuedRequests([]);
  };

  return {
    queuedRequests,
    queueRequest,
    removeRequest,
    clearQueue,
  };
}

/**
 * Enhanced fetch function with offline support
 */
export async function fetchWithOfflineSupport(
  url: string,
  options: RequestInit & { 
    queueWhenOffline?: boolean;
    maxRetries?: number;
  } = {}
): Promise<Response> {
  const { queueWhenOffline = true, maxRetries = 3, ...fetchOptions } = options;
  const networkStatus = offlineManager.getNetworkStatus();

  if (networkStatus.isOnline) {
    // Try to make the request normally
    try {
      return await fetch(url, fetchOptions);
    } catch (error) {
      // If request fails and we can queue it, do so
      if (queueWhenOffline && !networkStatus.isOnline) {
        offlineManager.queueRequest(
          url,
          fetchOptions.method || 'GET',
          fetchOptions.body ? JSON.parse(fetchOptions.body as string) : undefined,
          fetchOptions.headers as Record<string, string>,
          maxRetries
        );
      }
      throw error;
    }
  } else if (queueWhenOffline) {
    // Queue the request for later
    offlineManager.queueRequest(
      url,
      fetchOptions.method || 'GET',
      fetchOptions.body ? JSON.parse(fetchOptions.body as string) : undefined,
      fetchOptions.headers as Record<string, string>,
      maxRetries
    );
    
    throw new Error('Request queued for offline processing');
  } else {
    throw new Error('Network is offline and request queueing is disabled');
  }
}