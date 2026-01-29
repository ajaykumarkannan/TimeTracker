import { test, expect } from '@playwright/test';

test.describe('Time Tracker E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('complete workflow: create category, track time, view history', async ({ page }) => {
    // Navigate to categories
    await page.click('text=Categories');
    await expect(page.locator('h2:has-text("Add Category")')).toBeVisible();

    // Create a category
    await page.fill('input[placeholder*="Meetings"]', 'Development');
    await page.click('button:has-text("Add Category")');
    await expect(page.locator('text=Development')).toBeVisible();

    // Navigate back to tracker
    await page.click('text=Tracker');

    // Start tracking time
    await page.selectOption('select', { label: 'Development' });
    await page.fill('textarea[placeholder*="working on"]', 'Building time tracker app');
    await page.click('button:has-text("Start Timer")');

    // Verify timer is running
    await expect(page.locator('text=Stop Timer')).toBeVisible();
    await expect(page.locator('text=Development')).toBeVisible();
    await expect(page.locator('text=Building time tracker app')).toBeVisible();

    // Wait a moment for time to elapse
    await page.waitForTimeout(2000);

    // Stop timer
    await page.click('button:has-text("Stop Timer")');

    // Verify entry appears in history
    await expect(page.locator('.time-entry-list')).toBeVisible();
    await expect(page.locator('.entry-category:has-text("Development")')).toBeVisible();
  });

  test('edit and delete category', async ({ page }) => {
    await page.click('text=Categories');

    // Create category
    await page.fill('input[placeholder*="Meetings"]', 'Meetings');
    await page.click('button:has-text("Add Category")');

    // Edit category
    await page.click('button[title="Edit"]');
    await page.fill('input[value="Meetings"]', 'Team Meetings');
    await page.click('button:has-text("Update Category")');
    await expect(page.locator('text=Team Meetings')).toBeVisible();

    // Delete category
    page.on('dialog', dialog => dialog.accept());
    await page.click('button[title="Delete"]');
    await expect(page.locator('text=Team Meetings')).not.toBeVisible();
  });

  test('cannot start timer without category', async ({ page }) => {
    await expect(page.locator('button:has-text("Start Timer")')).toBeDisabled();
  });

  test('displays total time tracked', async ({ page }) => {
    // Create category
    await page.click('text=Categories');
    await page.fill('input[placeholder*="Meetings"]', 'Testing');
    await page.click('button:has-text("Add Category")');
    await page.click('text=Tracker');

    // Track some time
    await page.selectOption('select', { label: 'Testing' });
    await page.click('button:has-text("Start Timer")');
    await page.waitForTimeout(3000);
    await page.click('button:has-text("Stop Timer")');

    // Check total time is displayed
    await expect(page.locator('.total-time')).toBeVisible();
    await expect(page.locator('.total-time')).toContainText('Total:');
  });

  test('timer updates in real-time', async ({ page }) => {
    // Create category and start timer
    await page.click('text=Categories');
    await page.fill('input[placeholder*="Meetings"]', 'Work');
    await page.click('button:has-text("Add Category")');
    await page.click('text=Tracker');
    await page.selectOption('select', { label: 'Work' });
    await page.click('button:has-text("Start Timer")');

    // Get initial time
    const initialTime = await page.locator('.timer-time').textContent();

    // Wait and check time has changed
    await page.waitForTimeout(2000);
    const updatedTime = await page.locator('.timer-time').textContent();

    expect(initialTime).not.toBe(updatedTime);
  });
});
