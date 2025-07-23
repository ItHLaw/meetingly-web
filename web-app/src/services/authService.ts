import { User, AuthState } from '@/types';
import { authAPI } from '@/lib/api';

class AuthService {
  private static instance: AuthService;
  private currentUser: User | null = null;

  private constructor() {}

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async getCurrentUser(): Promise<User | null> {
    if (this.currentUser) {
      return this.currentUser;
    }

    try {
      const response = await authAPI.me();
      this.currentUser = response.data;
      return this.currentUser;
    } catch (error) {
      console.error('Failed to get current user:', error);
      return null;
    }
  }

  async logout(): Promise<void> {
    try {
      await authAPI.logout();
    } catch (error) {
      console.error('Logout API call failed:', error);
    } finally {
      this.currentUser = null;
      // Clear any stored auth data
      if (typeof window !== 'undefined') {
        localStorage.removeItem('auth_tokens');
        localStorage.removeItem('auth_user');
      }
    }
  }

  isAuthenticated(): boolean {
    return this.currentUser !== null;
  }

  getUser(): User | null {
    return this.currentUser;
  }

  setUser(user: User | null): void {
    this.currentUser = user;
  }

  async refreshUserData(): Promise<User | null> {
    this.currentUser = null; // Force refresh
    return this.getCurrentUser();
  }

  // Microsoft SSO integration
  initiateLogin(): void {
    if (typeof window !== 'undefined') {
      window.location.href = '/auth/microsoft/login';
    }
  }

  // Handle login callback
  async handleLoginCallback(code: string, state?: string): Promise<User> {
    try {
      // This would typically be handled by the backend
      // The frontend just redirects to the callback URL
      throw new Error('Login callback should be handled by backend');
    } catch (error) {
      console.error('Login callback failed:', error);
      throw error;
    }
  }
}

export const authService = AuthService.getInstance();