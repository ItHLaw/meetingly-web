import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { apiConfig } from '@/config/api';
import { createAxiosWithRetry } from './retry';

let isRefreshing = false;
let refreshPromise: Promise<string> | null = null;

// Create base axios instance
const baseApiClient = axios.create({
  baseURL: apiConfig.baseURL,
  timeout: apiConfig.timeout,
});

// Add retry logic to the axios instance
export const apiClient = createAxiosWithRetry(baseApiClient);

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const tokens = localStorage.getItem('auth_tokens');
    if (tokens) {
      const parsedTokens = JSON.parse(tokens);
      if (parsedTokens.access_token) {
        config.headers.Authorization = `Bearer ${parsedTokens.access_token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle token refresh
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      // Avoid multiple simultaneous refresh attempts
      if (isRefreshing) {
        try {
          const newToken = await refreshPromise;
          if (newToken && originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return apiClient(originalRequest);
          }
        } catch (refreshError) {
          // Refresh failed, redirect to login
          clearAuthAndRedirect();
          return Promise.reject(refreshError);
        }
      } else {
        isRefreshing = true;
        refreshPromise = refreshToken();

        try {
          const newToken = await refreshPromise;
          if (newToken && originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return apiClient(originalRequest);
          }
        } catch (refreshError) {
          // Refresh failed, redirect to login
          clearAuthAndRedirect();
          return Promise.reject(refreshError);
        } finally {
          isRefreshing = false;
          refreshPromise = null;
        }
      }
    }

    return Promise.reject(error);
  }
);

const refreshToken = async (): Promise<string> => {
  try {
    const tokens = localStorage.getItem('auth_tokens');
    if (!tokens) {
      throw new Error('No tokens available');
    }

    const parsedTokens = JSON.parse(tokens);
    if (!parsedTokens.refresh_token) {
      throw new Error('No refresh token available');
    }

    const response = await axios.post(`${apiConfig.baseURL}/auth/refresh`, {
      refresh_token: parsedTokens.refresh_token,
    });

    const newTokens = response.data;
    localStorage.setItem('auth_tokens', JSON.stringify(newTokens));
    
    return newTokens.access_token;
  } catch (error) {
    localStorage.removeItem('auth_tokens');
    localStorage.removeItem('auth_user');
    throw error;
  }
};

const clearAuthAndRedirect = () => {
  localStorage.removeItem('auth_tokens');
  localStorage.removeItem('auth_user');
  
  // Only redirect if we're not already on the login page
  if (typeof window !== 'undefined' && !window.location.pathname.includes('/login')) {
    window.location.href = '/login';
  }
};

export default apiClient;