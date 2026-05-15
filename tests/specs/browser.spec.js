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

  test('add_class applies the default hash_match class when no content extractor is configured', async ({ page, serviceWorker }) => { // eslint-disable-line no-unused-vars
    await page.goto('/links.html');
    await expect(page.locator('#link-0')).toHaveClass(/(^|\s)hash_match(\s|$)/);
  });

  test('add_class with content.within reads the hash input from a descendant and applies the class to the matched container', async ({ page, serviceWorker }) => { // eslint-disable-line no-unused-vars
    // Index 45 is www.tesco.co.uk → registrable domain tesco.co.uk (psl);
    // a naive last-two-labels transform would yield co.uk and miss it.
    const EXPECTED_MATCHES = [5, 10, 11, 14, 18, 19, 22, 23, 37, 45, 48];

    const collect = async () => page.evaluate(() => {
      const matched = [];
      document.querySelectorAll("li[id^='li-']").forEach((li) => {
        if (li.classList.contains('hash_test_within_marker')) {
          matched.push(parseInt(li.id.slice('li-'.length), 10));
        }
      });
      return matched.sort((a, b) => a - b);
    });

    await page.goto('/links.html');
    await expect.poll(collect, { timeout: 5000 }).toEqual(EXPECTED_MATCHES);
  });

  test('add_class reports evaluated and matched counts via logEvent', async ({ page, serviceWorker }) => {
    await page.goto('/links.html');
    await page.waitForTimeout(2000); // allow the debounced telemetry flush to fire

    const events = await serviceWorker.evaluate(() => self['capturedLogEvents'] || []);

    // Merge every page-manipulation event's updates (counts are deltas).
    const merged = {};
    for (const e of events) {
      if (e.name !== 'page-manipulation') continue;
      for (const [k, v] of Object.entries(e.updates || {})) {
        merged[k] = (merged[k] || 0) + v;
      }
    }

    // hash_test_marker rule: a[id^='link-'] (50 elements), fraction 0.2.
    expect(merged["a[id^='link-']::hash_test_marker::evaluated"]).toBe(50);
    expect(merged["a[id^='link-']::hash_test_marker::matched"]).toBe(11);

    // hash_exception_marker rule: youtube.com is excluded *before* the hash,
    // so it counts as neither evaluated nor matched — 49 evaluated, 10 matched.
    expect(merged["a[id^='link-']::hash_exception_marker::evaluated"]).toBe(49);
    expect(merged["a[id^='link-']::hash_exception_marker::matched"]).toBe(10);
  });

  test('add_class with exceptions never classes listed content even when it is in the window', async ({ page, serviceWorker }) => { // eslint-disable-line no-unused-vars
    // offset=0, fraction=0.2 window is [5,10,11,14,18,19,22,23,37,45,48].
    // Index 5 is youtube.com (see tests/src/links.html). With
    // exceptions: ["youtube.com"], index 5 must be excluded.
    const EXPECTED_WITH_EXCEPTION = [10, 11, 14, 18, 19, 22, 23, 37, 45, 48];

    const collect = async () => page.evaluate(() => {
      const matched = [];
      document.querySelectorAll("a[id^='link-']").forEach((a) => {
        if (a.classList.contains('hash_exception_marker')) {
          matched.push(parseInt(a.id.slice('link-'.length), 10));
        }
      });
      return matched.sort((a, b) => a - b);
    });

    await page.goto('/links.html');
    await expect.poll(collect, { timeout: 5000 }).toEqual(EXPECTED_WITH_EXCEPTION);
  });

  test('add_class with offset selects the hash window [offset, offset+fraction)', async ({ page, serviceWorker }) => { // eslint-disable-line no-unused-vars
    // Precomputed by tests/scripts/compute-expected-matches.js for offset=0.2,
    // fraction=0.2 — i.e. hash position in [0.2, 0.4). Disjoint from the
    // offset=0 set, confirming the window shifted rather than widened.
    const EXPECTED_OFFSET_MATCHES = [0, 1, 20, 24, 25, 29, 42];

    const collect = async () => page.evaluate(() => {
      const matched = [];
      document.querySelectorAll("a[id^='link-']").forEach((a) => {
        if (a.classList.contains('hash_offset_marker')) {
          matched.push(parseInt(a.id.slice('link-'.length), 10));
        }
      });
      return matched.sort((a, b) => a - b);
    });

    await page.goto('/links.html');
    await expect.poll(collect, { timeout: 5000 }).toEqual(EXPECTED_OFFSET_MATCHES);
  });

  test('add_class with fraction hashes domains deterministically and selects exactly the precomputed indices', async ({ page, serviceWorker }) => { // eslint-disable-line no-unused-vars
    // Precomputed by tests/scripts/compute-expected-matches.js for sha256 over
    // each fixture link's registrable domain, last-8-hex-chars / 2^32 < 0.2:
    const EXPECTED_MATCHES = [5, 10, 11, 14, 18, 19, 22, 23, 37, 45, 48];

    const collect = async () => {
      const out = await page.evaluate(() => {
        const matched = [];
        document.querySelectorAll("a[id^='link-']").forEach((a) => {
          if (a.classList.contains('hash_test_marker')) {
            matched.push(parseInt(a.id.slice('link-'.length), 10));
          }
        });
        return matched.sort((a, b) => a - b);
      });
      return out;
    };

    await page.goto('/links.html');
    await expect.poll(collect, { timeout: 5000 }).toEqual(EXPECTED_MATCHES);

    // Determinism on reload.
    await page.reload();
    await expect.poll(collect, { timeout: 5000 }).toEqual(EXPECTED_MATCHES);
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
