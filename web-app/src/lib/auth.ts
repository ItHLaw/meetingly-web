import { PublicClientApplication } from '@microsoft/msal-browser';

export interface User {
  id: string;
  email: string;
  name: string;
  microsoftId: string;
  tenantId: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
}

export const AUTH_CONFIG = {
  clientId: process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID || '',
  tenantId: process.env.NEXT_PUBLIC_MICROSOFT_TENANT_ID || 'common',
  redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || 'http://localhost:3000/auth/callback',
  scopes: ['openid', 'profile', 'email'],
};

const msalConfig = {
  auth: {
    clientId: AUTH_CONFIG.clientId,
    authority: `https://login.microsoftonline.com/${AUTH_CONFIG.tenantId}`,
    redirectUri: AUTH_CONFIG.redirectUri,
  },
  cache: {
    cacheLocation: 'sessionStorage',
    storeAuthStateInCookie: false,
  },
};

export const msalInstance = new PublicClientApplication(msalConfig);

export const loginRequest = {
  scopes: AUTH_CONFIG.scopes,
};

export async function getAuthToken(): Promise<string | null> {
  try {
    // Try to get token silently first
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length === 0) {
      return null;
    }

    const silentRequest = {
      scopes: AUTH_CONFIG.scopes,
      account: accounts[0],
    };

    const response = await msalInstance.acquireTokenSilent(silentRequest);
    return response.accessToken;
  } catch (error) {
    console.error('Failed to get auth token:', error);
    return null;
  }
}

export async function refreshAuthToken(): Promise<string | null> {
  try {
    const accounts = msalInstance.getAllAccounts();
    if (accounts.length === 0) {
      return null;
    }

    const refreshRequest = {
      scopes: AUTH_CONFIG.scopes,
      account: accounts[0],
      forceRefresh: true,
    };

    const response = await msalInstance.acquireTokenSilent(refreshRequest);
    return response.accessToken;
  } catch (error) {
    console.error('Failed to refresh auth token:', error);
    return null;
  }
}

export function clearAuthTokens(): void {
  // Clear MSAL cache
  const accounts = msalInstance.getAllAccounts();
  accounts.forEach(account => {
    msalInstance.removeAccount(account);
  });

  // Clear localStorage tokens if any
  if (typeof window !== 'undefined') {
    localStorage.removeItem('auth_tokens');
    localStorage.removeItem('auth_user');
  }
}