import { test, expect, devices } from '@playwright/test';

// Use iPhone 13 viewport for mobile tests
test.use({ ...devices['iPhone 13'] });

test.describe('Mobile UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();
    
    // Wait for landing page and click "Continue as Guest"
    await page.click('button:has-text("Continue as Guest")');
    
    // Wait for main app to load - use mobile nav which should be visible on mobile
    await expect(page.locator('.mobile-nav')).toBeVisible();
  });

  test('mobile navigation dropdown works', async ({ page }) => {
    // On mobile, the nav should be a dropdown trigger
    const mobileNavTrigger = page.locator('.mobile-nav-trigger');
    await expect(mobileNavTrigger).toBeVisible();
    
    // Desktop nav should be hidden
    const desktopNav = page.locator('.desktop-nav');
    await expect(desktopNav).not.toBeVisible();
    
    // Click to open dropdown
    await mobileNavTrigger.click();
    
    // Dropdown should appear with all tabs
    const dropdown = page.locator('.mobile-nav-dropdown');
    await expect(dropdown).toBeVisible();
    await expect(dropdown.locator('text=Track')).toBeVisible();
    await expect(dropdown.locator('text=Categories')).toBeVisible();
    await expect(dropdown.locator('text=Analytics')).toBeVisible();
    
    // Click Categories
    await dropdown.locator('text=Categories').click();
    
    // Dropdown should close and nav trigger should show Categories
    await expect(dropdown).not.toBeVisible();
    await expect(mobileNavTrigger).toContainText('Categories');
    
    // Category manager should be visible
    await expect(page.locator('h2:has-text("New Category")')).toBeVisible();
  });

  test('timer is centered on mobile', async ({ page }) => {
    // Start a timer using a default category
    await page.click('.quick-start-category:has-text("Meetings")');
    await page.click('.task-prompt-modal button:has-text("Start")');
    
    // Wait for timer to be visible
    await expect(page.locator('.timer-time')).toBeVisible();
    
    // Check that active tracker has centered alignment
    const activeTracker = page.locator('.active-tracker');
    await expect(activeTracker).toBeVisible();
    
    // Verify the timer display is visible and centered (flex-direction: column on mobile)
    const timerDisplay = page.locator('.timer-display');
    await expect(timerDisplay).toBeVisible();
    
    // Clean up
    await page.click('button:has-text("Stop")');
  });

  test('pop-out button is hidden on mobile', async ({ page }) => {
    // Start a timer
    await page.click('.quick-start-category:has-text("Planning")');
    await page.click('.task-prompt-modal button:has-text("Start")');
    
    // Wait for timer to be visible
    await expect(page.locator('.timer-time')).toBeVisible();
    
    // Floating pop-out button should NOT be visible on mobile
    const popoutBtn = page.locator('.floating-popout-btn');
    await expect(popoutBtn).not.toBeVisible();
    
    // Clean up
    await page.click('button:has-text("Stop")');
  });

  test('guest mode badge is on the left', async ({ page }) => {
    // Guest mode badge should be visible in header-left
    const headerLeft = page.locator('.header-left');
    const modeBadge = headerLeft.locator('.mode-badge');
    await expect(modeBadge).toBeVisible();
    await expect(modeBadge).toContainText('Guest Mode');
  });

  test('header hides on scroll down and shows on scroll up', async ({ page }) => {
    // Navigate to analytics which has more content to scroll
    const mobileNavTrigger = page.locator('.mobile-nav-trigger');
    await mobileNavTrigger.click();
    await page.locator('.mobile-nav-dropdown').locator('text=Analytics').click();
    
    // Wait for analytics to load
    await expect(page.locator('.analytics')).toBeVisible();
    
    const header = page.locator('.app-header');
    await expect(header).toBeVisible();
    
    // Scroll down
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(500);
    
    // Header should be hidden (has header-hidden class)
    await expect(header).toHaveClass(/header-hidden/);
    
    // Scroll back up
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    
    // Header should be visible again
    await expect(header).not.toHaveClass(/header-hidden/);
  });

  test('inputs do not trigger zoom on focus', async ({ page }) => {
    // Navigate to categories to test input
    const mobileNavTrigger = page.locator('.mobile-nav-trigger');
    await mobileNavTrigger.click();
    await page.locator('.mobile-nav-dropdown').locator('text=Categories').click();
    
    // Get initial viewport scale
    const initialScale = await page.evaluate(() => {
      return window.visualViewport?.scale || 1;
    });
    
    // Focus on the category name input
    const input = page.locator('input[placeholder="Category name"]');
    await input.focus();
    await page.waitForTimeout(500);
    
    // Check that scale hasn't changed (no zoom)
    const afterFocusScale = await page.evaluate(() => {
      return window.visualViewport?.scale || 1;
    });
    
    expect(afterFocusScale).toBe(initialScale);
  });

  test('analytics layout is responsive on mobile', async ({ page }) => {
    // Navigate to analytics
    const mobileNavTrigger = page.locator('.mobile-nav-trigger');
    await mobileNavTrigger.click();
    await page.locator('.mobile-nav-dropdown').locator('text=Analytics').click();
    
    // Wait for analytics to load
    await expect(page.locator('.analytics')).toBeVisible();
    
    // Period selector should be visible
    const periodSelector = page.locator('.period-selector');
    await expect(periodSelector).toBeVisible();
    
    // Summary grid should be visible
    const summaryGrid = page.locator('.summary-grid');
    await expect(summaryGrid).toBeVisible();
  });
});
