/**
 * Authentication and authorization types
 */

export interface User {
  id: string;
  email: string;
  name: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  is_active: boolean;
  last_login?: string;
  profile_picture_url?: string;
  preferences?: UserPreferences;
}

export interface UserPreferences {
  language: string;
  timezone: string;
  notifications: NotificationPreferences;
  ui_preferences: UIPreferences;
}

export interface NotificationPreferences {
  email_notifications: boolean;
  push_notifications: boolean;
  processing_complete: boolean;
  summary_ready: boolean;
  system_updates: boolean;
}

export interface UIPreferences {
  theme: 'light' | 'dark' | 'auto';
  sidebar_collapsed: boolean;
  default_view: 'list' | 'grid';
  items_per_page: number;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
}

export interface MicrosoftTokenRequest {
  id_token: string;
  access_token: string;
}

export interface TokenRefreshRequest {
  refresh_token: string;
}

export interface AuthResponse {
  user: User;
  tokens: AuthTokens;
}

export interface AuthContext {
  isAuthenticated: boolean;
  user: User | null;
  tokens: AuthTokens | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<boolean>;
  loading: boolean;
  getAccessToken: () => string | null;
}

export interface JWTPayload {
  sub: string; // user ID
  email: string;
  name: string;
  tenant_id: string;
  iat: number; // issued at
  exp: number; // expiration
  jti?: string; // JWT ID
}

export interface SessionData {
  user_id: string;
  session_id: string;
  created_at: string;
  last_activity: string;
  ip_address?: string;
  user_agent?: string;
}