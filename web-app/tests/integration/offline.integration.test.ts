/**
 * Integration tests for offline functionality
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OfflineStatus } from '@/components/OfflineStatus';
import { offlineManager, requestQueue } from '@/lib/offline';

// Mock fetch for network simulation
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('Offline Functionality Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    
    // Reset network status
    Object.defineProperty(navigator, 'onLine', {
      writable: true,
      value: true,
    });
    
    // Clear request queue
    requestQueue.clear();
    
    // Mock fetch to succeed by default
    mockFetch.mockResolvedValue(new Response('{}', { status: 200 }));
  });

  afterEach(() => {
    // Clean up any timers
    jest.clearAllTimers();
  });

  it('should show offline status when network is down', async () => {
    render(<OfflineStatus />);
    
    // Initially online, component should not be visible
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
    
    // Simulate going offline
    Object.defineProperty(navigator, 'onLine', { value: false });
    window.dispatchEvent(new Event('offline'));
    
    // Wait for offline status to appear
    await waitFor(() => {
      expect(screen.getByText(/offline/i)).toBeInTheDocument();
    });
  });

  it('should queue requests when offline and process when online', async () => {
    const user = userEvent.setup();
    
    render(<OfflineStatus />);
    
    // Go offline
    Object.defineProperty(navigator, 'onLine', { value: false });
    window.dispatchEvent(new Event('offline'));
    
    // Queue some requests
    await requestQueue.enqueue({
      url: '/api/meetings',
      method: 'POST',
      data: { name: 'Test Meeting 1' },
      priority: 'high',
    });
    
    await requestQueue.enqueue({
      url: '/api/meetings',
      method: 'POST',
      data: { name: 'Test Meeting 2' },
      priority: 'medium',
    });
    
    // Wait for UI to show queued requests
    await waitFor(() => {
      expect(screen.getByText(/2 queued/i)).toBeInTheDocument();
    });
    
    // Expand to see queued operations
    const statusButton = screen.getByRole('button');
    await user.click(statusButton);
    
    await waitFor(() => {
      expect(screen.getByText(/queued operations/i)).toBeInTheDocument();
      expect(screen.getByText(/POST \/api\/meetings/i)).toBeInTheDocument();
    });
    
    // Come back online
    Object.defineProperty(navigator, 'onLine', { value: true });
    window.dispatchEvent(new Event('online'));
    
    // Process the queue
    await requestQueue.processQueue();
    
    // Wait for requests to be processed
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/queued/i)).not.toBeInTheDocument();
    });
    
    // Verify requests were made in priority order
    const calls = mockFetch.mock.calls;
    expect(calls[0][0]).toBe('/api/meetings');
    expect(calls[1][0]).toBe('/api/meetings');
  });

  it('should handle network connectivity changes', async () => {
    render(<OfflineStatus />);
    
    // Start online
    expect(screen.queryByText(/offline/i)).not.toBeInTheDocument();
    
    // Go offline
    Object.defineProperty(navigator, 'onLine', { value: false });
    window.dispatchEvent(new Event('offline'));
    
    await waitFor(() => {
      expect(screen.getByText(/offline/i)).toBeInTheDocument();
    });
    
    // Come back online
    Object.defineProperty(navigator, 'onLine', { value: true });
    window.dispatchEvent(new Event('online'));
    
    await waitFor(() => {
      expect(screen.getByText(/online/i)).toBeInTheDocument();
    });
  });

  it('should retry failed requests when coming online', async () => {
    render(<OfflineStatus />);
    
    // Start offline
    Object.defineProperty(navigator, 'onLine', { value: false });
    window.dispatchEvent(new Event('offline'));
    
    // Queue a request
    await requestQueue.enqueue({
      url: '/api/test',
      method: 'GET',
      priority: 'medium',
    });
    
    // Mock fetch to fail first, then succeed
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));
    
    // Come online
    Object.defineProperty(navigator, 'onLine', { value: true });
    window.dispatchEvent(new Event('online'));
    
    // Process queue (will fail first time)
    await requestQueue.processQueue();
    
    // Process queue again (should succeed)
    await requestQueue.processQueue();
    
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(requestQueue.getQueuedRequests()).toHaveLength(0);
    });
  });

  it('should handle queue cleanup for old requests', async () => {
    // Add an old request directly to the queue
    const oldRequest = {
      id: 'old-request',
      url: '/api/old',
      method: 'GET',
      timestamp: Date.now() - (25 * 60 * 60 * 1000), // 25 hours ago
      retryCount: 0,
      priority: 'low' as const,
    };
    
    // Access private queue for testing
    (requestQueue as any).queue.push(oldRequest);
    
    render(<OfflineStatus />);
    
    // Go offline to show status
    Object.defineProperty(navigator, 'onLine', { value: false });
    window.dispatchEvent(new Event('offline'));
    
    await waitFor(() => {
      expect(screen.getByText(/1 queued/i)).toBeInTheDocument();
    });
    
    // Clean up old requests
    await requestQueue.cleanupOldRequests();
    
    await waitFor(() => {
      expect(screen.queryByText(/queued/i)).not.toBeInTheDocument();
    });
  });

  it('should persist queue across page reloads', async () => {
    // Queue some requests
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
      priority: 'low',
    });
    
    // Verify requests are persisted in localStorage
    const stored = localStorage.getItem('offline_request_queue');
    expect(stored).toBeTruthy();
    
    const parsed = JSON.parse(stored!);
    expect(parsed).toHaveLength(2);
    
    // Create new queue instance (simulating page reload)
    const newQueue = new (requestQueue.constructor as any)();
    const reloadedRequests = newQueue.getQueuedRequests();
    
    expect(reloadedRequests).toHaveLength(2);
    expect(reloadedRequests[0].url).toBe('/api/meeting1');
    expect(reloadedRequests[1].url).toBe('/api/meeting2');
  });

  it('should show detailed queue information when expanded', async () => {
    const user = userEvent.setup();
    
    render(<OfflineStatus />);
    
    // Go offline
    Object.defineProperty(navigator, 'onLine', { value: false });
    window.dispatchEvent(new Event('offline'));
    
    // Queue multiple requests
    await requestQueue.enqueue({
      url: '/api/meeting1',
      method: 'POST',
      priority: 'high',
    });
    
    await requestQueue.enqueue({
      url: '/api/meeting2',
      method: 'PUT',
      priority: 'medium',
    });
    
    await requestQueue.enqueue({
      url: '/api/meeting3',
      method: 'DELETE',
      priority: 'low',
    });
    
    await requestQueue.enqueue({
      url: '/api/meeting4',
      method: 'GET',
      priority: 'high',
    });
    
    // Wait for status to show
    await waitFor(() => {
      expect(screen.getByText(/4 queued/i)).toBeInTheDocument();
    });
    
    // Click to expand
    const statusButton = screen.getByRole('button');
    await user.click(statusButton);
    
    // Should show first 3 requests + count of remaining
    await waitFor(() => {
      expect(screen.getByText(/queued operations/i)).toBeInTheDocument();
      
      // Check for specific operations (first 3)
      expect(screen.getByText(/POST \/api\/meeting1/i)).toBeInTheDocument();
      expect(screen.getByText(/PUT \/api\/meeting2/i)).toBeInTheDocument();
      expect(screen.getByText(/DELETE \/api\/meeting3/i)).toBeInTheDocument();
      
      // Should show "+1 more" for the 4th request
      expect(screen.getByText(/\+1 more/i)).toBeInTheDocument();
    });
  });
});