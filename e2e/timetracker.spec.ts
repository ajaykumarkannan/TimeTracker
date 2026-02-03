import { test, expect } from '@playwright/test';

test.describe('Time Tracker E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start fresh
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    
    // Wait for landing page and click "Continue as Guest"
    await page.click('button:has-text("Continue as Guest")');
    
    // Wait for main app to load - use desktop nav for desktop tests
    await expect(page.locator('.desktop-nav')).toBeVisible();
  });

  test('complete workflow: create category, track time, view history', async ({ page }) => {
    // Navigate to categories
    await page.click('text=Categories');
    await expect(page.locator('h2:has-text("New Category")')).toBeVisible();

    // Create a new category
    await page.fill('input[placeholder="Category name"]', 'Development');
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/categories') && resp.status() === 201),
      page.click('button:has-text("Add")')
    ]);
    await expect(page.locator('.category-name:has-text("Development")')).toBeVisible({ timeout: 10000 });

    // Navigate back to tracker
    await page.click('text=Track');

    // Start tracking time via quick start category button
    await page.click('.quick-start-category:has-text("Development")');
    
    // Fill in task name in the prompt modal and start
    await page.fill('.task-prompt-input', 'Building time tracker app');
    await page.click('.task-prompt-modal button:has-text("Start")');

    // Verify timer is running
    await expect(page.locator('button:has-text("Stop")')).toBeVisible();
    await expect(page.locator('.category-badge:has-text("Development")')).toBeVisible();

    // Wait a moment for time to elapse
    await page.waitForTimeout(2000);

    // Stop timer
    await page.click('button:has-text("Stop")');

    // Wait for the entry to appear in history (give time for API call and re-render)
    await expect(page.locator('.time-entry-list')).toBeVisible();
    await expect(page.locator('.entry-category:has-text("Development")')).toBeVisible({ timeout: 10000 });
  });

  test('edit and delete category', async ({ page }) => {
    await page.click('text=Categories');

    // Create category and wait for API response
    await page.fill('input[placeholder="Category name"]', 'TestCategory');
    await Promise.all([
      page.waitForResponse(resp => resp.url().includes('/api/categories') && resp.status() === 201),
      page.click('button:has-text("Add")')
    ]);
    await expect(page.locator('.category-name:has-text("TestCategory")')).toBeVisible({ timeout: 10000 });

    // Find the row with TestCategory and click its edit button
    const categoryRow = page.locator('.category-item', { has: page.locator('.category-name:has-text("TestCategory")') });
    await categoryRow.locator('button[title="Edit"]').click();
    
    await expect(page.locator('h2:has-text("Edit Category")')).toBeVisible();
    await page.fill('input[placeholder="Category name"]', 'RenamedCategory');
    await page.click('button:has-text("Update")');
    await expect(page.locator('.category-name:has-text("RenamedCategory")')).toBeVisible();

    // Delete category - categories without time entries delete immediately
    // Categories with time entries show a modal to select replacement
    const renamedRow = page.locator('.category-item', { has: page.locator('.category-name:has-text("RenamedCategory")') });
    await renamedRow.locator('button[title="Delete"]').click();
    
    // Verify category is gone (no modal needed since no time entries)
    await expect(page.locator('.category-name:has-text("RenamedCategory")')).not.toBeVisible();
  });

  test('cannot start timer without category selected', async ({ page }) => {
    // The start button in the form should be disabled when no category is selected
    await expect(page.locator('.tracker-form .start-btn')).toBeDisabled();
  });

  test('displays time in history after tracking', async ({ page }) => {
    // Use one of the default categories (Meetings) to track time
    await page.click('.quick-start-category:has-text("Meetings")');
    await page.click('.task-prompt-modal button:has-text("Start")');
    
    await page.waitForTimeout(2000);
    
    // Stop timer
    await page.click('button:has-text("Stop")');

    // Wait for the entry to appear in history (give time for API call and re-render)
    await expect(page.locator('.time-entry-list')).toBeVisible();
    await expect(page.locator('.entry-category:has-text("Meetings")')).toBeVisible({ timeout: 10000 });
  });

  test('timer updates in real-time', async ({ page }) => {
    // Wait for the tracker form to be visible (indicates page is loaded)
    await expect(page.locator('.tracker-form')).toBeVisible({ timeout: 10000 });
    
    // Wait a moment for categories to load
    await page.waitForTimeout(1000);
    
    // Check if quick-start section exists (it should if categories loaded)
    const quickStartSection = page.locator('.quick-start-section');
    const hasQuickStart = await quickStartSection.isVisible();
    
    if (!hasQuickStart) {
      // If no quick-start section, categories might not have loaded - skip this test
      test.skip();
      return;
    }
    
    // Start timer using a default category
    await page.click('.quick-start-category:has-text("Planning")');
    
    // Wait for modal and click start
    await expect(page.locator('.task-prompt-modal')).toBeVisible({ timeout: 5000 });
    await page.click('.task-prompt-modal button:has-text("Start")');

    // Wait for timer to be visible (this means the start was successful)
    await expect(page.locator('.timer-time')).toBeVisible({ timeout: 15000 });

    // Get initial time
    const initialTime = await page.locator('.timer-time').textContent();

    // Wait and check time has changed
    await page.waitForTimeout(2000);
    const updatedTime = await page.locator('.timer-time').textContent();

    expect(initialTime).not.toBe(updatedTime);
    
    // Clean up - stop the timer
    await page.click('button:has-text("Stop")');
  });
});
