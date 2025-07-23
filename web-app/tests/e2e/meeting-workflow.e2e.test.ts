import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Complete Meeting Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Setup authenticated session
    await setupAuthenticatedSession(page);
    await page.goto('/dashboard');
  });

  test('should complete full meeting upload and processing workflow', async ({ page }) => {
    // Step 1: Navigate to upload page
    const uploadButton = page.locator('button:has-text("Upload Meeting")').or(
      page.locator('[data-testid="upload-button"]')
    );
    await uploadButton.click();

    await expect(page).toHaveURL(/\/upload/);

    // Step 2: Upload audio file
    const fileInput = page.locator('input[type="file"]');
    
    // Create a mock audio file for testing
    const mockAudioFile = path.join(__dirname, '../fixtures/test-audio.mp3');
    await fileInput.setInputFiles(mockAudioFile);

    // Fill in meeting details
    await page.fill('[data-testid="meeting-name"]', 'E2E Test Meeting');
    await page.fill('[data-testid="meeting-description"]', 'This is a test meeting for E2E testing');

    // Configure processing options
    await page.selectOption('[data-testid="whisper-model"]', 'base');
    await page.check('[data-testid="enable-diarization"]');

    // Mock the upload API response
    await page.route('**/api/v1/audio/upload', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'test-job-123',
          meeting_id: 'test-meeting-456',
          status: 'pending',
          estimated_duration: 300,
          message: 'Audio upload successful, processing started'
        })
      });
    });

    // Submit the upload
    const submitButton = page.locator('button:has-text("Start Processing")');
    await submitButton.click();

    // Step 3: Verify upload success and redirection
    await expect(page).toHaveURL(/\/meetings\/test-meeting-456/);

    // Step 4: Monitor processing status
    // Mock processing status updates
    let progressValue = 0;
    await page.route('**/api/v1/audio/status/test-job-123', async route => {
      progressValue += 20;
      const status = progressValue >= 100 ? 'completed' : 'processing';
      
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          job_id: 'test-job-123',
          meeting_id: 'test-meeting-456',
          status: status,
          progress: Math.min(progressValue, 100),
          current_step: progressValue < 50 ? 'Transcribing audio' : 'Generating summary',
          estimated_completion: '2025-01-23T10:35:00Z'
        })
      });
    });

    // Check that processing progress is shown
    await expect(page.locator('[data-testid="processing-progress"]')).toBeVisible();
    await expect(page.locator('text=Transcribing audio')).toBeVisible();

    // Wait for processing to complete (simulated)
    await page.waitForTimeout(3000);

    // Step 5: Verify meeting details are loaded
    // Mock meeting details API
    await page.route('**/api/v1/meetings/test-meeting-456', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-meeting-456',
          name: 'E2E Test Meeting',
          description: 'This is a test meeting for E2E testing',
          processing_status: 'completed',
          created_at: '2025-01-23T10:00:00Z',
          updated_at: '2025-01-23T10:30:00Z',
          duration: 1800,
          participants: ['Speaker 1', 'Speaker 2'],
          has_transcript: true,
          has_summary: true,
          transcript_data: [
            {
              id: 'segment-1',
              text: 'Welcome to our test meeting. Today we will discuss the quarterly results.',
              speaker_id: 'speaker_1',
              speaker_name: 'Speaker 1',
              start_time: 0.0,
              end_time: 5.2,
              confidence: 0.95
            },
            {
              id: 'segment-2',
              text: 'Thank you for joining. Let me share the latest numbers.',
              speaker_id: 'speaker_2',
              speaker_name: 'Speaker 2',
              start_time: 5.2,
              end_time: 9.8,
              confidence: 0.92
            }
          ],
          summary_data: {
            summary: 'This meeting covered quarterly results and future planning.',
            summary_type: 'structured',
            provider: 'openai',
            model: 'gpt-4',
            generated_at: '2025-01-23T10:30:00Z',
            quality_score: 0.91
          }
        })
      });
    });

    // Reload the page to get meeting details
    await page.reload();

    // Step 6: Verify transcript is displayed
    await expect(page.locator('[data-testid="transcript-section"]')).toBeVisible();
    await expect(page.locator('text=Welcome to our test meeting')).toBeVisible();
    await expect(page.locator('text=Speaker 1')).toBeVisible();
    await expect(page.locator('text=Speaker 2')).toBeVisible();

    // Step 7: Verify summary is displayed
    await expect(page.locator('[data-testid="summary-section"]')).toBeVisible();
    await expect(page.locator('text=This meeting covered quarterly results')).toBeVisible();

    // Step 8: Test summary regeneration
    const regenerateButton = page.locator('button:has-text("Regenerate Summary")');
    if (await regenerateButton.isVisible()) {
      await regenerateButton.click();

      // Mock summary regeneration
      await page.route('**/api/v1/meetings/test-meeting-456/summary', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            job_id: 'summary-job-789',
            status: 'pending',
            estimated_duration: 60,
            message: 'Summary regeneration started'
          })
        });
      });

      await expect(page.locator('text=Summary regeneration started')).toBeVisible();
    }

    // Step 9: Test export functionality
    const exportButton = page.locator('button:has-text("Export")').or(
      page.locator('[data-testid="export-button"]')
    );
    
    if (await exportButton.isVisible()) {
      await exportButton.click();
      
      // Should show export options
      await expect(page.locator('[data-testid="export-modal"]')).toBeVisible();
      
      // Select export format
      await page.selectOption('[data-testid="export-format"]', 'pdf');
      
      // Mock export API
      await page.route('**/api/v1/meetings/test-meeting-456/export', async route => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            export_id: 'export-123',
            download_url: '/downloads/meeting-export.pdf',
            status: 'completed'
          })
        });
      });
      
      const confirmExportButton = page.locator('button:has-text("Export")').last();
      await confirmExportButton.click();
      
      await expect(page.locator('text=Export completed')).toBeVisible();
    }
  });

  test('should handle processing errors gracefully', async ({ page }) => {
    // Navigate to upload
    const uploadButton = page.locator('button:has-text("Upload Meeting")');
    await uploadButton.click();

    // Upload file
    const fileInput = page.locator('input[type="file"]');
    const mockAudioFile = path.join(__dirname, '../fixtures/test-audio.mp3');
    await fileInput.setInputFiles(mockAudioFile);

    await page.fill('[data-testid="meeting-name"]', 'Failed Processing Test');

    // Mock upload failure
    await page.route('**/api/v1/audio/upload', async route => {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          detail: 'File format not supported',
          error_code: 'FILE_FORMAT_UNSUPPORTED'
        })
      });
    });

    const submitButton = page.locator('button:has-text("Start Processing")');
    await submitButton.click();

    // Should show error message
    await expect(page.locator('text=File format not supported')).toBeVisible();
  });

  test('should allow editing meeting details', async ({ page }) => {
    // Go directly to a meeting page
    await page.goto('/meetings/test-meeting-456');

    // Mock meeting details
    await setupMeetingDetailsRoute(page);

    await page.reload();

    // Click edit button
    const editButton = page.locator('button:has-text("Edit")').or(
      page.locator('[data-testid="edit-meeting"]')
    );
    await editButton.click();

    // Should show edit form
    await expect(page.locator('[data-testid="edit-meeting-form"]')).toBeVisible();

    // Update meeting details
    await page.fill('[data-testid="meeting-name-edit"]', 'Updated Meeting Name');
    await page.fill('[data-testid="meeting-description-edit"]', 'Updated description');

    // Mock update API
    await page.route('**/api/v1/meetings/test-meeting-456', async route => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: 'test-meeting-456',
            name: 'Updated Meeting Name',
            description: 'Updated description',
            processing_status: 'completed'
          })
        });
      }
    });

    const saveButton = page.locator('button:has-text("Save")');
    await saveButton.click();

    // Should show updated details
    await expect(page.locator('text=Updated Meeting Name')).toBeVisible();
    await expect(page.locator('text=Updated description')).toBeVisible();
  });

  test('should delete meetings', async ({ page }) => {
    // Go to dashboard with meetings list
    await page.goto('/dashboard');

    // Mock meetings list
    await page.route('**/api/v1/meetings*', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          meetings: [
            {
              id: 'test-meeting-456',
              name: 'Test Meeting to Delete',
              processing_status: 'completed',
              created_at: '2025-01-23T10:00:00Z',
              updated_at: '2025-01-23T10:30:00Z',
              duration: 1800,
              participants: ['Speaker 1'],
              has_transcript: true,
              has_summary: true
            }
          ],
          total: 1,
          skip: 0,
          limit: 20,
          has_more: false
        })
      });
    });

    await page.reload();

    // Find delete button for the meeting
    const deleteButton = page.locator('[data-testid="delete-meeting-test-meeting-456"]').or(
      page.locator('button:has-text("Delete")').first()
    );
    
    await deleteButton.click();

    // Should show confirmation dialog
    await expect(page.locator('[data-testid="delete-confirmation"]')).toBeVisible();

    // Mock delete API
    await page.route('**/api/v1/meetings/test-meeting-456', async route => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Meeting deleted successfully'
          })
        });
      }
    });

    const confirmDeleteButton = page.locator('button:has-text("Delete")').last();
    await confirmDeleteButton.click();

    // Should show success message
    await expect(page.locator('text=Meeting deleted successfully')).toBeVisible();
  });
});

