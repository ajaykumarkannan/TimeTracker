import { test, expect } from '@playwright/test';

test.describe('Analytics Daily Breakdown Chart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    
    // Enter as guest
    await page.click('button:has-text("Continue as Guest")');
    await expect(page.locator('.app-nav')).toBeVisible();
  });

  test('displays stacked bar chart with category colors', async ({ page }) => {
    // Create time entries in different categories - wait longer to ensure minutes are recorded
    await page.click('.quick-start-category:has-text("Meetings")');
    await page.click('.task-prompt-modal button:has-text("Start")');
    await page.waitForTimeout(2000); // Wait 2 seconds to ensure at least 1 minute is recorded
    await page.click('button:has-text("Stop")');
    
    await page.click('.quick-start-category:has-text("Deep Work")');
    await page.click('.task-prompt-modal button:has-text("Start")');
    await page.waitForTimeout(2000);
    await page.click('button:has-text("Stop")');
    
    // Navigate to Analytics
    await page.click('text=Analytics');
    await page.waitForSelector('.daily-chart');
    
    // Verify chart is visible
    const dailyChart = page.locator('.daily-chart');
    await expect(dailyChart).toBeVisible();
    
    // Find today's bar (should have data)
    const todayBar = page.locator('.chart-bar-container.today');
    await expect(todayBar).toBeVisible();
    
    // Verify it has colored segments - wait for them to appear
    const segments = todayBar.locator('.chart-bar-segment');
    await expect(segments.first()).toBeVisible({ timeout: 10000 });
    const segmentCount = await segments.count();
    expect(segmentCount).toBeGreaterThan(0);
    
    // Verify segments have background colors
    const firstSegment = segments.first();
    const bgColor = await firstSegment.evaluate(el => 
      window.getComputedStyle(el).backgroundColor
    );
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(bgColor).not.toBe('transparent');
  });

  test('shows legend with category colors', async ({ page }) => {
    // Create a time entry - wait longer to ensure minutes are recorded
    await page.click('.quick-start-category:has-text("Meetings")');
    await page.click('.task-prompt-modal button:has-text("Start")');
    await page.waitForTimeout(2000);
    await page.click('button:has-text("Stop")');
    
    // Navigate to Analytics
    await page.click('text=Analytics');
    
    // Wait for chart to load first, then check for legend
    await page.waitForSelector('.daily-chart');
    
    // Legend only shows when there's data with categories that have minutes > 0
    // Wait for the legend to appear with a longer timeout
    await expect(page.locator('.chart-legend')).toBeVisible({ timeout: 10000 });
    
    // Verify legend exists with items
    const legend = page.locator('.chart-legend');
    const legendItems = legend.locator('.legend-item');
    const itemCount = await legendItems.count();
    expect(itemCount).toBeGreaterThan(0);
  });

  test('chart stays within container bounds', async ({ page }) => {
    // Create time entries
    await page.click('.quick-start-category:has-text("Meetings")');
    await page.click('.task-prompt-modal button:has-text("Start")');
    await page.waitForTimeout(2000);
    await page.click('button:has-text("Stop")');
    
    // Navigate to Analytics
    await page.click('text=Analytics');
    await page.waitForSelector('.daily-chart');
    
    // Get the card container and chart bounds
    const card = page.locator('.card:has(.daily-chart)');
    const chart = page.locator('.daily-chart');
    
    const cardBox = await card.boundingBox();
    const chartBox = await chart.boundingBox();
    
    // Chart should be within card bounds
    expect(chartBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
    expect(chartBox!.y).toBeGreaterThanOrEqual(cardBox!.y);
    expect(chartBox!.x + chartBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
  });
});
