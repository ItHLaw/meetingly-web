/**
 * @jest-environment jsdom
 */

import { OfflineManager, RequestQueue } from '../offline';

// Mock fetch
global.fetch = jest.fn();

describe('Offline Functionality', () => {
  let offlineManager: OfflineManager;
  let requestQueue: RequestQueue;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
    
    // Reset navigator.onLine
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
    });
    
    // Clear localStorage
    localStorage.clear();
    
    offlineManager = new OfflineManager();
    requestQueue = new RequestQueue();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('OfflineManager', () => {
    it('should initialize with current online status', () => {
      expect(offlineManager.isOnline()).toBe(true);
    });

    it('should detect when going offline', () => {
      const listener = jest.fn();
      offlineManager.addListener(listener);
      
      // Simulate going offline
      Object.defineProperty(navigator, 'onLine', { value: false });
      window.dispatchEvent(new Event('offline'));
      
      expect(listener).toHaveBeenCalledWith(false);
      expect(offlineManager.isOnline()).toBe(false);
    });

    it('should detect when coming online', () => {
      // Start offline
      Object.defineProperty(navigator, 'onLine', { value: false });
      offlineManager = new OfflineManager();
      
      const listener = jest.fn();
      offlineManager.addListener(listener);
      
      // Simulate coming online
      Object.defineProperty(navigator, 'onLine', { value: true });
      window.dispatchEvent(new Event('online'));
      
      expect(listener).toHaveBeenCalledWith(true);
      expect(offlineManager.isOnline()).toBe(true);
    });

    it('should periodically check connectivity', async () => {
      const fetchSpy = fetch as jest.MockedFunction<typeof fetch>;
      fetchSpy.mockResolvedValue(new Response());
      
      // Fast-forward time to trigger connectivity check
      jest.advanceTimersByTime(30000);
      
      await Promise.resolve(); // Allow promises to resolve
      
      expect(fetchSpy).toHaveBeenCalledWith('/api/health', { method: 'HEAD' });
    });

    it('should handle connectivity check failures', async () => {
      const listener = jest.fn();
      offlineManager.addListener(listener);
      
      const fetchSpy = fetch as jest.MockedFunction<typeof fetch>;
      fetchSpy.mockRejectedValue(new Error('Network error'));
      
      // Fast-forward time to trigger connectivity check
      jest.advanceTimersByTime(30000);
      
      await Promise.resolve(); // Allow promises to resolve
      
      expect(listener).toHaveBeenCalledWith(false);
    });

    it('should remove listeners correctly', () => {
      const listener1 = jest.fn();
      const listener2 = jest.fn();
      
      offlineManager.addListener(listener1);
      offlineManager.addListener(listener2);
      offlineManager.removeListener(listener1);
      
      // Trigger status change
      Object.defineProperty(navigator, 'onLine', { value: false });
      window.dispatchEvent(new Event('offline'));
      
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledWith(false);
    });
  });

  describe('RequestQueue', () => {
    beforeEach(() => {
      // Mock offline state for queue tests
      Object.defineProperty(navigator, 'onLine', { value: false });
      offlineManager = new OfflineManager();
    });

    it('should enqueue requests when offline', async () => {
      const request = {
        url: '/api/meetings',
        method: 'POST',
        data: { name: 'Test Meeting' },
        priority: 'high' as const,
      };
      
      await requestQueue.enqueue(request);
      
      const queuedRequests = requestQueue.getQueuedRequests();
      expect(queuedRequests).toHaveLength(1);
      expect(queuedRequests[0]).toMatchObject({
        url: '/api/meetings',
        method: 'POST',
        data: { name: 'Test Meeting' },
        priority: 'high',
      });
    });

    it('should persist queue to localStorage', async () => {
      const request = {
        url: '/api/meetings',
        method: 'POST',
        data: { name: 'Test Meeting' },
        priority: 'medium' as const,
      };
      
      await requestQueue.enqueue(request);
      
      const stored = localStorage.getItem('offline_request_queue');
      expect(stored).toBeTruthy();
      
      const parsed = JSON.parse(stored!);
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toMatchObject({
        url: '/api/meetings',
        method: 'POST',
      });
    });

    it('should load queue from localStorage on initialization', () => {
      const existingQueue = [
        {
          id: 'test-1',
          url: '/api/test',
          method: 'GET',
          timestamp: Date.now(),
          retryCount: 0,
          priority: 'low',
        },
      ];
      
      localStorage.setItem('offline_request_queue', JSON.stringify(existingQueue));
      
      const newQueue = new RequestQueue();
      const queuedRequests = newQueue.getQueuedRequests();
      
      expect(queuedRequests).toHaveLength(1);
      expect(queuedRequests[0].url).toBe('/api/test');
    });

    it('should process queue when coming online', async () => {
      const fetchSpy = fetch as jest.MockedFunction<typeof fetch>;
      fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
      
      // Enqueue some requests
      await requestQueue.enqueue({
        url: '/api/meetings',
        method: 'POST',
        data: { name: 'Meeting 1' },
        priority: 'high',
      });
      
      await requestQueue.enqueue({
        url: '/api/meetings',
        method: 'POST',
        data: { name: 'Meeting 2' },
        priority: 'low',
      });
      
      // Simulate coming online
      Object.defineProperty(navigator, 'onLine', { value: true });
      
      await requestQueue.processQueue();
      
      // Check that requests were made
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(requestQueue.getQueuedRequests()).toHaveLength(0);
    });

    it('should prioritize high priority requests', async () => {
      const fetchSpy = fetch as jest.MockedFunction<typeof fetch>;
      fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
      
      // Enqueue requests in different order
      await requestQueue.enqueue({
        url: '/api/low',
        method: 'GET',
        priority: 'low',
      });
      
      await requestQueue.enqueue({
        url: '/api/high',
        method: 'GET',
        priority: 'high',
      });
      
      await requestQueue.enqueue({
        url: '/api/medium',
        method: 'GET',
        priority: 'medium',
      });
      
      // Process queue
      Object.defineProperty(navigator, 'onLine', { value: true });
      await requestQueue.processQueue();
      
      // Verify order: high, medium, low
      const calls = fetchSpy.mock.calls;
      expect(calls[0][0]).toBe('/api/high');
      expect(calls[1][0]).toBe('/api/medium');
      expect(calls[2][0]).toBe('/api/low');
    });

    it('should retry failed requests up to limit', async () => {
      const fetchSpy = fetch as jest.MockedFunction<typeof fetch>;
      fetchSpy.mockRejectedValue(new Error('Network error'));
      
      await requestQueue.enqueue({
        url: '/api/test',
        method: 'GET',
        priority: 'medium',
      });
      
      Object.defineProperty(navigator, 'onLine', { value: true });
      
      // Process queue multiple times to trigger retries
      await requestQueue.processQueue();
      await requestQueue.processQueue();
      await requestQueue.processQueue();
      await requestQueue.processQueue(); // Should remove after 3 retries
      
      expect(fetchSpy).toHaveBeenCalledTimes(3);
      expect(requestQueue.getQueuedRequests()).toHaveLength(0);
    });

    it('should handle successful retries', async () => {
      const fetchSpy = fetch as jest.MockedFunction<typeof fetch>;
      
      // Fail first attempt, succeed second
      fetchSpy
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce(new Response('{}', { status: 200 }));
      
      await requestQueue.enqueue({
        url: '/api/test',
        method: 'GET',
        priority: 'medium',
      });
      
      Object.defineProperty(navigator, 'onLine', { value: true });
      
      await requestQueue.processQueue();
      await requestQueue.processQueue();
      
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(requestQueue.getQueuedRequests()).toHaveLength(0);
    });

    it('should clean up old requests', async () => {
      const oldTimestamp = Date.now() - (24 * 60 * 60 * 1000 + 1); // 24 hours + 1ms ago
      
      // Add old request directly to simulate aged request
      const oldRequest = {
        id: 'old-request',
        url: '/api/old',
        method: 'GET',
        timestamp: oldTimestamp,
        retryCount: 0,
        priority: 'low' as const,
      };
      
      requestQueue['queue'].push(oldRequest);
      
      await requestQueue.cleanupOldRequests();
      
      expect(requestQueue.getQueuedRequests()).toHaveLength(0);
    });

    it('should clear all requests', async () => {
      await requestQueue.enqueue({
        url: '/api/test1',
        method: 'GET',
        priority: 'high',
      });
      
      await requestQueue.enqueue({
        url: '/api/test2',
        method: 'POST',
        priority: 'low',
      });
      
      expect(requestQueue.getQueuedRequests()).toHaveLength(2);
      
      requestQueue.clear();
      
      expect(requestQueue.getQueuedRequests()).toHaveLength(0);
      expect(localStorage.getItem('offline_request_queue')).toBe('[]');
    });
  });

  describe('Integration', () => {
    it('should handle complete offline/online cycle', async () => {
      const fetchSpy = fetch as jest.MockedFunction<typeof fetch>;
      fetchSpy.mockResolvedValue(new Response('{}', { status: 200 }));
      
      const offlineListener = jest.fn();
      offlineManager.addListener(offlineListener);
      
      // Start online
      expect(offlineManager.isOnline()).toBe(true);
      
      // Go offline
      Object.defineProperty(navigator, 'onLine', { value: false });
      window.dispatchEvent(new Event('offline'));
      
      expect(offlineListener).toHaveBeenCalledWith(false);
      
      // Queue requests while offline
      await requestQueue.enqueue({
        url: '/api/meeting1',
        method: 'POST',
        data: { name: 'Meeting 1' },
        priority: 'high',
      });
      
      await requestQueue.enqueue({
        url: '/api/meeting2',
        method: 'POST',
        data: { name: 'Meeting 2' },
        priority: 'medium',
      });
      
      expect(requestQueue.getQueuedRequests()).toHaveLength(2);
      
      // Come back online
      Object.defineProperty(navigator, 'onLine', { value: true });
      window.dispatchEvent(new Event('online'));
      
      expect(offlineListener).toHaveBeenCalledWith(true);
      
      // Process queued requests
      await requestQueue.processQueue();
      
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      expect(requestQueue.getQueuedRequests()).toHaveLength(0);
    });
  });
});