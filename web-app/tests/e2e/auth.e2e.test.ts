import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Start from the home page
    await page.goto('/');
  });

  test('should display login page for unauthenticated users', async ({ page }) => {
    // Should redirect to login or show login UI
    await expect(page).toHaveTitle(/Meetingly/);
    
    // Look for Microsoft SSO login button
    const loginButton = page.locator('button:has-text("Sign in with Microsoft")');
    await expect(loginButton).toBeVisible();
  });

  test('should handle Microsoft SSO login flow', async ({ page }) => {
    // Mock the Microsoft SSO flow since we can't do real auth in tests
    await page.route('**/auth/microsoft/token', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock_access_token',
          refresh_token: 'mock_refresh_token',
          token_type: 'bearer',
          expires_in: 3600,
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
            tenant_id: 'test-tenant',
            created_at: '2025-01-23T10:00:00Z',
            is_active: true
          }
        })
      });
    });

    // Mock MSAL library responses
    await page.addInitScript(() => {
      // Mock MSAL
      (window as any).msal = {
        PublicClientApplication: class {
          async loginPopup() {
            return {
              account: { homeAccountId: 'test-account' },
              idToken: 'mock-id-token',
              accessToken: 'mock-access-token'
            };
          }
          
          async logoutPopup() {
            return {};
          }
        }
      };
    });

    // Click login button
    const loginButton = page.locator('button:has-text("Sign in with Microsoft")');
    await loginButton.click();

    // Should be redirected to dashboard after successful login
    await expect(page).toHaveURL(/\/dashboard/);
    
    // Check if user info is displayed
    await expect(page.locator('text=Test User')).toBeVisible();
  });

  test('should handle login errors gracefully', async ({ page }) => {
    // Mock a failed authentication
    await page.route('**/auth/microsoft/token', async route => {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'Authentication failed',
          error_code: 'AUTH_MICROSOFT_FAILED'
        })
      });
    });

    // Mock MSAL to return tokens
    await page.addInitScript(() => {
      (window as any).msal = {
        PublicClientApplication: class {
          async loginPopup() {
            return {
              account: { homeAccountId: 'test-account' },
              idToken: 'invalid-token',
              accessToken: 'invalid-token'
            };
          }
        }
      };
    });

    const loginButton = page.locator('button:has-text("Sign in with Microsoft")');
    await loginButton.click();

    // Should show error message
    await expect(page.locator('text=Authentication failed')).toBeVisible();
  });

  test('should handle logout functionality', async ({ page }) => {
    // First, mock a successful login
    await page.route('**/auth/microsoft/token', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock_access_token',
          refresh_token: 'mock_refresh_token',
          token_type: 'bearer',
          expires_in: 3600,
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
            tenant_id: 'test-tenant',
            created_at: '2025-01-23T10:00:00Z',
            is_active: true
          }
        })
      });
    });

    // Mock logout endpoint
    await page.route('**/auth/logout', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ message: 'Logged out successfully' })
      });
    });

    await page.addInitScript(() => {
      (window as any).msal = {
        PublicClientApplication: class {
          async loginPopup() {
            return {
              account: { homeAccountId: 'test-account' },
              idToken: 'mock-id-token',
              accessToken: 'mock-access-token'
            };
          }
          
          async logoutPopup() {
            return {};
          }
        }
      };
    });

    // Login first
    const loginButton = page.locator('button:has-text("Sign in with Microsoft")');
    await loginButton.click();
    
    await expect(page).toHaveURL(/\/dashboard/);

    // Find and click logout button (typically in user menu)
    const userMenu = page.locator('[data-testid="user-menu"]').or(page.locator('button:has-text("Test User")'));
    await userMenu.click();

    const logoutButton = page.locator('button:has-text("Sign out")').or(page.locator('button:has-text("Logout")'));
    await logoutButton.click();

    // Should be redirected back to login page
    await expect(page.locator('button:has-text("Sign in with Microsoft")')).toBeVisible();
  });

  test('should protect routes that require authentication', async ({ page }) => {
    // Try to access protected route directly
    await page.goto('/dashboard');

    // Should be redirected to login or show unauthorized message
    const loginButton = page.locator('button:has-text("Sign in with Microsoft")');
    await expect(loginButton).toBeVisible();
  });

  test('should refresh tokens automatically', async ({ page }) => {
    // Mock initial login
    await page.route('**/auth/microsoft/token', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'mock_access_token',
          refresh_token: 'mock_refresh_token',
          token_type: 'bearer',
          expires_in: 1, // Very short expiry for testing
          user: {
            id: 'test-user-id',
            email: 'test@example.com',
            name: 'Test User',
            tenant_id: 'test-tenant',
            created_at: '2025-01-23T10:00:00Z',
            is_active: true
          }
        })
      });
    });

    // Mock token refresh
    await page.route('**/auth/refresh', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          access_token: 'new_access_token',
          refresh_token: 'new_refresh_token',
          token_type: 'bearer',
          expires_in: 3600
        })
      });
    });

    await page.addInitScript(() => {
      (window as any).msal = {
        PublicClientApplication: class {
          async loginPopup() {
            return {
              account: { homeAccountId: 'test-account' },
              idToken: 'mock-id-token',
              accessToken: 'mock-access-token'
            };
          }
        }
      };
    });

    // Login
    const loginButton = page.locator('button:has-text("Sign in with Microsoft")');
    await loginButton.click();
    
    await expect(page).toHaveURL(/\/dashboard/);

    // Wait for token to expire and refresh (simulated)
    await page.waitForTimeout(2000);

    // Make an API call that would trigger token refresh
    // The app should automatically refresh the token
    // Verify user is still logged in
    await expect(page.locator('text=Test User')).toBeVisible();
  });
});