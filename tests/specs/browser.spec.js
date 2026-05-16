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

  // Indices of fixture elements (id="<prefix><N>") carrying `className`.
  // Expected arrays below are precomputed by tests/scripts/compute-expected-matches.js.
  const classedIndices = (page, selector, className, prefix) => page.evaluate(
    ([sel, cls, pre]) => {
      const out = [];
      document.querySelectorAll(sel).forEach((el) => {
        if (el.classList.contains(cls)) out.push(parseInt(el.id.slice(pre.length), 10));
      });
      return out.sort((a, b) => a - b);
    },
    [selector, className, prefix]
  );

  // Merge every captured page-manipulation logEvent (counts/lists are per-pass deltas).
  const mergedTelemetry = async (serviceWorker) => {
    const events = await serviceWorker.evaluate(() => self['capturedLogEvents'] || []);
    const updates = {}, domains = {};
    for (const e of events) {
      if (e.name !== 'page-manipulation') continue;
      for (const [k, v] of Object.entries(e.updates || {})) updates[k] = (updates[k] || 0) + v;
      for (const [k, list] of Object.entries(e.domains || {})) {
        if (!domains[k]) domains[k] = [];
        domains[k].push(...list);
      }
    }
    return { updates, domains };
  };

  test('add_class with no conditions applies the class unconditionally', async ({ page, serviceWorker }) => { // eslint-disable-line no-unused-vars
    await page.goto('/links.html');
    await expect(page.locator('#link-0')).toHaveClass(/(^|\s)hash_match(\s|$)/);
  });

  test('add_class condition selects exactly the within_range indices', async ({ page, serviceWorker }) => { // eslint-disable-line no-unused-vars
    // calculate-sha512-hash, use [0,8], within_range ["00000000","40000000").
    const EXPECTED = [1, 2, 9, 11, 20, 21, 22, 23, 29, 39, 41, 42, 47];

    await page.goto('/links.html');
    await expect.poll(() => classedIndices(page, "a[id^='link-']", 'range_marker', 'link-'),
      { timeout: 5000 }).toEqual(EXPECTED);

    // Deterministic on reload — same hashes, same matches.
    await page.reload();
    await expect.poll(() => classedIndices(page, "a[id^='link-']", 'range_marker', 'link-'),
      { timeout: 5000 }).toEqual(EXPECTED);
  });

  test('add_class content.within reads the hash input from a descendant', async ({ page, serviceWorker }) => { // eslint-disable-line no-unused-vars
    // The rule matches <li> but hashes the descendant <a>'s href, so it
    // selects the same indices as the range rule above. Index 45 is
    // www.tesco.co.uk → registrable domain tesco.co.uk (psl); a naive
    // last-two-labels transform would yield co.uk and hash differently.
    const EXPECTED = [1, 2, 9, 11, 20, 21, 22, 23, 29, 39, 41, 42, 47];

    await page.goto('/links.html');
    await expect.poll(() => classedIndices(page, "li[id^='li-']", 'within_marker', 'li-'),
      { timeout: 5000 }).toEqual(EXPECTED);
  });

  test('add_class exceptions veto a domain even when it is in range', async ({ page, serviceWorker }) => { // eslint-disable-line no-unused-vars
    // Same condition as the range rule, but exceptions: ["wikipedia.org"].
    // wikipedia.org is index 1 and *is* in range — so it must drop out.
    const EXPECTED = [2, 9, 11, 20, 21, 22, 23, 29, 39, 41, 42, 47];

    await page.goto('/links.html');
    await expect.poll(() => classedIndices(page, "a[id^='link-']", 'exception_marker', 'link-'),
      { timeout: 5000 }).toEqual(EXPECTED);
  });

  test('add_class conditions_match "all" classes only elements passing every condition', async ({ page, serviceWorker }) => { // eslint-disable-line no-unused-vars
    // Two conditions on disjoint hash slices (use [0,8] and [8,16]), AND.
    const EXPECTED = [1, 2, 9, 10, 11, 14, 16, 21, 22, 23, 27, 29, 35, 38, 49];

    await page.goto('/links.html');
    await expect.poll(() => classedIndices(page, "a[id^='link-']", 'all_marker', 'link-'),
      { timeout: 5000 }).toEqual(EXPECTED);
  });

  test('add_class conditions_match "any" classes elements passing at least one condition', async ({ page, serviceWorker }) => { // eslint-disable-line no-unused-vars
    // Same two conditions, OR — a strict superset of the "all" set.
    const EXPECTED = [0, 1, 2, 5, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18, 20, 21, 22, 23,
                      24, 25, 27, 28, 29, 35, 37, 38, 39, 41, 42, 43, 45, 46, 47, 49];

    await page.goto('/links.html');
    await expect.poll(() => classedIndices(page, "a[id^='link-']", 'any_marker', 'link-'),
      { timeout: 5000 }).toEqual(EXPECTED);
  });

  test('add_class reports evaluated and matched counts via logEvent', async ({ page, serviceWorker }) => {
    await page.goto('/links.html');
    await page.waitForTimeout(1500); // let the initial + mutation passes settle

    const { updates } = await mergedTelemetry(serviceWorker);

    // range_marker rule: all 50 links evaluated, 13 in range.
    expect(updates["a[id^='link-']::range_marker::evaluated"]).toBe(50);
    expect(updates["a[id^='link-']::range_marker::matched"]).toBe(13);

    // exception_marker rule: all 50 evaluated; wikipedia.org would be the 13th
    // match but is vetoed by exceptions, leaving 12 matched.
    expect(updates["a[id^='link-']::exception_marker::evaluated"]).toBe(50);
    expect(updates["a[id^='link-']::exception_marker::matched"]).toBe(12);
  });

  test('add_class logs the exact matched and unmatched domain lists via logEvent', async ({ page, serviceWorker }) => {
    await page.goto('/links.html');
    await page.waitForTimeout(1500);

    const { domains } = await mergedTelemetry(serviceWorker);
    const matched = domains["a[id^='link-']::range_marker::matched"] || [];
    const unmatched = domains["a[id^='link-']::range_marker::unmatched"] || [];

    expect(matched.length).toBe(13);
    expect(unmatched.length).toBe(37);
    expect(matched.length + unmatched.length).toBe(50);

    // Logged values are registrable domains. tesco.co.uk (index 45, from
    // www.tesco.co.uk) proves the eTLD+1 is logged — not the full host, and
    // not the naive last-two-labels "co.uk".
    expect(unmatched).toContain('tesco.co.uk'); // index 45, out of range
    expect(matched).toContain('wikipedia.org'); // index 1, in range
    expect(unmatched).toContain('google.com');  // index 0, out of range
  });

  test('add_class logs exception-vetoed domains in a separate excepted list', async ({ page, serviceWorker }) => {
    await page.goto('/links.html');
    await page.waitForTimeout(1500);

    const { domains } = await mergedTelemetry(serviceWorker);

    // exception_marker has exceptions: ["wikipedia.org"]; the fixture has it
    // exactly once (index 1). It lands in `excepted` — not matched/unmatched.
    expect(domains["a[id^='link-']::exception_marker::excepted"] || []).toEqual(['wikipedia.org']);
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
