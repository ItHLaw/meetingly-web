/**
 * Performance monitoring and metrics collection
 */

interface PerformanceMetric {
  name: string;
  value: number;
  timestamp: number;
  tags?: Record<string, string>;
  unit?: string;
}

interface PerformanceTiming {
  name: string;
  start: number;
  end?: number;
  duration?: number;
  tags?: Record<string, string>;
}

interface WebVitalsMetric {
  name: 'CLS' | 'FID' | 'FCP' | 'LCP' | 'TTFB' | 'INP';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  timestamp: number;
  id: string;
  navigationType: string;
}

class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private timings: Map<string, PerformanceTiming> = new Map();
  private observers: Map<string, PerformanceObserver> = new Map();
  private isEnabled: boolean = true;
  private batchSize: number = 50;
  private flushInterval: number = 30000; // 30 seconds
  private endpoint: string = '/api/metrics';

  constructor() {
    this.setupWebVitals();
    this.setupResourceObserver();
    this.setupNavigationObserver();
    this.setupLongTaskObserver();
    this.setupMemoryMonitoring();
    this.startBatchFlush();
  }

  /**
   * Record a custom metric
   */
  recordMetric(name: string, value: number, tags?: Record<string, string>, unit?: string): void {
    if (!this.isEnabled) return;

    const metric: PerformanceMetric = {
      name,
      value,
      timestamp: Date.now(),
      tags,
      unit,
    };

    this.metrics.push(metric);
    this.checkFlush();
  }

  /**
   * Start timing an operation
   */
  startTiming(name: string, tags?: Record<string, string>): void {
    if (!this.isEnabled) return;

    const timing: PerformanceTiming = {
      name,
      start: performance.now(),
      tags,
    };

    this.timings.set(name, timing);
  }

  /**
   * End timing an operation
   */
  endTiming(name: string): number | null {
    if (!this.isEnabled) return null;

    const timing = this.timings.get(name);
    if (!timing) {
      console.warn(`No timing found for: ${name}`);
      return null;
    }

    timing.end = performance.now();
    timing.duration = timing.end - timing.start;

    // Record as metric
    this.recordMetric(
      `timing.${name}`,
      timing.duration,
      timing.tags,
      'ms'
    );

    this.timings.delete(name);
    return timing.duration;
  }

  /**
   * Time a function execution
   */
  timeFunction<T>(name: string, fn: () => T, tags?: Record<string, string>): T {
    this.startTiming(name, tags);
    try {
      const result = fn();
      this.endTiming(name);
      return result;
    } catch (error) {
      this.endTiming(name);
      throw error;
    }
  }

  /**
   * Time an async function execution
   */
  async timeAsyncFunction<T>(
    name: string,
    fn: () => Promise<T>,
    tags?: Record<string, string>
  ): Promise<T> {
    this.startTiming(name, tags);
    try {
      const result = await fn();
      this.endTiming(name);
      return result;
    } catch (error) {
      this.endTiming(name);
      throw error;
    }
  }

  /**
   * Record API call metrics
   */
  recordApiCall(
    method: string,
    url: string,
    duration: number,
    status: number,
    size?: number
  ): void {
    const tags = {
      method,
      endpoint: this.sanitizeUrl(url),
      status: status.toString(),
      status_class: this.getStatusClass(status),
    };

    this.recordMetric('api.request.duration', duration, tags, 'ms');
    this.recordMetric('api.request.count', 1, tags);

    if (size !== undefined) {
      this.recordMetric('api.response.size', size, tags, 'bytes');
    }
  }

  /**
   * Record page load metrics
   */
  recordPageLoad(route: string): void {
    if (!window.performance?.timing) return;

    const timing = window.performance.timing;
    const navigationStart = timing.navigationStart;

    const metrics = {
      'page.load.dns': timing.domainLookupEnd - timing.domainLookupStart,
      'page.load.tcp': timing.connectEnd - timing.connectStart,
      'page.load.request': timing.responseStart - timing.requestStart,
      'page.load.response': timing.responseEnd - timing.responseStart,
      'page.load.dom_processing': timing.domComplete - timing.domLoading,
      'page.load.total': timing.loadEventEnd - navigationStart,
    };

    const tags = { route: this.sanitizeRoute(route) };

    Object.entries(metrics).forEach(([name, value]) => {
      if (value > 0) {
        this.recordMetric(name, value, tags, 'ms');
      }
    });
  }

  /**
   * Record user interaction metrics
   */
  recordUserInteraction(
    type: 'click' | 'scroll' | 'input' | 'navigation',
    target: string,
    duration?: number
  ): void {
    const tags = { type, target };
    
    this.recordMetric('user.interaction.count', 1, tags);
    
    if (duration !== undefined) {
      this.recordMetric('user.interaction.duration', duration, tags, 'ms');
    }
  }

  /**
   * Record error metrics
   */
  recordError(
    type: 'javascript' | 'network' | 'api' | 'unhandled',
    message: string,
    stack?: string
  ): void {
    const tags = {
      type,
      error_message: this.sanitizeErrorMessage(message),
    };

    this.recordMetric('error.count', 1, tags);

    // Log additional context for debugging
    if (process.env.NODE_ENV === 'development') {
      console.error('Performance Monitor - Error recorded:', {
        type,
        message,
        stack,
        timestamp: new Date().toISOString(),
      });
    }
  }

  /**
   * Setup Web Vitals monitoring
   */
  private setupWebVitals(): void {
    // Dynamic import to avoid SSR issues
    import('web-vitals').then(({ getCLS, getFID, getFCP, getLCP, getTTFB, onINP }) => {
      getCLS(this.onWebVital.bind(this));
      getFID(this.onWebVital.bind(this));
      getFCP(this.onWebVital.bind(this));
      getLCP(this.onWebVital.bind(this));
      getTTFB(this.onWebVital.bind(this));
      
      // INP is newer, may not be available
      if (onINP) {
        onINP(this.onWebVital.bind(this));
      }
    }).catch(error => {
      console.warn('Web Vitals not available:', error);
    });
  }

  /**
   * Handle Web Vitals metrics
   */
  private onWebVital(metric: WebVitalsMetric): void {
    const tags = {
      rating: metric.rating,
      navigation_type: metric.navigationType,
    };

    this.recordMetric(`web_vitals.${metric.name.toLowerCase()}`, metric.value, tags, 'ms');
  }

  /**
   * Setup resource performance observer
   */
  private setupResourceObserver(): void {
    if (!window.PerformanceObserver) return;

    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'resource') {
            this.recordResourceMetric(entry as PerformanceResourceTiming);
          }
        });
      });

      observer.observe({ entryTypes: ['resource'] });
      this.observers.set('resource', observer);
    } catch (error) {
      console.warn('Resource observer setup failed:', error);
    }
  }

  /**
   * Setup navigation performance observer
   */
  private setupNavigationObserver(): void {
    if (!window.PerformanceObserver) return;

    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'navigation') {
            this.recordNavigationMetric(entry as PerformanceNavigationTiming);
          }
        });
      });

      observer.observe({ entryTypes: ['navigation'] });
      this.observers.set('navigation', observer);
    } catch (error) {
      console.warn('Navigation observer setup failed:', error);
    }
  }

  /**
   * Setup long task observer
   */
  private setupLongTaskObserver(): void {
    if (!window.PerformanceObserver) return;

    try {
      const observer = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.entryType === 'longtask') {
            this.recordMetric('performance.long_task.duration', entry.duration, {
              attribution: 'unknown'
            }, 'ms');
          }
        });
      });

      observer.observe({ entryTypes: ['longtask'] });
      this.observers.set('longtask', observer);
    } catch (error) {
      console.warn('Long task observer setup failed:', error);
    }
  }

  /**
   * Setup memory monitoring
   */
  private setupMemoryMonitoring(): void {
    // Monitor memory usage periodically
    setInterval(() => {
      if ((performance as any).memory) {
        const memory = (performance as any).memory;
        this.recordMetric('memory.used', memory.usedJSHeapSize, undefined, 'bytes');
        this.recordMetric('memory.total', memory.totalJSHeapSize, undefined, 'bytes');
        this.recordMetric('memory.limit', memory.jsHeapSizeLimit, undefined, 'bytes');
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Record resource timing metrics
   */
  private recordResourceMetric(entry: PerformanceResourceTiming): void {
    const url = new URL(entry.name);
    const resourceType = this.getResourceType(entry);
    
    const tags = {
      resource_type: resourceType,
      domain: url.hostname,
    };

    this.recordMetric('resource.duration', entry.duration, tags, 'ms');
    this.recordMetric('resource.size', entry.transferSize || 0, tags, 'bytes');
    
    if (entry.responseStart > 0) {
      this.recordMetric('resource.time_to_first_byte', 
        entry.responseStart - entry.requestStart, tags, 'ms');
    }
  }

  /**
   * Record navigation timing metrics
   */
  private recordNavigationMetric(entry: PerformanceNavigationTiming): void {
    const metrics = {
      'navigation.dns_lookup': entry.domainLookupEnd - entry.domainLookupStart,
      'navigation.tcp_connect': entry.connectEnd - entry.connectStart,
      'navigation.tls_handshake': entry.connectEnd - entry.secureConnectionStart,
      'navigation.request': entry.responseStart - entry.requestStart,
      'navigation.response': entry.responseEnd - entry.responseStart,
      'navigation.dom_processing': entry.domComplete - entry.domLoading,
      'navigation.load_complete': entry.loadEventEnd - entry.loadEventStart,
    };

    Object.entries(metrics).forEach(([name, value]) => {
      if (value > 0) {
        this.recordMetric(name, value, undefined, 'ms');
      }
    });
  }

  /**
   * Start batch flushing
   */
  private startBatchFlush(): void {
    setInterval(() => {
      this.flush();
    }, this.flushInterval);

    // Flush on page unload
    window.addEventListener('beforeunload', () => {
      this.flush();
    });
  }

  /**
   * Check if we should flush metrics
   */
  private checkFlush(): void {
    if (this.metrics.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Flush metrics to server
   */
  private async flush(): Promise<void> {
    if (this.metrics.length === 0) return;

    const metricsToFlush = this.metrics.splice(0);
    
    try {
      await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metrics: metricsToFlush,
          timestamp: Date.now(),
          session_id: this.getSessionId(),
          page_url: window.location.href,
          user_agent: navigator.userAgent,
        }),
      });
    } catch (error) {
      console.warn('Failed to flush performance metrics:', error);
      // Re-add metrics to queue for retry
      this.metrics.unshift(...metricsToFlush);
    }
  }

  /**
   * Utility methods
   */
  private sanitizeUrl(url: string): string {
    try {
      const urlObj = new URL(url);
      return urlObj.pathname;
    } catch {
      return url;
    }
  }

  private sanitizeRoute(route: string): string {
    // Remove dynamic segments
    return route.replace(/\/[0-9a-f-]{36}/gi, '/[id]');
  }

  private sanitizeErrorMessage(message: string): string {
    // Truncate long error messages
    return message.length > 100 ? message.substring(0, 100) + '...' : message;
  }

  private getStatusClass(status: number): string {
    if (status >= 200 && status < 300) return '2xx';
    if (status >= 300 && status < 400) return '3xx';
    if (status >= 400 && status < 500) return '4xx';
    if (status >= 500) return '5xx';
    return 'unknown';
  }

  private getResourceType(entry: PerformanceResourceTiming): string {
    const initiatorType = entry.initiatorType;
    if (initiatorType) return initiatorType;

    const url = entry.name.toLowerCase();
    if (url.includes('.js')) return 'script';
    if (url.includes('.css')) return 'stylesheet';
    if (url.match(/\.(png|jpg|jpeg|gif|svg|webp)$/)) return 'image';
    if (url.match(/\.(woff|woff2|ttf|eot)$/)) return 'font';
    if (url.includes('/api/')) return 'xhr';
    
    return 'other';
  }

  private getSessionId(): string {
    let sessionId = sessionStorage.getItem('performance_session_id');
    if (!sessionId) {
      sessionId = Math.random().toString(36).substring(2, 15);
      sessionStorage.setItem('performance_session_id', sessionId);
    }
    return sessionId;
  }

  /**
   * Disable performance monitoring
   */
  disable(): void {
    this.isEnabled = false;
    this.observers.forEach(observer => observer.disconnect());
    this.observers.clear();
  }

  /**
   * Enable performance monitoring
   */
  enable(): void {
    this.isEnabled = true;
  }

  /**
   * Get current metrics (for debugging)
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }
}

// Create singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Export types
export type { PerformanceMetric, PerformanceTiming, WebVitalsMetric };