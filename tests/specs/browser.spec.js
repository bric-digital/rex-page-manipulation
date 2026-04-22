import { test, expect } from './fixtures.js';

test.describe('REX Page Manipulation', () => {

  /**
   * Commenting out as declarative net blocks don't seem to work in this
   * environment
   *
  test('Test that page redirects work.', async ({ page }) => {
    await page.goto('https://www.coca-cola.com/');

    // await page.waitForURL('https://www.pepsi.com/')

    await page.waitForTimeout(1000);

    expect(page).toHaveURL('https://www.coca-cola.com/');
  });
   *
   */

  test('Test that page manipulations work.', async ({ page }) => {
    await page.goto(`https://www.wikipedia.org/`);

    const englishLink = await page.locator('css=#js-link-box-en');
    await expect(englishLink).toBeHidden()
  });

  test('Test that initial page obfuscation works.', async ({ page }) => {
    const body = await page.locator('css=body')

    await page.goto(`https://archive.org/`)

    await expect.poll(async () => {
      const opacity = await page.evaluate(() => {
        const body = document.querySelector('html')

        return window.getComputedStyle(body).getPropertyValue('opacity');
      });

      return opacity;
    }).toBe('0');    

    await expect.poll(async () => {
      const opacity = await page.evaluate(() => {
        const body = document.querySelector('html')

        return window.getComputedStyle(body).getPropertyValue('opacity');
      });

      return opacity;
    }).toBe('1');    
  })
})
