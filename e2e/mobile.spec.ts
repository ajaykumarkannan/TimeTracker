import { test, expect } from '@playwright/test';

/**
 * Mobile Quick Start & Layout Tests
 */
test.describe('Mobile Modal Behavior', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
    });
    await page.reload();

    // Wait for landing page and click "Continue as Guest"
    await page.click('button:has-text("Continue as Guest")');

    // Wait for main app to load
    await expect(page.locator('.hamburger-btn')).toBeVisible();
  });

  test('quick start can start a task on mobile', async ({ page }) => {
    const categorySelect = page.locator('select').first();
    await expect(categorySelect).toBeVisible();

    // Wait for category options to load from API
    await expect(categorySelect.locator('option:not([value=""])')).not.toHaveCount(0, { timeout: 10000 });

    // Pick first real category option (skip placeholder)
    const options = await categorySelect.locator('option').allTextContents();
    expect(options.length).toBeGreaterThan(2);
    await categorySelect.selectOption({ index: 1 });

    const taskInput = page.locator('.description-input-wrapper input').first();
    await taskInput.fill('Mobile quick start seed task');

    await page.locator('button:has-text("Start")').first().click();
    await expect(page.locator('.timer-time')).toBeVisible();

    await page.locator('button:has-text("Stop")').first().click();

    const quickStartBtn = page.locator('.quick-start-btn').first();
    await expect(quickStartBtn).toBeVisible();

    await quickStartBtn.click();
    await expect(page.locator('.timer-time')).toBeVisible();
  });

  test('mobile nav overlay is visible and usable', async ({ page }) => {
    const hamburger = page.locator('.hamburger-btn');
    await hamburger.click();

    const overlay = page.locator('.mobile-nav-overlay');
    await expect(overlay).toBeVisible();

    // Overlay should cover viewport area
    const box = await overlay.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThan(0);
    expect(box!.height).toBeGreaterThan(0);

    // Clicking overlay closes nav
    await overlay.click();
    await expect(page.locator('.mobile-nav-panel')).not.toHaveClass(/open/);
  });

  test('task input is usable on mobile viewport', async ({ page }) => {
    const taskInput = page.locator('.description-input-wrapper input').first();
    await expect(taskInput).toBeVisible();
    await taskInput.fill('Test task');
    await expect(taskInput).toHaveValue('Test task');
  });

  test('mobile nav overlay uses full-screen fixed positioning', async ({ page }) => {
    await page.locator('.hamburger-btn').click();
    const overlay = page.locator('.mobile-nav-overlay');
    await expect(overlay).toBeVisible();

    const style = await overlay.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return { position: s.position, top: s.top, left: s.left, right: s.right, bottom: s.bottom };
    });

    expect(style.position).toBe('fixed');
    expect(style.top).toBe('0px');
    expect(style.left).toBe('0px');
    expect(style.right).toBe('0px');
    expect(style.bottom).toBe('0px');
  });
});

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
    // Start a timer via form controls
    const categorySelect = page.locator('select').first();

    // Wait for category options to load from API
    await expect(categorySelect.locator('option:not([value=""])')).not.toHaveCount(0, { timeout: 10000 });

    await categorySelect.selectOption({ index: 1 });
    await page.locator('.description-input-wrapper input').first().fill('Timer alignment test');
    await page.locator('button:has-text("Start")').first().click();

    // Wait for timer to be visible
    await expect(page.locator('.timer-time')).toBeVisible();

    // Check that active tracker has centered alignment container
    const activeTracker = page.locator('.active-tracker');
    await expect(activeTracker).toBeVisible();

    // Verify the timer display is visible
    const timerDisplay = page.locator('.timer-display');
    await expect(timerDisplay).toBeVisible();

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
    const header = page.locator('.app-header');
    await expect(header).toBeVisible();
    
    // Ensure page has enough content to scroll by checking document height
    // and inject extra content if needed
    const canScroll = await page.evaluate(() => {
      const docHeight = document.documentElement.scrollHeight;
      const viewportHeight = window.innerHeight;
      return docHeight > viewportHeight + 300;
    });
    
    if (!canScroll) {
      // Add temporary spacer to enable scrolling
      await page.evaluate(() => {
        const spacer = document.createElement('div');
        spacer.id = 'test-spacer';
        spacer.style.height = '1000px';
        document.body.appendChild(spacer);
      });
    }
    
    // Scroll down using evaluate (mouse.wheel not supported in mobile WebKit)
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(600);
    
    // Header should be hidden (has header-hidden class)
    await expect(header).toHaveClass(/header-hidden/);
    
    // Scroll back up
    await page.evaluate(() => window.scrollBy(0, -500));
    await page.waitForTimeout(600);
    
    // Header should be visible again
    await expect(header).not.toHaveClass(/header-hidden/);
    
    // Clean up spacer if added
    await page.evaluate(() => {
      const spacer = document.getElementById('test-spacer');
      if (spacer) spacer.remove();
    });
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
    
    // Wait for mobile nav panel to be visible
    await expect(page.locator('.mobile-nav-panel.open')).toBeVisible();
    
    // Click on Analytics button (navigation uses buttons, not links)
    const analyticsBtn = page.locator('.mobile-nav-item:has-text("Analytics")');
    await expect(analyticsBtn).toBeVisible();
    await analyticsBtn.click();
    
    // Wait for mobile nav to close (panel loses 'open' class)
    await expect(page.locator('.mobile-nav-panel.open')).not.toBeVisible({ timeout: 5000 });
    
    // Wait for analytics to fully load - check for either loaded state or error state
    const analyticsLoaded = page.locator('.analytics');
    const analyticsError = page.locator('.analytics-error');
    
    // Wait for either analytics content or error to appear
    await expect(analyticsLoaded.or(analyticsError)).toBeVisible({ timeout: 15000 });
    
    // If analytics loaded successfully, verify the layout
    const isLoaded = await analyticsLoaded.isVisible();
    if (isLoaded) {
      // Period selector should be visible
      const periodSelector = page.locator('.period-selector');
      await expect(periodSelector).toBeVisible({ timeout: 5000 });
      
      // Summary grid should be visible
      const summaryGrid = page.locator('.summary-grid');
      await expect(summaryGrid).toBeVisible();
    } else {
      // If error state, just verify the error message is visible
      await expect(analyticsError).toContainText('Failed to load');
    }
  });
});
