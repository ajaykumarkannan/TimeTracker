import { test, expect } from '@playwright/test';

test.describe('Analytics Daily Breakdown Chart', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    
    // Enter as guest
    await page.click('button:has-text("Continue as Guest")');
    await expect(page.locator('.desktop-nav')).toBeVisible();
    
    // Wait for the app to fully initialize — sessionId is created on first API call
    // Poll until sessionId appears in localStorage (set after categories are fetched)
    await page.waitForFunction(() => localStorage.getItem('sessionId') !== null, null, { timeout: 10000 });
    
    const sessionId = await page.evaluate(() => localStorage.getItem('sessionId'));
    expect(sessionId).toBeTruthy();
    
    // Fetch categories — retry on rate limiting
    let categories: { id: number; name: string }[] = [];
    for (let attempt = 0; attempt < 5; attempt++) {
      const resp = await page.request.get('/api/categories', {
        headers: { 'X-Session-ID': sessionId! }
      });
      if (resp.ok()) {
        categories = await resp.json();
        break;
      }
      if (resp.status() === 429) {
        await page.waitForTimeout(2000 * (attempt + 1));
      }
    }
    expect(categories.length).toBeGreaterThan(0);
    
    // Use the first two categories (should be Meetings and Deep Work)
    const category1 = categories[0];
    const category2 = categories[1] || categories[0];
    
    // Create test time entries via API with proper duration
    const today = new Date();
    today.setHours(9, 0, 0, 0);
    const startTime1 = today.toISOString();
    today.setHours(10, 30, 0, 0);
    const endTime1 = today.toISOString();
    today.setHours(11, 0, 0, 0);
    const startTime2 = today.toISOString();
    today.setHours(12, 0, 0, 0);
    const endTime2 = today.toISOString();
    
    // Create entries using the time-entries API (POST /)
    const entry1Response = await page.request.post('/api/time-entries', {
      headers: { 'X-Session-ID': sessionId! },
      data: {
        category_id: category1.id,
        start_time: startTime1,
        end_time: endTime1,
        task_name: 'Test meeting'
      }
    });
    
    const entry2Response = await page.request.post('/api/time-entries', {
      headers: { 'X-Session-ID': sessionId! },
      data: {
        category_id: category2.id,
        start_time: startTime2,
        end_time: endTime2,
        task_name: 'Test deep work'
      }
    });
    
    // Verify entries were created successfully
    expect(entry1Response.ok()).toBeTruthy();
    expect(entry2Response.ok()).toBeTruthy();
    
    // Reload to ensure data is fetched
    await page.reload();
    await expect(page.locator('.desktop-nav')).toBeVisible();
    
    // Wait for categories to load into the select after reload
    await page.waitForFunction(
      () => document.querySelectorAll('.new-task-inline .switch-category-select option').length > 2,
      { timeout: 15000 }
    );
  });

  test('displays stacked bar chart with category colors', async ({ page }) => {
    // Navigate to Analytics using desktop nav button
    await page.click('.desktop-nav button:has-text("Analytics")');
    await page.waitForSelector('.daily-chart');
    
    // Verify chart is visible
    const dailyChart = page.locator('.daily-chart');
    await expect(dailyChart).toBeVisible();
    
    // Wait for data to load - the chart should have bars with data
    const chartBars = page.locator('.chart-bar-container');
    await expect(chartBars.first()).toBeVisible({ timeout: 10000 });
    
    // Verify it has colored segments (wait for them to appear)
    const anySegments = page.locator('.chart-bar-segment');
    await expect(anySegments.first()).toBeVisible({ timeout: 10000 });
    const anyCount = await anySegments.count();
    expect(anyCount).toBeGreaterThan(0);
    
    // Verify segments have background colors
    const firstSegment = anySegments.first();
    const bgColor = await firstSegment.evaluate(el => 
      window.getComputedStyle(el).backgroundColor
    );
    expect(bgColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(bgColor).not.toBe('transparent');
  });

  test('shows legend with category colors', async ({ page }) => {
    // Navigate to Analytics using desktop nav button
    await page.click('.desktop-nav button:has-text("Analytics")');
    await page.waitForSelector('.daily-chart');
    
    // Legend shows when there's data with categories that have minutes > 0
    await expect(page.locator('.chart-legend')).toBeVisible({ timeout: 5000 });
    
    // Verify legend exists with items
    const legend = page.locator('.chart-legend');
    const legendItems = legend.locator('.legend-item');
    const itemCount = await legendItems.count();
    expect(itemCount).toBeGreaterThan(0);
  });

  test('chart stays within container bounds', async ({ page }) => {
    // Navigate to Analytics using desktop nav button
    await page.click('.desktop-nav button:has-text("Analytics")');
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