// Helper functions
async function setupAuthenticatedSession(page: any) {
  // Mock authenticated state
  await page.addInitScript(() => {
    localStorage.setItem('auth_tokens', JSON.stringify({
      access_token: 'mock_access_token',
      refresh_token: 'mock_refresh_token',
      token_type: 'bearer',
      expires_in: 3600
    }));
    
    localStorage.setItem('auth_user', JSON.stringify({
      id: 'test-user-id',
      email: 'test@example.com',
      name: 'Test User',
      tenant_id: 'test-tenant',
      created_at: '2025-01-23T10:00:00Z',
      is_active: true
    }));
  });

  // Mock auth verification
  await page.route('**/auth/me', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'test-user-id',
        email: 'test@example.com',
        name: 'Test User',
        tenant_id: 'test-tenant',
        created_at: '2025-01-23T10:00:00Z',
        is_active: true
      })
    });
  });
}

async function setupMeetingDetailsRoute(page: any) {
  await page.route('**/api/v1/meetings/test-meeting-456', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 'test-meeting-456',
        name: 'E2E Test Meeting',
        description: 'This is a test meeting for E2E testing',
        processing_status: 'completed',
        created_at: '2025-01-23T10:00:00Z',
        updated_at: '2025-01-23T10:30:00Z',
        duration: 1800,
        participants: ['Speaker 1', 'Speaker 2'],
        has_transcript: true,
        has_summary: true,
        transcript_data: [
          {
            id: 'segment-1',
            text: 'Welcome to our test meeting.',
            speaker_id: 'speaker_1',
            speaker_name: 'Speaker 1',
            start_time: 0.0,
            end_time: 3.5,
            confidence: 0.95
          }
        ],
        summary_data: {
          summary: 'This meeting covered quarterly results.',
          summary_type: 'structured',
          provider: 'openai',
          model: 'gpt-4',
          generated_at: '2025-01-23T10:30:00Z',
          quality_score: 0.91
        }
      })
    });
  });
}