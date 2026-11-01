const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

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
