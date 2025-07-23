import { useState, useEffect, useCallback } from 'react';
import { User, AuthState } from '@/types';
import { authAPI } from '@/lib/api';

interface UseAuthReturn extends AuthState {
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

export function useAuth(): UseAuthReturn {
  const [state, setState] = useState<AuthState>({
    user: null,
    isAuthenticated: false,
    isLoading: true,
  });

  const refreshUser = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, isLoading: true }));
      const response = await authAPI.me();
      const user = response.data;
      setState({
        user,
        isAuthenticated: true,
        isLoading: false,
      });
    } catch (error) {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
    }
  }, []);

  const login = useCallback(async () => {
    // Redirect to Microsoft SSO
    window.location.href = '/auth/microsoft/login';
  }, []);

  const logout = useCallback(async () => {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      setState({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      });
      window.location.href = '/login';
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  return {
    ...state,
    login,
    logout,
    refreshUser,
  };
}