import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting E2E test global setup...');

  const { baseURL } = config.projects[0].use;
  const browser = await chromium.launch();
  const page = await browser.newPage();

  try {
    // Wait for frontend to be ready
    console.log('⏳ Waiting for frontend to be ready...');
    await page.goto(baseURL || 'http://localhost:3000');
    await page.waitForSelector('body', { timeout: 30000 });
    console.log('✅ Frontend is ready');

    // Wait for backend API to be ready
    console.log('⏳ Waiting for backend API to be ready...');
    const response = await page.request.get('http://localhost:8000/health');
    if (!response.ok()) {
      throw new Error(`Backend health check failed: ${response.status()}`);
    }
    console.log('✅ Backend API is ready');

    // Setup test data if needed
    await setupTestData(page);

  } catch (error) {
    console.error('❌ Global setup failed:', error);
    throw error;
  } finally {
    await browser.close();
  }

  console.log('✅ E2E test global setup completed');
}

async function setupTestData(page: any) {
  console.log('📝 Setting up test data...');
  
  try {
    // Create test user if needed
    // Note: In a real scenario, you might create test users via API
    console.log('✅ Test data setup completed');
  } catch (error) {
    console.warn('⚠️ Test data setup failed (continuing anyway):', error);
  }
}

export default globalSetup;