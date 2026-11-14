const assert = require('assert');
const { chromium } = require('playwright');
const { buildGeoSignalsV1 } = require('../index.js').__lightBudgetTestHooks;

(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.route('https://fixture.example.test/**', (route) => route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: [
        '<div class="global-links">',
        '<a href="/company/">会社概要</a>',
        '<a href="/contact/">お問い合わせ</a>',
        '<a href="/service/">サービス</a>',
        '<a href="/assets/guide.pdf">PDF</a>',
        '<a href="https://external.example.test/company/">外部会社</a>',
        '<a href="#menu">メニュー</a>',
        '</div>'
      ].join('')
    }));
    await page.goto('https://fixture.example.test/', { waitUntil: 'domcontentloaded' });
    const signals = await buildGeoSignalsV1(page, 'https://fixture.example.test/', { balancedMode: false, shortFastMode: false });
    const links = signals.observed.links;
    assert.deepStrictEqual(links.navTextsSample, []);
    assert.deepStrictEqual(links.canonicalNavigationLinkTexts, ['会社概要', 'お問い合わせ', 'サービス']);
    assert.strictEqual(links.canonicalNavigationLinkCount, 3);
    assert.strictEqual(links.canonicalNavigationLinkObservation.complete, true);
    await page.close();
    console.log('canonical navigation link observation fixtures: PASS');
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
