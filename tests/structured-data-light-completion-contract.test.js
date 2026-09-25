const assert = require('assert');
const { chromium } = require('playwright');
const {
  buildGeoSignalsV1,
  resolveStructuredDataLightCompletionV1_
} = require('../index.js').__lightBudgetTestHooks;

function rendered(hasJsonLd, extra = {}) {
  return Object.assign({ renderedDomObserved: true, hasJsonLd, parseErrorsCount: 0 }, extra);
}
function html(hasJsonLd, extra = {}) {
  return Object.assign({ htmlContentLdJsonObserved: true, hasJsonLd, parseErrorsCount: 0 }, extra);
}

(async () => {
  // 1. Both completed and empty establishes a formal negative.
  let state = resolveStructuredDataLightCompletionV1_(rendered(false), html(false));
  assert.deepStrictEqual([state.complete, state.observationLimited, state.hasJsonLd, state.observationScope], [true, false, false, 'rendered_dom_plus_html_ldjson']);

  // 2–3. A positive from either completed scope wins.
  assert.strictEqual(resolveStructuredDataLightCompletionV1_(rendered(false), html(true)).hasJsonLd, true);
  assert.strictEqual(resolveStructuredDataLightCompletionV1_(rendered(true), html(false)).hasJsonLd, true);
  assert.strictEqual(resolveStructuredDataLightCompletionV1_(rendered(false), html(true)).complete, true);
  assert.strictEqual(resolveStructuredDataLightCompletionV1_(rendered(true), html(false)).complete, true);

  // 4–7. Any incomplete, timeout, failed, or malformed input remains limited.
  assert.strictEqual(resolveStructuredDataLightCompletionV1_(rendered(false), html(null, { htmlContentLdJsonObserved: false, scanFailed: true })).complete, false);
  assert.strictEqual(resolveStructuredDataLightCompletionV1_(rendered(null, { renderedDomObserved: false, scanFailed: true }), html(false)).complete, false);
  assert.strictEqual(resolveStructuredDataLightCompletionV1_(rendered(false, { timedOut: true }), html(false)).complete, false);
  assert.strictEqual(resolveStructuredDataLightCompletionV1_(rendered(false, { parseErrorsCount: 1 }), html(false)).complete, false);

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent('<main>plain page</main>', { waitUntil: 'domcontentloaded' });
    const light = await buildGeoSignalsV1(page, 'https://light.example.test/', { balancedMode: false, shortFastMode: false });
    assert.deepStrictEqual([
      light.structuredData.hasJsonLd,
      light.structuredData.observationLimited,
      light.structuredData.observationScope,
      light.structuredData.htmlContentLdJsonObserved
    ], [false, false, 'rendered_dom_plus_html_ldjson', true]);
    const balanced = await buildGeoSignalsV1(page, 'https://balanced.example.test/', { balancedMode: true, shortFastMode: false });
    assert.deepStrictEqual([
      balanced.structuredData.hasJsonLd,
      balanced.structuredData.observationLimited,
      balanced.structuredData.observationScope
    ], [false, true, 'rendered_dom_plus_html_ldjson_plus_script_src_jsonld_only']);
    await page.close();
  } finally {
    await browser.close();
  }
  console.log('structured-data light completion contract: OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
