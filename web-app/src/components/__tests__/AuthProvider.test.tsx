/**
 * @jest-environment jsdom
 */

import React from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import { PublicClientApplication } from '@microsoft/msal-browser';
import { api } from '@/lib/api';

// Mock MSAL
jest.mock('@microsoft/msal-browser');
jest.mock('@microsoft/msal-react', () => ({
  MsalProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  useMsal: () => ({
    instance: mockMsalInstance,
    accounts: [],
  }),
}));

// Mock API
jest.mock('@/lib/api');

// Mock notification service
jest.mock('@/services/notificationService', () => ({
  notify: {
    apiError: jest.fn(),
  },
}));

// Mock environment variables
const originalEnv = process.env;
beforeEach(() => {
  jest.resetModules();
  process.env = {
    ...originalEnv,
    NEXT_PUBLIC_MICROSOFT_CLIENT_ID: 'test-client-id',
    NEXT_PUBLIC_MICROSOFT_TENANT_ID: 'test-tenant-id',
    NEXT_PUBLIC_REDIRECT_URI: 'http://localhost:3000/auth/callback',
  };
});

afterEach(() => {
  process.env = originalEnv;
});

const mockMsalInstance = {
  loginPopup: jest.fn(),
  logoutPopup: jest.fn(),
};

const mockApi = api as jest.Mocked<typeof api>;

// Test component that uses auth
const TestComponent = () => {
  const auth = useAuth();
  
  return (
    <div>
      <div data-testid="loading">{auth.loading.toString()}</div>
      <div data-testid="authenticated">{auth.isAuthenticated.toString()}</div>
      <div data-testid="user">{auth.user?.email || 'none'}</div>
      <button onClick={() => auth.login()} data-testid="login">Login</button>
      <button onClick={() => auth.logout()} data-testid="logout">Logout</button>
    </div>
  );
};

describe('AuthProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    (PublicClientApplication as jest.Mock).mockImplementation(() => mockMsalInstance);
  });

  it('should render children and provide auth context', () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('loading')).toBeInTheDocument();
    expect(screen.getByTestId('authenticated')).toBeInTheDocument();
    expect(screen.getByTestId('user')).toBeInTheDocument();
  });

  it('should initialize with loading state', () => {
    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    expect(screen.getByTestId('loading')).toHaveTextContent('true');
    expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    expect(screen.getByTestId('user')).toHaveTextContent('none');
  });

  it('should restore authentication from localStorage', async () => {
    const mockTokens = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
    };

    const mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      tenant_id: 'test-tenant',
      created_at: '2023-01-01T00:00:00Z',
      is_active: true,
    };

    localStorage.setItem('auth_tokens', JSON.stringify(mockTokens));
    localStorage.setItem('auth_user', JSON.stringify(mockUser));

    mockApi.get.mockResolvedValueOnce({ status: 200 });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
  });

  it('should handle login flow successfully', async () => {
    const mockMsalResponse = {
      account: { homeAccountId: 'test-account' },
      idToken: 'test-id-token',
      accessToken: 'test-ms-access-token',
    };

    const mockAuthResponse = {
      data: {
        user: {
          id: 'test-user-id',
          email: 'test@example.com',
          name: 'Test User',
          tenant_id: 'test-tenant',
          created_at: '2023-01-01T00:00:00Z',
          is_active: true,
        },
        tokens: {
          access_token: 'jwt-access-token',
          refresh_token: 'jwt-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
        },
      },
    };

    mockMsalInstance.loginPopup.mockResolvedValueOnce(mockMsalResponse);
    mockApi.post.mockResolvedValueOnce(mockAuthResponse);

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for initial loading to complete
    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    const loginButton = screen.getByTestId('login');
    
    await act(async () => {
      loginButton.click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    });

    expect(screen.getByTestId('user')).toHaveTextContent('test@example.com');
    expect(mockMsalInstance.loginPopup).toHaveBeenCalledWith({
      scopes: expect.any(Array),
    });
    expect(mockApi.post).toHaveBeenCalledWith('/auth/microsoft/token', {
      id_token: 'test-id-token',
      access_token: 'test-ms-access-token',
    });
  });

  it('should handle logout flow successfully', async () => {
    const mockTokens = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
    };

    const mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      tenant_id: 'test-tenant',
      created_at: '2023-01-01T00:00:00Z',
      is_active: true,
    };

    localStorage.setItem('auth_tokens', JSON.stringify(mockTokens));
    localStorage.setItem('auth_user', JSON.stringify(mockUser));

    mockApi.get.mockResolvedValueOnce({ status: 200 });
    mockApi.post.mockResolvedValueOnce({ status: 200 });
    mockMsalInstance.logoutPopup.mockResolvedValueOnce({});

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    // Wait for authentication to be restored
    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('true');
    });

    const logoutButton = screen.getByTestId('logout');
    
    await act(async () => {
      logoutButton.click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('authenticated')).toHaveTextContent('false');
    });

    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(mockApi.post).toHaveBeenCalledWith(
      '/auth/logout',
      {},
      {
        headers: {
          Authorization: 'Bearer test-access-token',
        },
      }
    );
    expect(mockMsalInstance.logoutPopup).toHaveBeenCalled();
  });

  it('should handle token refresh', async () => {
    const mockTokens = {
      access_token: 'expired-token',
      refresh_token: 'test-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
    };

    const mockUser = {
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      tenant_id: 'test-tenant',
      created_at: '2023-01-01T00:00:00Z',
      is_active: true,
    };

    const newTokens = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
    };

    localStorage.setItem('auth_tokens', JSON.stringify(mockTokens));
    localStorage.setItem('auth_user', JSON.stringify(mockUser));

    // First call fails (expired token), second call succeeds (refresh)
    mockApi.get.mockRejectedValueOnce(new Error('Unauthorized'));
    mockApi.post.mockResolvedValueOnce({ data: newTokens });

    render(
      <AuthProvider>
        <TestComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('loading')).toHaveTextContent('false');
    });

    expect(mockApi.post).toHaveBeenCalledWith('/auth/refresh', {
      refresh_token: 'test-refresh-token',
    });
  });

  it('should provide getAccessToken method', async () => {
    const mockTokens = {
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
    };

    localStorage.setItem('auth_tokens', JSON.stringify(mockTokens));
    localStorage.setItem('auth_user', JSON.stringify({
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      tenant_id: 'test-tenant',
      created_at: '2023-01-01T00:00:00Z',
      is_active: true,
    }));

    mockApi.get.mockResolvedValueOnce({ status: 200 });

    let getAccessToken: () => string | null;

    const TestTokenComponent = () => {
      const auth = useAuth();
      getAccessToken = auth.getAccessToken;
      return <div>Test</div>;
    };

    render(
      <AuthProvider>
        <TestTokenComponent />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(getAccessToken!()).toBe('test-access-token');
    });
  });

  it('should throw error when useAuth is used outside AuthProvider', () => {
    const TestErrorComponent = () => {
      useAuth();
      return <div>Test</div>;
    };

    expect(() => {
      render(<TestErrorComponent />);
    }).toThrow('useAuth must be used within an AuthProvider');
  });
});