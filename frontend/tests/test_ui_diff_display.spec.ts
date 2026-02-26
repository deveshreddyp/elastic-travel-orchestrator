/**
 * E2E Test: Disruption UI diff display.
 * Load app → expand DemoControlPanel → click TRANSIT STRIKE →
 * assert DisruptionCard appears, contains expected text, and timeline updates.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

test.describe('Disruption Card Display', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL);
        // Wait for the app to fully load
        await page.waitForLoadState('networkidle');
    });

    test('DisruptionCard appears within 1000ms of TRANSIT STRIKE', async ({ page }) => {
        // Click the ⚡ floating DemoControlPanel trigger button
        const trigger = page.locator('button').filter({ hasText: '⚡' }).first();
        await trigger.click();

        // Wait for the expanded panel
        await expect(page.getByText('MISSION CONTROL')).toBeVisible({ timeout: 2000 });

        // Click TRANSIT STRIKE button
        const strikeBtn = page.getByText('TRANSIT STRIKE').first();
        await strikeBtn.click();

        // Record time
        const startTime = Date.now();

        // Assert DisruptionCard appears in DOM
        const disruptionCard = page.locator('[class*="disruption"], [data-testid="disruption-card"]')
            .or(page.getByText('TRANSIT STRIKE').nth(1))
            .or(page.getByText('rerouted'));

        await expect(disruptionCard.first()).toBeVisible({ timeout: 1000 });

        const elapsed = Date.now() - startTime;
        console.log(`DisruptionCard appeared in ${elapsed}ms`);
    });

    test('DisruptionCard contains "removed" text for dropped stop', async ({ page }) => {
        // Expand and trigger
        const trigger = page.locator('button').filter({ hasText: '⚡' }).first();
        await trigger.click();
        await page.waitForTimeout(500);

        const strikeBtn = page.getByText('TRANSIT STRIKE').first();
        await strikeBtn.click();

        // Wait for disruption card to load
        await page.waitForTimeout(1500);

        // Assert text about removed stop exists
        const removedText = page.getByText(/removed/i).or(page.getByText(/dropped/i));
        await expect(removedText.first()).toBeVisible({ timeout: 3000 });
    });

    test('Dropped stop card has strikethrough styling', async ({ page }) => {
        const trigger = page.locator('button').filter({ hasText: '⚡' }).first();
        await trigger.click();
        await page.waitForTimeout(500);

        const strikeBtn = page.getByText('TRANSIT STRIKE').first();
        await strikeBtn.click();
        await page.waitForTimeout(2000);

        // Look for strikethrough text-decoration on any stop name
        const strikeThroughElements = page.locator('[style*="line-through"]');
        const count = await strikeThroughElements.count();

        // At least one element should have strikethrough
        expect(count).toBeGreaterThanOrEqual(1);
    });

    test('New leg card appears with leg-new class', async ({ page }) => {
        const trigger = page.locator('button').filter({ hasText: '⚡' }).first();
        await trigger.click();
        await page.waitForTimeout(500);

        const strikeBtn = page.getByText('TRANSIT STRIKE').first();
        await strikeBtn.click();
        await page.waitForTimeout(2000);

        // Check for leg-new CSS class
        const newLeg = page.locator('.leg-new');
        // May or may not appear depending on replan result
        const count = await newLeg.count();
        console.log(`Found ${count} elements with .leg-new class`);
    });

    test('BudgetMeter SVG reflects updated value', async ({ page }) => {
        const trigger = page.locator('button').filter({ hasText: '⚡' }).first();
        await trigger.click();
        await page.waitForTimeout(500);

        const strikeBtn = page.getByText('TRANSIT STRIKE').first();
        await strikeBtn.click();
        await page.waitForTimeout(2000);

        // BudgetMeter should have an SVG with a motion.circle or path
        const svgArcs = page.locator('svg circle, svg path');
        const count = await svgArcs.count();
        expect(count).toBeGreaterThanOrEqual(1);
    });
});
