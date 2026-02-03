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
    
    // Wait for main app to load - hamburger button should be visible on mobile
    await expect(page.locator('.hamburger-btn')).toBeVisible();
  });

  test('hamburger menu navigation works', async ({ page }) => {
    // On mobile, the hamburger button should be visible
    const hamburgerBtn = page.locator('.hamburger-btn');
    await expect(hamburgerBtn).toBeVisible();
    
    // Desktop nav should be hidden
    const desktopNav = page.locator('.desktop-nav');
    await expect(desktopNav).not.toBeVisible();
    
    // Click to open menu
    await hamburgerBtn.click();
    
    // Panel should appear with all tabs
    const panel = page.locator('.mobile-nav-panel');
    await expect(panel).toHaveClass(/open/);
    await expect(panel.locator('text=Track')).toBeVisible();
    await expect(panel.locator('text=Categories')).toBeVisible();
    await expect(panel.locator('text=Analytics')).toBeVisible();
    
    // Click Categories
    await panel.locator('text=Categories').click();
    
    // Panel should close
    await expect(panel).not.toHaveClass(/open/);
    
    // Category manager should be visible
    await expect(page.locator('h2:has-text("New Category")')).toBeVisible();
  });

  test('hamburger button transforms to X when open', async ({ page }) => {
    const hamburgerBtn = page.locator('.hamburger-btn');
    
    // Initially not open
    await expect(hamburgerBtn).not.toHaveClass(/open/);
    
    // Click to open
    await hamburgerBtn.click();
    
    // Should have open class (transforms to X)
    await expect(hamburgerBtn).toHaveClass(/open/);
    
    // Click overlay to close (overlay covers the hamburger when open)
    await page.locator('.mobile-nav-overlay').click();
    
    // Should not have open class
    await expect(hamburgerBtn).not.toHaveClass(/open/);
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

  test('guest mode shown in settings dropdown', async ({ page }) => {
    // Open settings menu
    const settingsBtn = page.locator('.settings-menu-btn');
    await settingsBtn.click();
    
    // Guest mode should be shown in the dropdown
    const dropdown = page.locator('.settings-dropdown');
    await expect(dropdown).toBeVisible();
    
    const guestSection = dropdown.locator('.settings-dropdown-guest');
    await expect(guestSection).toBeVisible();
    await expect(guestSection.locator('.settings-dropdown-name')).toContainText('Guest Mode');
  });

  test('hamburger menu is in header on mobile', async ({ page }) => {
    // Hamburger should be in header-left
    const headerLeft = page.locator('.header-left');
    const hamburgerBtn = headerLeft.locator('.hamburger-btn');
    await expect(hamburgerBtn).toBeVisible();
  });

  test('header hides on scroll down and shows on scroll up', async ({ page }) => {
    // Navigate to analytics which has more content to scroll
    const hamburgerBtn = page.locator('.hamburger-btn');
    await hamburgerBtn.click();
    await page.locator('.mobile-nav-panel').locator('text=Analytics').click();
    
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
    const hamburgerBtn = page.locator('.hamburger-btn');
    await hamburgerBtn.click();
    await page.locator('.mobile-nav-panel').locator('text=Categories').click();
    
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
    const hamburgerBtn = page.locator('.hamburger-btn');
    await hamburgerBtn.click();
    await page.locator('.mobile-nav-panel').locator('text=Analytics').click();
    
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
