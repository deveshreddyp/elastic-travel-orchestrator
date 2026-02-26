/**
 * E2E Test: Undo flow.
 * Trigger replan → assert UNDO visible → click UNDO → assert original restored.
 * Trigger replan again → wait 31s → assert UNDO disabled/removed.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

test.describe('Undo Flow', () => {

    test.beforeEach(async ({ page }) => {
        await page.goto(BASE_URL);
        await page.waitForLoadState('networkidle');
    });

    test('UNDO button appears after replan and restores original', async ({ page }) => {
        // Expand demo panel
        const trigger = page.locator('button').filter({ hasText: '⚡' }).first();
        await trigger.click();
        await page.waitForTimeout(500);

        // Trigger disruption
        const strikeBtn = page.getByText('TRANSIT STRIKE').first();
        await strikeBtn.click();
        await page.waitForTimeout(2000);

        // Assert UNDO button is visible with countdown
        const undoBtn = page.getByText(/UNDO/i).first();
        await expect(undoBtn).toBeVisible({ timeout: 3000 });

        // Click UNDO
        await undoBtn.click();
        await page.waitForTimeout(1500);

        // After undo, the disruption card should have exited
        // and we should see the original stops without strikethrough
        const strikeThroughElements = page.locator('[style*="line-through"]');
        const count = await strikeThroughElements.count();
        // Should be 0 after undo
        expect(count).toBe(0);
    });

    test('UNDO button becomes disabled after 31s timeout', async ({ page }) => {
        test.setTimeout(60_000); // This test needs a long timeout

        // Expand demo panel
        const trigger = page.locator('button').filter({ hasText: '⚡' }).first();
        await trigger.click();
        await page.waitForTimeout(500);

        // Trigger disruption
        const strikeBtn = page.getByText('TRANSIT STRIKE').first();
        await strikeBtn.click();
        await page.waitForTimeout(2000);

        // Assert UNDO is initially visible
        const undoBtn = page.getByText(/UNDO/i).first();
        await expect(undoBtn).toBeVisible({ timeout: 3000 });

        // Wait 31 seconds for timeout
        await page.waitForTimeout(31_000);

        // After 31s, UNDO should be disabled or removed
        const isDisabled = await undoBtn.isDisabled().catch(() => true);
        const isHidden = await undoBtn.isHidden().catch(() => true);

        expect(isDisabled || isHidden).toBeTruthy();
    });
});
