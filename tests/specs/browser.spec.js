import { test, expect } from '@playwright/test';

/**
 * Comprehensive test suite for rex-page-manipulation module.
 */

test.describe('REX - Page Manipulation - Browser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/browser.html');
    await page.waitForFunction(() => window.testUtilitiesReady === true);
  });

  test('Validate page loaded.', async ({ page }) => {
    await expect(page).toHaveTitle(/Page Manipulation Browser Test Page/);
  });
});
