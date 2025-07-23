// Environment setup for Jest tests

// Set NODE_ENV to test
process.env.NODE_ENV = 'test';

// Mock environment variables for testing
process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8000';
process.env.NEXT_PUBLIC_WS_URL = 'ws://localhost:8000';
process.env.NEXT_PUBLIC_MICROSOFT_CLIENT_ID = 'test-client-id';
process.env.NEXT_PUBLIC_MICROSOFT_TENANT_ID = 'test-tenant-id';
process.env.NEXT_PUBLIC_MICROSOFT_AUTHORITY = 'https://login.microsoftonline.com/test-tenant-id';
process.env.NEXT_PUBLIC_MICROSOFT_REDIRECT_URI = 'http://localhost:3000/auth/callback';
process.env.NEXT_PUBLIC_APP_NAME = 'Meetingly Test';
process.env.NEXT_PUBLIC_APP_VERSION = '1.0.0-test';
process.env.NEXT_PUBLIC_ENABLE_ANALYTICS = 'false';
process.env.NEXT_PUBLIC_ENABLE_ERROR_REPORTING = 'false';