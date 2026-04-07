import { test, expect } from '@playwright/test';

/**
 * Safari CSS Compatibility Tests (Desktop)
 *
 * These tests verify CSS properties that are known to behave differently
 * in Safari/WebKit compared to Chromium/Firefox. They run on all desktop
 * browsers to ensure cross-browser consistency.
 */
test.describe('Safari CSS Compatibility — Desktop', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    await page.click('button:has-text("Continue as Guest")');
    await expect(page.locator('.desktop-nav')).toBeVisible();

    // Wait for categories to load
    await page.waitForFunction(
      () => document.querySelectorAll('.switch-category-select option').length > 2,
      { timeout: 15000 }
    );
  });

  test('category selector color dot does not overlap text', async ({ page }) => {
    // Select a category so the color indicator is visible
    await page.selectOption('.switch-category-select', { label: 'Meetings' });

    const wrapper = page.locator('.new-task-category-wrapper');
    const dot = wrapper.locator('.category-color-indicator');
    const select = wrapper.locator('.switch-category-select');

    await expect(dot).toBeVisible();
    await expect(select).toBeVisible();

    // The select must have appearance: none so padding-left is respected in Safari
    const selectStyles = await select.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        appearance: s.getPropertyValue('appearance'),
        webkitAppearance: s.getPropertyValue('-webkit-appearance'),
        paddingLeft: parseFloat(s.paddingLeft),
      };
    });

    expect(selectStyles.appearance).toBe('none');

    // The dot's right edge must not overlap the select's text start (padding-left)
    const dotBox = await dot.boundingBox();
    const selectBox = await select.boundingBox();
    expect(dotBox).not.toBeNull();
    expect(selectBox).not.toBeNull();

    // The text area starts at selectBox.x + paddingLeft
    const textStart = selectBox!.x + selectStyles.paddingLeft;
    const dotEnd = dotBox!.x + dotBox!.width;

    // Dot's right edge should be to the left of where text begins (with tolerance)
    expect(dotEnd).toBeLessThan(textStart + 1);
  });

  test('category selector has custom dropdown chevron', async ({ page }) => {
    const select = page.locator('.new-task-category-wrapper .switch-category-select');
    await expect(select).toBeVisible();

    // When appearance is none, a custom background-image chevron must be present
    const bgImage = await select.evaluate((el) => {
      return window.getComputedStyle(el).backgroundImage;
    });

    expect(bgImage).toContain('url(');
    expect(bgImage).not.toBe('none');
  });

  test('backdrop-filter has webkit prefix on header', async ({ page }) => {
    const header = page.locator('.app-header');
    await expect(header).toBeVisible();

    const styles = await header.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        backdropFilter: s.getPropertyValue('backdrop-filter'),
        webkitBackdropFilter: s.getPropertyValue('-webkit-backdrop-filter'),
      };
    });

    // At least one of the two should be active (browser normalizes to the one it supports)
    const hasBlur =
      (styles.backdropFilter && styles.backdropFilter !== 'none') ||
      (styles.webkitBackdropFilter && styles.webkitBackdropFilter !== 'none');
    expect(hasBlur).toBe(true);
  });

  test('backdrop-filter has webkit prefix on task prompt overlay', async ({ page }) => {
    // Start a timer to enable stop, then trigger the task-name prompt
    await page.selectOption('.switch-category-select', { label: 'Meetings' });
    await page.click('.start-btn');
    await expect(page.locator('.timer-time')).toBeVisible();

    // Stop the timer — this may show the task prompt overlay
    await page.click('button:has-text("Stop")');

    // Check if the overlay appeared (it only shows when description is empty)
    const overlay = page.locator('.task-prompt-overlay');
    const appeared = await overlay.isVisible().catch(() => false);

    if (appeared) {
      const styles = await overlay.evaluate((el) => {
        const s = window.getComputedStyle(el);
        return {
          backdropFilter: s.getPropertyValue('backdrop-filter'),
          webkitBackdropFilter: s.getPropertyValue('-webkit-backdrop-filter'),
        };
      });

      const hasBlur =
        (styles.backdropFilter && styles.backdropFilter !== 'none') ||
        (styles.webkitBackdropFilter && styles.webkitBackdropFilter !== 'none');
      expect(hasBlur).toBe(true);
    }
  });

  test('color picker has appearance reset for consistent rendering', async ({ page }) => {
    // The .color-picker class is on the InlineCategoryForm, which appears
    // when selecting "+ New category" from the category selector dropdown
    const select = page.locator('.switch-category-select');
    await select.selectOption('new');

    const colorPicker = page.locator('.color-picker').first();
    await expect(colorPicker).toBeVisible({ timeout: 5000 });

    const styles = await colorPicker.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        appearance: s.getPropertyValue('appearance'),
        webkitAppearance: s.getPropertyValue('-webkit-appearance'),
      };
    });

    expect(styles.appearance).toBe('none');
  });

  test('feature cards have isolation for Safari clipping', async ({ page }) => {
    // Navigate to the landing page (log out or visit root while logged out)
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();

    // The landing page should have feature cards
    const featureCard = page.locator('.feature-card').first();
    const isLanding = await featureCard.isVisible().catch(() => false);

    if (isLanding) {
      const isolation = await featureCard.evaluate((el) => {
        return window.getComputedStyle(el).isolation;
      });

      expect(isolation).toBe('isolate');
    }
  });
});
