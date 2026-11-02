const assert = require('assert');
const { chromium } = require('playwright');
const { buildGeoSignalsV1 } = require('../index.js').__lightBudgetTestHooks;

async function observe(html, name) {
  const page = await globalThis.__legalFooterBrowser.newPage();
  try {
    const url = `https://${name}.example.test/`;
    await page.setContent(`<base href="${url}">${html}`, { waitUntil: 'domcontentloaded' });
    return await buildGeoSignalsV1(page, url, { balancedMode: false, shortFastMode: false });
  } finally {
    await page.close();
  }
}

function footer(signals) {
  return signals.coverage.footerSignals;
}

(async () => {
  globalThis.__legalFooterBrowser = await chromium.launch({ headless: true });
  try {
    const semantic = await observe('<footer><a href="/privacy">Privacy Policy</a><a href="/terms">Terms</a></footer>', 'semantic');
    assert.equal(footer(semantic).observed, true);
    assert.equal(footer(semantic).hasPrivacyLink, true);
    assert.equal(footer(semantic).hasTermsLink, true);

    const explicit = await observe('<div id="site-footer"><ul><li><a href="/privacy">Privacy Policy</a></li><li><a href="/security">Security Policy</a></li></ul></div>', 'explicit');
    assert.equal(footer(explicit).observed, true, 'one visible explicit footer root is a complete footer scope');
    assert.equal(footer(explicit).linkCount, 2);
    assert.equal(footer(explicit).hasPrivacyLink, true);
    assert.equal(footer(explicit).hasTermsLink, false, 'privacy alone remains distinct from terms/legal evidence');

    const arbitrary = await observe('<div class="page-bottom"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms</a></div>', 'arbitrary');
    assert.equal(footer(arbitrary).observed, false, 'an arbitrary bottom-page div is not a footer');
    assert.equal(footer(arbitrary).hasTermsLink, null);

    const ambiguous = await observe('<div id="desktop-footer"><a href="/terms">Terms</a></div><div id="mobile-footer"><a href="/privacy">Privacy Policy</a></div>', 'ambiguous');
    assert.equal(footer(ambiguous).observed, false, 'multiple visible explicit footer roots are rejected as ambiguous');
    assert.equal(footer(ambiguous).hasPrivacyLink, null);

    const hidden = await observe('<div id="site-footer" hidden><a href="/terms">Terms</a></div>', 'hidden');
    assert.equal(footer(hidden).observed, false, 'hidden named footer wrappers are not observed');
    assert.equal(footer(hidden).hasTermsLink, null);
  } finally {
    await globalThis.__legalFooterBrowser.close();
    delete globalThis.__legalFooterBrowser;
  }
  console.log('legal links nonsemantic footer: PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; });
