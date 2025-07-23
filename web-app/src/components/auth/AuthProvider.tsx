'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { PublicClientApplication, AccountInfo } from '@microsoft/msal-browser';
import { MsalProvider, useMsal } from '@microsoft/msal-react';
import { api } from '@/lib/api';
import { apiConfig } from '@/config/api';
import { authConfig } from '@/config/auth';
import { notify } from '@/services/notificationService';

const msalConfig = {
  auth: {
    clientId: process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID || '',
    authority: `https://login.microsoftonline.com/${process.env.NEXT_PUBLIC_MICROSOFT_TENANT_ID || 'common'}`,
    redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || 'http://localhost:3000/auth/callback',
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

const msalInstance = new PublicClientApplication(msalConfig);

interface User {
  id: string;
  email: string;
  name: string;
  tenant_id: string;
  created_at: string;
  is_active: boolean;
}

interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  tokens: AuthTokens | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  loading: boolean;
  getAccessToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <MsalProvider instance={msalInstance}>
      <AuthProviderInner>{children}</AuthProviderInner>
    </MsalProvider>
  );
};

const AuthProviderInner: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [tokens, setTokens] = useState<AuthTokens | null>(null);
  const [loading, setLoading] = useState(true);
  const { instance, accounts } = useMsal();

  useEffect(() => {
    initializeAuth();
  }, []);

  const initializeAuth = async () => {
    try {
      // Check for stored tokens first
      const storedTokens = localStorage.getItem('auth_tokens');
      const storedUser = localStorage.getItem('auth_user');

      if (storedTokens && storedUser) {
        const parsedTokens = JSON.parse(storedTokens);
        const parsedUser = JSON.parse(storedUser);
        
        // Verify token is still valid
        if (await verifyToken(parsedTokens.access_token)) {
          setTokens(parsedTokens);
          setUser(parsedUser);
          setIsAuthenticated(true);
          setLoading(false);
          return;
        } else {
          // Try to refresh token
          const refreshed = await refreshTokenWithRefreshToken(parsedTokens.refresh_token);
          if (refreshed) {
            setLoading(false);
            return;
          }
        }
      }

      // Clear any stale data
      clearAuthData();
      setLoading(false);
    } catch (error) {
      notify.apiError(error, {
        action: 'auth_initialization',
        component: 'AuthProvider'
      });
      clearAuthData();
      setLoading(false);
    }
  };

  const verifyToken = async (accessToken: string): Promise<boolean> => {
    try {
      const response = await api.get('/auth/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.status === 200;
    } catch (error) {
      return false;
    }
  };

  const login = async () => {
    try {
      setLoading(true);
      
      // Get Microsoft tokens via MSAL
      const response = await instance.loginPopup({
        scopes: authConfig.microsoft.scopes,
      });

      if (!response.account || !response.idToken || !response.accessToken) {
        throw new Error('Failed to get Microsoft tokens');
      }

      // Exchange Microsoft tokens for JWT tokens from our backend
      const authResponse = await api.post('/auth/microsoft/token', {
        id_token: response.idToken,
        access_token: response.accessToken,
      });

      const { user: userData, tokens: tokenData } = authResponse.data;

      // Store authentication data
      setUser(userData);
      setTokens(tokenData);
      setIsAuthenticated(true);
      
      localStorage.setItem('auth_tokens', JSON.stringify(tokenData));
      localStorage.setItem('auth_user', JSON.stringify(userData));

    } catch (error) {
      notify.apiError(error, {
        action: 'microsoft_login',
        component: 'AuthProvider'
      });
      clearAuthData();
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Logout from backend (if we have a valid token)
      if (tokens?.access_token) {
        try {
          await api.post('/auth/logout', {}, {
            headers: {
              Authorization: `Bearer ${tokens.access_token}`,
            },
          });
        } catch (error) {
          console.warn('Backend logout failed:', error);
        }
      }

      // Logout from MSAL
      await instance.logoutPopup();
      
      // Clear local state and storage
      clearAuthData();
    } catch (error) {
      notify.apiError(error, {
        action: 'logout',
        component: 'AuthProvider',
        showNotification: false
      });
      // Always clear local data even if logout fails
      clearAuthData();
    }
  };

  const refreshTokenWithRefreshToken = async (refreshToken: string): Promise<boolean> => {
    try {
      const response = await api.post('/auth/refresh', {
        refresh_token: refreshToken,
      });

      const newTokens = response.data;
      setTokens(newTokens);
      localStorage.setItem('auth_tokens', JSON.stringify(newTokens));
      
      return true;
    } catch (error) {
      notify.apiError(error, {
        action: 'token_refresh',
        component: 'AuthProvider'
      });
      clearAuthData();
      return false;
    }
  };

  const refreshToken = async (): Promise<boolean> => {
    if (!tokens?.refresh_token) {
      return false;
    }
    return await refreshTokenWithRefreshToken(tokens.refresh_token);
  };

  const getAccessToken = (): string | null => {
    return tokens?.access_token || null;
  };

  const clearAuthData = () => {
    setIsAuthenticated(false);
    setUser(null);
    setTokens(null);
    localStorage.removeItem('auth_tokens');
    localStorage.removeItem('auth_user');
  };

  const value = {
    isAuthenticated,
    user,
    tokens,
    login,
    logout,
    refreshToken,
    loading,
    getAccessToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};