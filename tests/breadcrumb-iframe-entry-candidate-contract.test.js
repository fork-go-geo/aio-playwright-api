const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

// JSON-LD absence is a completed scan only when successful HTML was actually parsed.
for (const [html, status, expectedComplete, errors] of [
  ['<html><main>本文</main></html>', 200, true, 0],
  ['<script type="application/ld+json">{"@type":"WebPage"}</script>', 200, false, 0],
  ['<script type="application/ld+json">{broken</script>', 200, false, 1],
  ['', 200, false, 0],
  ['<body>本文</body><script type="application/ld+json"></script>', 200, false, 0],
  ['<title>Just a moment</title><body>Checking your browser Cloudflare</body>', 200, false, 0],
  ['<body>Access denied Reference # Akamai</body>', 200, false, 0],
  ['<body>本文</body><script type="application/ld+json">' + JSON.stringify({child: Array.from({length:12}).reduce(v=>({child:v}), {'@type':'BreadcrumbList'})}) + '</script>', 200, false, 0],
  ['<html>失敗</html>', 500, false, 0]
]) {
  const parsed = hooks.parseSubpageJsonLdLightHtml('https://fixture.invalid/service/', 'https://fixture.invalid/service/', status, html, 'corporate');
  assert.equal(parsed.jsonldScanAttempted, true);
  assert.equal(parsed.jsonldScanComplete, expectedComplete);
  assert.equal(parsed.jsonldParseErrors, errors);
  const compact = hooks.compactSubpageJsonLdObservation_(parsed);
  const bridged = hooks.buildSubpageSignalsV1FromSubpageObservation_({ observations: [compact] });
  assert.equal(compact.jsonldScanComplete, expectedComplete);
  assert.equal(bridged.pages[0].jsonldScanComplete, expectedComplete);
  assert.equal(bridged.pages[0].jsonldObservationScope, 'fetched_html_ldjson');
}
const legacy = hooks.compactSubpageJsonLdObservation_({ ok: true, jsonldTypes: [] });
assert.equal(legacy.jsonldScanComplete, null);
assert.equal(hooks.compactSubpageJsonLdObservation_({ ok: false }).jsonldScanComplete, null);

const entryFact = {
  readyState: 'complete', hasFrame: true, hasFrameset: false,
  mainContentObserved: true, mainTextLength: 800,
  serviceTextLength: 0, serviceRegionCertain: true,
  faqDetector: { mainObserved: true, faqHeading: false, faqContainer: false, faqStructuredData: false, pairCount: 0, questionCount: 0 },
  breadcrumbUi: false,
  links: [{ href: 'https://fixture.invalid/brand/leaflet/', text: '最新のチラシ', aria: '', title: '' }],
  faqLinks: [], faqLinkObserved: false, serviceLinks: [], serviceLinkObserved: false,
  sitemapLinks: [], sitemapLinkDiscoveryComplete: true
};
const subpageFact = Object.assign({}, entryFact, {
  hasFrame: false, mainTextLength: 300, links: [], breadcrumbUi: true
});

const entryPage = { evaluate: async () => entryFact };
const context = {
  newPage: async () => ({
    goto: async () => ({ status: () => 200 }),
    evaluate: async () => subpageFact,
    close: async () => undefined
  })
};

(async () => {
  const geo = {};
  const result = await hooks.collectCoverageObservationsV2_(geo, entryPage, 'https://fixture.invalid/brand/', context);
  const breadcrumb = result.breadcrumbObservationV2;
  assert.equal(breadcrumb.completeness, 'complete');
  assert.equal(breadcrumb.hasAnyUi, true);
  assert.equal(breadcrumb.subpageHasUi, true);
  assert.equal(breadcrumb.observedSubpageCount, 1);
  console.log('breadcrumb iframe entry candidate contract: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
