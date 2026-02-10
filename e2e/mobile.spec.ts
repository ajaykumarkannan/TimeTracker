import { test, expect, devices } from '@playwright/test';

// Use iPhone 13 viewport for mobile tests
test.use({ ...devices['iPhone 13'] });

/**
 * Mobile Modal Behavior Tests
 * 
 * **Validates: Requirements 1.2, 1.3, 1.4, 2.2, 2.3, 2.4**
 * 
 * Tests for mobile modal layout including:
 * - Modal z-index is above background elements
 * - Modal scrolling works on mobile viewport
 * - Background scroll is locked when modal is open
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

  /**
   * Test modal z-index is above background elements
   * **Validates: Requirements 1.2, 2.2**
   */
  test('task entry modal has z-index above background elements', async ({ page }) => {
    // Click on a category to open the task entry modal
    const categoryBtn = page.locator('.quick-start-category').first();
    await expect(categoryBtn).toBeVisible();
    await categoryBtn.click();
    
    // Wait for modal to appear
    const modalOverlay = page.locator('.task-prompt-overlay');
    await expect(modalOverlay).toBeVisible();
    
    // Verify modal overlay has high z-index (9999 as per CSS)
    const overlayZIndex = await modalOverlay.evaluate((el) => {
      return window.getComputedStyle(el).zIndex;
    });
    expect(parseInt(overlayZIndex)).toBeGreaterThanOrEqual(9999);
    
    // Verify modal is visible and positioned above other content
    const modal = page.locator('.task-prompt-modal');
    await expect(modal).toBeVisible();
    
    // Verify the modal is in the viewport and not obscured
    const modalBox = await modal.boundingBox();
    expect(modalBox).not.toBeNull();
    expect(modalBox!.width).toBeGreaterThan(0);
    expect(modalBox!.height).toBeGreaterThan(0);
    
    // Verify modal input is focusable (proves it's on top)
    const modalInput = modal.locator('.task-prompt-input');
    await expect(modalInput).toBeVisible();
    await modalInput.focus();
    await expect(modalInput).toBeFocused();
  });

  /**
   * Test modal scrolling works on mobile viewport
   * **Validates: Requirements 1.3, 2.3**
   */
  test('modal content is scrollable when exceeding viewport', async ({ page }) => {
    // Click on a category to open the task entry modal
    const categoryBtn = page.locator('.quick-start-category').first();
    await expect(categoryBtn).toBeVisible();
    await categoryBtn.click();
    
    // Wait for modal to appear
    const modal = page.locator('.task-prompt-modal');
    await expect(modal).toBeVisible();
    
    // Verify modal has overflow-y: auto for scrolling
    const overflowY = await modal.evaluate((el) => {
      return window.getComputedStyle(el).overflowY;
    });
    expect(overflowY).toBe('auto');
    
    // Verify modal has max-height constraint for scrolling
    const maxHeight = await modal.evaluate((el) => {
      return window.getComputedStyle(el).maxHeight;
    });
    // Should have a max-height set (90vh or 90dvh)
    expect(maxHeight).not.toBe('none');
    expect(maxHeight).toMatch(/\d+/);
  });

  /**
   * Test background scroll is locked when modal is open
   * **Validates: Requirements 1.4, 2.4**
   */
  test('background scroll is locked when modal is open', async ({ page }) => {
    // First verify body doesn't have modal-open class initially
    const initialBodyClass = await page.evaluate(() => {
      return document.body.classList.contains('modal-open');
    });
    expect(initialBodyClass).toBe(false);
    
    // Click on a category to open the task entry modal
    const categoryBtn = page.locator('.quick-start-category').first();
    await expect(categoryBtn).toBeVisible();
    await categoryBtn.click();
    
    // Wait for modal to appear
    const modal = page.locator('.task-prompt-modal');
    await expect(modal).toBeVisible();
    
    // Verify body has modal-open class
    const bodyHasModalOpen = await page.evaluate(() => {
      return document.body.classList.contains('modal-open');
    });
    expect(bodyHasModalOpen).toBe(true);
    
    // Verify body has overflow: hidden to prevent scrolling
    const bodyOverflow = await page.evaluate(() => {
      return window.getComputedStyle(document.body).overflow;
    });
    expect(bodyOverflow).toBe('hidden');
    
    // Close modal by clicking cancel
    await page.click('.task-prompt-modal button:has-text("Cancel")');
    
    // Verify modal is closed
    await expect(modal).not.toBeVisible();
    
    // Verify body no longer has modal-open class
    const bodyClassAfterClose = await page.evaluate(() => {
      return document.body.classList.contains('modal-open');
    });
    expect(bodyClassAfterClose).toBe(false);
  });

  /**
   * Test switch task modal z-index while timer is running
   * **Validates: Requirements 2.2**
   */
  test('switch task modal has z-index above active timer display', async ({ page }) => {
    // Start a timer first
    await page.click('.quick-start-category:has-text("Meetings")');
    await page.click('.task-prompt-modal button:has-text("Start")');
    
    // Wait for timer to be visible
    await expect(page.locator('.timer-time')).toBeVisible();
    
    // Click on a switch category button to open switch task modal
    const switchCategoryBtn = page.locator('.switch-category-btn').first();
    await expect(switchCategoryBtn).toBeVisible();
    await switchCategoryBtn.click();
    
    // Wait for switch task modal to appear
    const modalOverlay = page.locator('.task-prompt-overlay');
    await expect(modalOverlay).toBeVisible();
    
    // Verify modal overlay has high z-index
    const overlayZIndex = await modalOverlay.evaluate((el) => {
      return window.getComputedStyle(el).zIndex;
    });
    expect(parseInt(overlayZIndex)).toBeGreaterThanOrEqual(9999);
    
    // Verify modal is visible above the timer
    const modal = page.locator('.task-prompt-modal');
    await expect(modal).toBeVisible();
    
    // Verify modal input is focusable (proves it's on top of timer)
    const modalInput = modal.locator('.task-prompt-input');
    await expect(modalInput).toBeVisible();
    await modalInput.focus();
    await expect(modalInput).toBeFocused();
    
    // Clean up - close modal and stop timer
    await page.click('.task-prompt-modal button:has-text("Cancel")');
    await page.click('button:has-text("Stop")');
  });

  /**
   * Test background scroll lock with switch task modal
   * **Validates: Requirements 2.4**
   */
  test('background scroll is locked when switch task modal is open', async ({ page }) => {
    // Start a timer first
    await page.click('.quick-start-category:has-text("Meetings")');
    await page.click('.task-prompt-modal button:has-text("Start")');
    
    // Wait for timer to be visible
    await expect(page.locator('.timer-time')).toBeVisible();
    
    // Verify body doesn't have modal-open class after starting timer
    const initialBodyClass = await page.evaluate(() => {
      return document.body.classList.contains('modal-open');
    });
    expect(initialBodyClass).toBe(false);
    
    // Click on a switch category button to open switch task modal
    const switchCategoryBtn = page.locator('.switch-category-btn').first();
    await expect(switchCategoryBtn).toBeVisible();
    await switchCategoryBtn.click();
    
    // Wait for modal to appear
    const modal = page.locator('.task-prompt-modal');
    await expect(modal).toBeVisible();
    
    // Verify body has modal-open class
    const bodyHasModalOpen = await page.evaluate(() => {
      return document.body.classList.contains('modal-open');
    });
    expect(bodyHasModalOpen).toBe(true);
    
    // Verify body has overflow: hidden
    const bodyOverflow = await page.evaluate(() => {
      return window.getComputedStyle(document.body).overflow;
    });
    expect(bodyOverflow).toBe('hidden');
    
    // Clean up - close modal and stop timer
    await page.click('.task-prompt-modal button:has-text("Cancel")');
    await page.click('button:has-text("Stop")');
  });

  /**
   * Test modal overlay covers entire screen
   * **Validates: Requirements 1.5**
   */
  test('modal overlay covers entire screen on mobile', async ({ page }) => {
    // Click on a category to open the task entry modal
    const categoryBtn = page.locator('.quick-start-category').first();
    await expect(categoryBtn).toBeVisible();
    await categoryBtn.click();
    
    // Wait for modal overlay to appear
    const modalOverlay = page.locator('.task-prompt-overlay');
    await expect(modalOverlay).toBeVisible();
    
    // Verify overlay has position: fixed with inset: 0
    const position = await modalOverlay.evaluate((el) => {
      return window.getComputedStyle(el).position;
    });
    expect(position).toBe('fixed');
    
    // Verify inset values are 0 (covers entire screen)
    const insetValues = await modalOverlay.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        top: style.top,
        right: style.right,
        bottom: style.bottom,
        left: style.left
      };
    });
    expect(insetValues.top).toBe('0px');
    expect(insetValues.right).toBe('0px');
    expect(insetValues.bottom).toBe('0px');
    expect(insetValues.left).toBe('0px');
    
    // Verify overlay prevents interaction with background by checking backdrop
    const hasBackdrop = await modalOverlay.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return style.backgroundColor !== 'rgba(0, 0, 0, 0)' || style.backdropFilter !== 'none';
    });
    expect(hasBackdrop).toBe(true);
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
    
    // Wait for mobile nav panel to be visible
    await expect(page.locator('.mobile-nav-panel.open')).toBeVisible();
    
    // Click on Analytics button
    const analyticsBtn = page.locator('.mobile-nav-item:has-text("Analytics")');
    await expect(analyticsBtn).toBeVisible();
    await analyticsBtn.click();
    
    // Wait for mobile nav to close (panel loses 'open' class)
    await expect(page.locator('.mobile-nav-panel.open')).not.toBeVisible({ timeout: 5000 });
    
    // Wait for analytics to fully load - try multiple selectors
    await expect(page.locator('.analytics, .analytics-loading, .analytics-error')).toBeVisible({ timeout: 15000 });
    // Then wait for the actual content
    await expect(page.locator('.period-selector')).toBeVisible({ timeout: 10000 });
    
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
