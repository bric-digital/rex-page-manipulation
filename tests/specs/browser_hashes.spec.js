import { test, expect } from './fixtures.js';

test.describe.configure({ mode: 'serial' });

const startupDelay = 2500

const linksPageURL = 'http://localhost:3000/hashes/links.html'

test.describe('REX Page Manipulation: Hash Generation and Manipulation', () => {
  test('add_class with no conditions...', async ({ page, serviceWorker }) => {
    await page.waitForTimeout(startupDelay);

    await page.goto(linksPageURL);

    // link-0 - google.com => a5b5955a4db31736f9dfd45c89c12331e0370074fc7fec0ac4d189a62391bf7060287f957ce67cf3adcac7a4353a7a8241e33084a9b543cbb3f39770970a41b2 
    // Expected:
    // no_conditions (Rule 1)
    // any_marker (Rule 6)

    await expect(await page.locator('#link-0')).toContainClass('no_conditions');
    await expect(await page.locator('#link-0')).toContainClass('any_marker');
    await expect(await page.locator('#link-0')).not.toContainClass('range_marker');
    await expect(await page.locator('#li-0')).not.toContainClass('within_marker');
    await expect(await page.locator('#link-0')).not.toContainClass('all_marker');
    await expect(await page.locator('#link-0')).not.toContainClass('exception_marker');

    // link-1 - wikipedia.org => 2f4408153301bcd66a41017e7fce2e2cc7ea73cbd073945eb10d4b5ba1eeaa1dd45b219b91e5e0e20aa33d380d69a190e1f6c3f4b78dad8651541e685346636a
    // Expected:
    // range_marker (Rule 2)
    // within_marker - parent (Rule 3)
    // all_marker (Rule 5)
    // any_marker (Rule 6)

    await expect(await page.locator('#link-1')).toContainClass('range_marker');
    await expect(await page.locator('#li-1')).toContainClass('within_marker');
    await expect(await page.locator('#link-1')).toContainClass('all_marker');
    await expect(await page.locator('#link-1')).toContainClass('any_marker');

    await expect(await page.locator('#link-1')).not.toContainClass('no_conditions');
    await expect(await page.locator('#link-1')).not.toContainClass('exception_marker');


    // link-2 - github.com => 2ab8f40a085ba6d3f058c58a37f1e9a0e15da980b2f428b77e2787563b35e658878d388ee30380d4e92041d769a369b6bd3493a47c50dab68bd851cf564bfa5a
    // Expected:
    // range_marker (Rule 2)
    // within_marker - parent (Rule 3)
    // exception_marker (Rule 4)
    // all_marker (Rule 5)
    // any_marker (Rule 6)

    await expect(await page.locator('#link-2')).toContainClass('range_marker');
    await expect(await page.locator('#li-2')).toContainClass('within_marker');
    await expect(await page.locator('#link-2')).toContainClass('exception_marker');
    await expect(await page.locator('#link-2')).toContainClass('all_marker');
    await expect(await page.locator('#link-2')).toContainClass('any_marker');

    await expect(await page.locator('#link-2')).not.toContainClass('no_conditions');


    // link-3 - stackoverflow.com => ad2e4295ac7bc40ab814cf19c42bc30f8b4c627f7620370dfc35332f215d3cdec8a355bcd309d7a9b65f54823dc30de04e4789a9dc340f8d5d57bb80cb760f5f

    await expect(await page.locator('#link-3')).toContainClass('');


    // link-4 - reddit.com => f750db39abd5720bc1278405ac2f43876e42d5edf14b2ea52fc9599c9369be01346b86daa863440ca4b8d6164ff9d831f465b458d5ae43806922a27f2e00cfc8

    await expect(await page.locator('#link-4')).toContainClass('');


    // link-5 - youtube.com => ae0755740e4354ac67025056e775ad06d8a529ae4f37244fbb02d72199e2c780311e47aa9895079b980ec4bfa676f1f39c4ab41ea995c524e52bde9a73623da2

    await expect(await page.locator('#link-5')).toContainClass('');


    // link-6 - amazon.com => 8a08a8aee567737960f78d227f2620c23f0c3f3896a989748708a20dcf241c4eebd82b736277b1ec2289b7b20fa305f5400881d62035c441806e1e1c8c354a3d

    await expect(await page.locator('#link-6')).toContainClass('');


    // link-7 - twitter.com => 8fa36e29f52b5b2747e39900c5d344b0bf344038970360dc190e9793b02ebd4286d550f9a41fc20876dc8e3bb0c970d28de299f13eeee24cc529f73ef91dda2f

    await expect(await page.locator('#link-7')).toContainClass('');


    // link-8 - facebook.com => 5a5de8179e30fee574f0d878bdf28f77870d91f81aa78d99dca3b0ae1272753e45928f11e7fa6ab13aa4ed4fb33a7fc27562a8b38deab47987643ad715ac32fa
    // any_marker (Rule 6)

    await expect(await page.locator('#link-8')).toContainClass('any_marker');

    await expect(await page.locator('#link-8')).not.toContainClass('range_marker');
    await expect(await page.locator('#li-8')).not.toContainClass('within_marker');
    await expect(await page.locator('#link-8')).not.toContainClass('exception_marker');
    await expect(await page.locator('#link-8')).not.toContainClass('all_marker');
    await expect(await page.locator('#link-8')).not.toContainClass('no_conditions');


    // link-9 - instagram.com => 2b33a0ed5d03503602c09d1b8bf607b5bbaf22880d89c831fe1bdae8c01e8914a07ab70159885e9ef2989ff0d8c73d5c0169628226554de05a645fe5e2ad3c17
    // Expected:
    // range_marker (Rule 2)
    // within_marker - parent (Rule 3)
    // exception_marker (Rule 4)
    // all_marker (Rule 5)
    // any_marker (Rule 6)

    await expect(await page.locator('#link-9')).toContainClass('range_marker');
    await expect(await page.locator('#li-9')).toContainClass('within_marker');
    await expect(await page.locator('#link-9')).toContainClass('exception_marker');
    await expect(await page.locator('#link-9')).toContainClass('any_marker');
    await expect(await page.locator('#link-9')).toContainClass('all_marker');
    
    await expect(await page.locator('#link-9')).not.toContainClass('no_conditions');

    
    // link-10 - linkedin.com => 76fe07f80b300d2c955896bf5449097b98659921c8a270bb6cb6c7a0fdaaeca48124f5c8174c55286b68e02b0dd59fed5bd074093488020680dcb5420c24b72c
    // all_marker (Rule 5)
    // any_marker (Rule 6)

    await expect(await page.locator('#link-10')).toContainClass('all_marker');
    await expect(await page.locator('#link-10')).toContainClass('any_marker');
    
    await expect(await page.locator('#link-10')).not.toContainClass('range_marker');
    await expect(await page.locator('#li-10')).not.toContainClass('within_marker');
    await expect(await page.locator('#link-10')).not.toContainClass('exception_marker');
    await expect(await page.locator('#link-10')).not.toContainClass('no_conditions');

    await expect(await page.locator('#link-101')).toContainClass('yahoo_domain');
    await expect(await page.locator('#link-102')).toContainClass('yahoo_domain');
    await expect(await page.locator('#link-103')).toContainClass('google_com_exact');
    await expect(await page.locator('#link-104')).toContainClass('local_google_com_exact');
  });
})
