import { test, expect } from './fixtures.js';

const startupDelay = 2500

test.describe('REX Page Manipulation', () => {
  test('Validate extension loaded.', async ({ page, extensionId }) => {
    await page.waitForTimeout(startupDelay);

    await page.goto(`chrome-extension://${extensionId}/index.html`);
    await expect(page).toHaveTitle(/REX Page Manipulation Testing Extension/);
  });
});
