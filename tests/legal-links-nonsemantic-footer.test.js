const assert = require('assert');
const { chromium } = require('playwright');
const { buildGeoSignalsV1 } = require('../index.js').__lightBudgetTestHooks;

async function observe(html, name, shortFastMode = false) {
  const page = await globalThis.__legalFooterBrowser.newPage();
  try {
    const url = `https://${name}.example.test/`;
    await page.setContent(`<base href="${url}">${html}`, { waitUntil: 'domcontentloaded' });
    return await buildGeoSignalsV1(page, url, { balancedMode: false, shortFastMode });
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
    assert.equal(footer(semantic).structureObserved, true);
    assert.equal(footer(semantic).headingCount, 0);
    assert.equal(footer(semantic).listCount, 0);
    assert.equal(footer(semantic).groupedLinkBlocks, 0);
    assert.equal(footer(semantic).observed, true);
    assert.equal(footer(semantic).hasPrivacyLink, true);
    assert.equal(footer(semantic).hasTermsLink, true);

    const explicit = await observe('<div id="site-footer"><ul><li><a href="/privacy">Privacy Policy</a></li><li><a href="/security">Security Policy</a></li></ul></div>', 'explicit');
    assert.equal(footer(explicit).observed, true, 'one visible explicit footer root is a complete footer scope');
    assert.equal(footer(explicit).linkCount, 2);
    assert.equal(footer(explicit).hasPrivacyLink, true);
    assert.equal(footer(explicit).hasTermsLink, false, 'privacy alone remains distinct from terms/legal evidence');

    const arbitrary = await observe('<div class="page-bottom"><a href="/privacy">Privacy Policy</a><a href="/terms">Terms</a></div>', 'arbitrary');
    assert.equal(footer(arbitrary).structureObserved, false);
    assert.equal(footer(arbitrary).headingCount, null);
    assert.equal(footer(arbitrary).observed, false, 'an arbitrary bottom-page div is not a footer');
    assert.equal(footer(arbitrary).hasTermsLink, null);

    const ambiguous = await observe('<div id="desktop-footer"><a href="/terms">Terms</a></div><div id="mobile-footer"><a href="/privacy">Privacy Policy</a></div>', 'ambiguous');
    assert.equal(footer(ambiguous).observed, false, 'multiple visible explicit footer roots are rejected as ambiguous');
    assert.equal(footer(ambiguous).hasPrivacyLink, null);

    const hidden = await observe('<div id="site-footer" hidden><a href="/terms">Terms</a></div>', 'hidden');
    assert.equal(footer(hidden).observed, false, 'hidden named footer wrappers are not observed');
    assert.equal(footer(hidden).hasTermsLink, null);
    for (const shortFastMode of [false, true]) {
      const grouped = await observe('<main><h2>本文だけ</h2></main><footer><section><h2>会社情報</h2><ul><li><a href="/company">会社</a></li><li><a href="/contact">連絡</a></li></ul></section></footer>', 'grouped', shortFastMode);
      assert.equal(footer(grouped).structureObserved, true);
      assert.equal(footer(grouped).headingCount, 1);
      assert.equal(footer(grouped).listCount, 1);
      assert.equal(footer(grouped).groupedLinkBlocks, 1);
      const shadow = await observe('<footer><div id="shadow-host"></div><a href="/contact">連絡</a></footer><script>document.getElementById("shadow-host").attachShadow({mode:"open"}).innerHTML="<h2>情報</h2><ul><li>会社</li></ul>"</script>', 'shadow', shortFastMode);
      assert.equal(footer(shadow).structureObserved, false, '未走査のshadow構造を0グループとして扱わない');
      assert.equal(footer(shadow).headingCount, null);
      assert.equal(footer(shadow).groupedLinkBlocks, null);
    }
  } finally {
    await globalThis.__legalFooterBrowser.close();
    delete globalThis.__legalFooterBrowser;
  }
  console.log('legal links nonsemantic footer: PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; });
