export const authConfig = {
  microsoft: {
    clientId: process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID || '',
    tenantId: process.env.NEXT_PUBLIC_MICROSOFT_TENANT_ID || 'common',
    redirectUri: process.env.NEXT_PUBLIC_REDIRECT_URI || 'http://localhost:3000/auth/callback',
    scopes: ['openid', 'profile', 'email', 'User.Read'],
  },
  session: {
    cookieName: 'meetily-session',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
  },
} as const;