/**
 * Integration tests for authentication flow
 */

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AuthProvider } from '@/components/auth/AuthProvider';
import { LoginPage } from '@/app/login/page';

// Mock the Microsoft MSAL library
jest.mock('@microsoft/msal-browser', () => ({
  PublicClientApplication: jest.fn().mockImplementation(() => ({
    loginPopup: jest.fn().mockResolvedValue({
      account: {
        username: 'test@example.com',
        name: 'Test User',
      },
      idToken: 'mock-id-token',
      accessToken: 'mock-access-token',
    }),
    logoutPopup: jest.fn().mockResolvedValue(undefined),
    getAllAccounts: jest.fn().mockReturnValue([]),
  })),
}));

// Mock the API calls
const mockApiCall = jest.fn();
jest.mock('@/lib/api', () => ({
  api: {
    post: mockApiCall,
    get: mockApiCall,
  },
}));

describe('Authentication Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should complete full authentication flow', async () => {
    const user = userEvent.setup();
    
    // Mock successful API response
    mockApiCall.mockResolvedValue({
      data: {
        access_token: 'jwt-access-token',
        refresh_token: 'jwt-refresh-token',
        token_type: 'bearer',
        expires_in: 86400,
        user: {
          id: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          tenant_id: 'tenant-123',
          created_at: '2025-01-15T10:00:00Z',
          is_active: true,
        },
      },
    });

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    // Find and click the login button
    const loginButton = screen.getByRole('button', { name: /sign in with microsoft/i });
    expect(loginButton).toBeInTheDocument();

    await user.click(loginButton);

    // Wait for authentication to complete
    await waitFor(() => {
      expect(mockApiCall).toHaveBeenCalledWith('/auth/microsoft/token', {
        id_token: 'mock-id-token',
        access_token: 'mock-access-token',
      });
    });

    // Verify tokens are stored
    expect(localStorage.getItem('auth_tokens')).toBeTruthy();
    expect(localStorage.getItem('auth_user')).toBeTruthy();
  });

  it('should handle authentication errors gracefully', async () => {
    const user = userEvent.setup();
    
    // Mock API error
    mockApiCall.mockRejectedValue({
      response: {
        status: 401,
        data: { detail: 'Invalid token' },
      },
    });

    render(
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    );

    const loginButton = screen.getByRole('button', { name: /sign in with microsoft/i });
    await user.click(loginButton);

    // Wait for error handling
    await waitFor(() => {
      // Should show error notification (mocked)
      expect(mockApiCall).toHaveBeenCalled();
    });

    // Verify no tokens are stored on error
    expect(localStorage.getItem('auth_tokens')).toBeNull();
  });

  it('should handle token refresh', async () => {
    // Set up existing tokens
    const existingTokens = {
      access_token: 'old-access-token',
      refresh_token: 'refresh-token',
      token_type: 'bearer',
      expires_in: 86400,
    };
    
    localStorage.setItem('auth_tokens', JSON.stringify(existingTokens));
    localStorage.setItem('auth_user', JSON.stringify({
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
    }));

    // Mock token verification failure and successful refresh
    mockApiCall
      .mockRejectedValueOnce({ response: { status: 401 } }) // Verification fails
      .mockResolvedValueOnce({ // Refresh succeeds
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          token_type: 'bearer',
          expires_in: 86400,
        },
      });

    render(
      <AuthProvider>
        <div>Test App</div>
      </AuthProvider>
    );

    // Wait for token refresh to complete
    await waitFor(() => {
      expect(mockApiCall).toHaveBeenCalledWith('/auth/refresh', {
        refresh_token: 'refresh-token',
      });
    });

    // Verify new tokens are stored
    const storedTokens = JSON.parse(localStorage.getItem('auth_tokens') || '{}');
    expect(storedTokens.access_token).toBe('new-access-token');
  });

  it('should clear auth data on logout', async () => {
    // Set up authenticated state
    localStorage.setItem('auth_tokens', JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
    }));
    localStorage.setItem('auth_user', JSON.stringify({
      id: 'user-123',
      name: 'Test User',
    }));

    const TestComponent = () => {
      const { logout } = useAuth();
      return <button onClick={logout}>Logout</button>;
    };

    const user = userEvent.setup();
    
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    const logoutButton = screen.getByRole('button', { name: /logout/i });
    await user.click(logoutButton);

    // Wait for logout to complete
    await waitFor(() => {
      expect(localStorage.getItem('auth_tokens')).toBeNull();
      expect(localStorage.getItem('auth_user')).toBeNull();
    });
  });
});