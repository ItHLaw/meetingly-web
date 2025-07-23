/**
 * @jest-environment jsdom
 */

import {
  categorizeError,
  formatErrorForUI,
  shouldRetryError,
  getRetryDelay,
  ErrorCategory,
  setupGlobalErrorHandling,
  logError,
  withErrorHandling,
} from '../errorHandling';

describe('Error Handling Library', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    console.error = jest.fn();
    console.warn = jest.fn();
  });

  describe('categorizeError', () => {
    it('should categorize network errors', () => {
      const networkError = new Error('Network Error');
      
      const category = categorizeError(networkError);
      
      expect(category).toBe(ErrorCategory.NETWORK);
    });

    it('should categorize authentication errors (401)', () => {
      const authError = {
        response: { status: 401 },
      };
      
      const category = categorizeError(authError);
      
      expect(category).toBe(ErrorCategory.AUTHENTICATION);
    });

    it('should categorize authorization errors (403)', () => {
      const authzError = {
        response: { status: 403 },
      };
      
      const category = categorizeError(authzError);
      
      expect(category).toBe(ErrorCategory.AUTHORIZATION);
    });

    it('should categorize validation errors (400, 422)', () => {
      const validationError400 = {
        response: { status: 400 },
      };
      const validationError422 = {
        response: { status: 422 },
      };
      
      expect(categorizeError(validationError400)).toBe(ErrorCategory.VALIDATION);
      expect(categorizeError(validationError422)).toBe(ErrorCategory.VALIDATION);
    });

    it('should categorize server errors (5xx)', () => {
      const serverError = {
        response: { status: 500 },
      };
      
      const category = categorizeError(serverError);
      
      expect(category).toBe(ErrorCategory.SERVER);
    });

    it('should categorize unknown errors', () => {
      const unknownError = {
        response: { status: 999 },
      };
      
      const category = categorizeError(unknownError);
      
      expect(category).toBe(ErrorCategory.UNKNOWN);
    });
  });

  describe('formatErrorForUI', () => {
    it('should format network errors for UI', () => {
      const networkError = new Error('Network Error');
      
      const uiError = formatErrorForUI(networkError);
      
      expect(uiError).toEqual({
        title: 'Connection Error',
        message: 'Unable to connect to the server. Please check your internet connection and try again.',
        type: 'error',
        retryable: true,
        duration: 5000,
      });
    });

    it('should format authentication errors for UI', () => {
      const authError = {
        response: { status: 401 },
      };
      
      const uiError = formatErrorForUI(authError);
      
      expect(uiError).toEqual({
        title: 'Authentication Required',
        message: 'Your session has expired. Please log in again.',
        type: 'warning',
        retryable: false,
        duration: 0,
      });
    });

    it('should format validation errors with custom message', () => {
      const validationError = {
        response: {
          status: 400,
          data: {
            message: 'Invalid email format',
          },
        },
      };
      
      const uiError = formatErrorForUI(validationError);
      
      expect(uiError).toEqual({
        title: 'Invalid Input',
        message: 'Invalid email format',
        type: 'warning',
        retryable: true,
        duration: 6000,
      });
    });
  });

  describe('shouldRetryError', () => {
    it('should allow retry for network errors', () => {
      const networkError = new Error('Network Error');
      
      expect(shouldRetryError(networkError)).toBe(true);
    });

    it('should allow retry for server errors', () => {
      const serverError = {
        response: { status: 500 },
      };
      
      expect(shouldRetryError(serverError)).toBe(true);
    });

    it('should allow retry for rate limiting (429)', () => {
      const rateLimitError = {
        response: { status: 429 },
      };
      
      expect(shouldRetryError(rateLimitError)).toBe(true);
    });

    it('should not allow retry for authentication errors', () => {
      const authError = {
        response: { status: 401 },
      };
      
      expect(shouldRetryError(authError)).toBe(false);
    });

    it('should not allow retry for validation errors', () => {
      const validationError = {
        response: { status: 400 },
      };
      
      expect(shouldRetryError(validationError)).toBe(false);
    });
  });

  describe('getRetryDelay', () => {
    it('should calculate exponential backoff for network errors', () => {
      const networkError = new Error('Network Error');
      
      const delay1 = getRetryDelay(networkError, 1);
      const delay2 = getRetryDelay(networkError, 2);
      const delay3 = getRetryDelay(networkError, 3);
      
      expect(delay1).toBe(1000); // 1s
      expect(delay2).toBe(2000); // 2s
      expect(delay3).toBe(4000); // 4s
    });

    it('should cap delay at maximum for network errors', () => {
      const networkError = new Error('Network Error');
      
      const delay = getRetryDelay(networkError, 10);
      
      expect(delay).toBe(10000); // Max 10s
    });

    it('should use slower backoff for server errors', () => {
      const serverError = {
        response: { status: 500 },
      };
      
      const delay1 = getRetryDelay(serverError, 1);
      const delay2 = getRetryDelay(serverError, 2);
      
      expect(delay1).toBe(1000); // 1s
      expect(delay2).toBe(1500); // 1.5s
    });
  });

  describe('logError', () => {
    it('should log error with context in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      
      const consoleSpy = jest.spyOn(console, 'error');
      const consoleGroupSpy = jest.spyOn(console, 'group');
      const consoleGroupEndSpy = jest.spyOn(console, 'groupEnd');
      
      const error = new Error('Test error');
      const context = { component: 'TestComponent', action: 'test_action' };
      
      const result = logError(error, context);
      
      expect(consoleGroupSpy).toHaveBeenCalledWith('🚨 Error Details');
      expect(consoleSpy).toHaveBeenCalledWith('Error:', error);
      expect(consoleGroupEndSpy).toHaveBeenCalled();
      
      expect(result).toMatchObject({
        error: {
          message: 'Test error',
          name: 'Error',
        },
        context,
      });
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should include API error details when available', () => {
      const apiError = {
        message: 'API Error',
        response: {
          status: 400,
          statusText: 'Bad Request',
          data: { detail: 'Invalid input' },
        },
        config: {
          url: '/api/test',
          method: 'POST',
        },
      };
      
      const result = logError(apiError);
      
      expect(result.apiError).toMatchObject({
        status: 400,
        statusText: 'Bad Request',
        data: { detail: 'Invalid input' },
        url: '/api/test',
        method: 'POST',
      });
    });
  });

  describe('withErrorHandling', () => {
    it('should wrap async function with error handling', async () => {
      const mockFn = jest.fn().mockResolvedValue('success');
      const context = { component: 'TestComponent' };
      
      const wrappedFn = withErrorHandling(mockFn, context);
      
      const result = await wrappedFn('arg1', 'arg2');
      
      expect(result).toBe('success');
      expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2');
    });

    it('should log errors and re-throw', async () => {
      const error = new Error('Test error');
      const mockFn = jest.fn().mockRejectedValue(error);
      const context = { component: 'TestComponent' };
      
      const wrappedFn = withErrorHandling(mockFn, context);
      
      await expect(wrappedFn()).rejects.toThrow('Test error');
    });
  });

  describe('setupGlobalErrorHandling', () => {
    it('should set up global error handlers in browser environment', () => {
      const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
      
      setupGlobalErrorHandling();
      
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'unhandledrejection',
        expect.any(Function)
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        'error',
        expect.any(Function)
      );
    });

    it('should handle unhandled promise rejections', () => {
      const mockEvent = {
        reason: new Error('Unhandled promise rejection'),
        preventDefault: jest.fn(),
      };
      
      setupGlobalErrorHandling();
      
      // Simulate unhandled promise rejection
      const handler = window.addEventListener.mock.calls.find(
        call => call[0] === 'unhandledrejection'
      )[1];
      
      handler(mockEvent);
      
      expect(mockEvent.preventDefault).toHaveBeenCalled();
    });

    it('should handle uncaught errors', () => {
      const mockEvent = {
        error: new Error('Uncaught error'),
        filename: 'test.js',
        lineno: 10,
        colno: 5,
      };
      
      setupGlobalErrorHandling();
      
      // Simulate uncaught error
      const handler = window.addEventListener.mock.calls.find(
        call => call[0] === 'error'
      )[1];
      
      handler(mockEvent);
      
      // Error should be logged (tested in logError tests)
    });
  });
});

// Integration tests
describe('Error Handling Integration', () => {
  it('should handle complete error flow', () => {
    const apiError = {
      response: { status: 500, data: { message: 'Server error' } },
    };
    
    // Categorize error
    const category = categorizeError(apiError);
    expect(category).toBe(ErrorCategory.SERVER);
    
    // Format for UI
    const uiError = formatErrorForUI(apiError);
    expect(uiError.retryable).toBe(true);
    
    // Check if should retry
    const shouldRetry = shouldRetryError(apiError);
    expect(shouldRetry).toBe(true);
    
    // Calculate retry delay
    const delay = getRetryDelay(apiError, 1);
    expect(delay).toBeGreaterThan(0);
  });
});