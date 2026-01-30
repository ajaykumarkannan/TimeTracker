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
    
    // Wait for main app to load
    await expect(page.locator('.app-nav')).toBeVisible();
  });

  test('complete workflow: create category, track time, view history', async ({ page }) => {
    // Navigate to categories
    await page.click('text=Categories');
    await expect(page.locator('h2:has-text("New Category")')).toBeVisible();

    // Create a new category
    await page.fill('input[placeholder="Category name"]', 'Development');
    await page.click('button:has-text("Add")');
    await expect(page.locator('.category-name:has-text("Development")')).toBeVisible();

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

    // Verify entry appears in history
    await expect(page.locator('.time-entry-list')).toBeVisible();
    await expect(page.locator('.entry-category:has-text("Development")')).toBeVisible();
  });

  test('edit and delete category', async ({ page }) => {
    await page.click('text=Categories');

    // Create category
    await page.fill('input[placeholder="Category name"]', 'TestCategory');
    await page.click('button:has-text("Add")');
    await expect(page.locator('.category-name:has-text("TestCategory")')).toBeVisible();

    // Find the row with TestCategory and click its edit button
    const categoryRow = page.locator('.category-item', { has: page.locator('.category-name:has-text("TestCategory")') });
    await categoryRow.locator('button[title="Edit"]').click();
    
    await expect(page.locator('h2:has-text("Edit Category")')).toBeVisible();
    await page.fill('input[placeholder="Category name"]', 'RenamedCategory');
    await page.click('button:has-text("Update")');
    await expect(page.locator('.category-name:has-text("RenamedCategory")')).toBeVisible();

    // Delete category
    page.on('dialog', dialog => dialog.accept());
    const renamedRow = page.locator('.category-item', { has: page.locator('.category-name:has-text("RenamedCategory")') });
    await renamedRow.locator('button[title="Delete"]').click();
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
    await page.click('button:has-text("Stop")');

    // Check history section shows the entry
    await expect(page.locator('.time-entry-list')).toBeVisible();
    await expect(page.locator('.entry-category:has-text("Meetings")')).toBeVisible();
  });

  test('timer updates in real-time', async ({ page }) => {
    // Start timer using a default category
    await page.click('.quick-start-category:has-text("Deep Work")');
    await page.click('.task-prompt-modal button:has-text("Start")');

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
