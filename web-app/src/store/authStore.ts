import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import { User, AuthState } from '@/types';
import { authService } from '@/services/authService';

interface AuthStore extends AuthState {
  // Actions
  setUser: (user: User | null) => void;
  setAuthenticated: (isAuthenticated: boolean) => void;
  setLoading: (isLoading: boolean) => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  reset: () => void;
}

const initialState: AuthState = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
};

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      (set, get) => ({
        ...initialState,

        // Actions
        setUser: (user) => {
          set(
            { 
              user, 
              isAuthenticated: user !== null,
              isLoading: false 
            },
            false,
            'auth/setUser'
          );
        },

        setAuthenticated: (isAuthenticated) => {
          set({ isAuthenticated }, false, 'auth/setAuthenticated');
        },

        setLoading: (isLoading) => {
          set({ isLoading }, false, 'auth/setLoading');
        },

        login: async () => {
          try {
            set({ isLoading: true }, false, 'auth/loginStart');
            authService.initiateLogin();
          } catch (error) {
            console.error('Login failed:', error);
            set({ isLoading: false }, false, 'auth/loginError');
            throw error;
          }
        },

        logout: async () => {
          try {
            set({ isLoading: true }, false, 'auth/logoutStart');
            await authService.logout();
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
            }, false, 'auth/logoutSuccess');
          } catch (error) {
            console.error('Logout failed:', error);
            // Still clear the state even if logout API fails
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
            }, false, 'auth/logoutError');
          }
        },

        refreshUser: async () => {
          try {
            set({ isLoading: true }, false, 'auth/refreshStart');
            const user = await authService.getCurrentUser();
            
            if (user) {
              set({
                user,
                isAuthenticated: true,
                isLoading: false,
              }, false, 'auth/refreshSuccess');
            } else {
              set({
                user: null,
                isAuthenticated: false,
                isLoading: false,
              }, false, 'auth/refreshNoUser');
            }
          } catch (error) {
            console.error('Refresh user failed:', error);
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
            }, false, 'auth/refreshError');
          }
        },

        reset: () => {
          set(initialState, false, 'auth/reset');
        },
      }),
      {
        name: 'auth-store',
        // Only persist user data, not loading states
        partialize: (state) => ({
          user: state.user,
          isAuthenticated: state.isAuthenticated,
        }),
      }
    ),
    { name: 'AuthStore' }
  )
);