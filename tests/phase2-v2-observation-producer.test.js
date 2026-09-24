/* eslint-disable no-console */
// Synthetic, network-free contract fixture. All URL/text fixtures are dummy.
const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const complete = extra => Object.assign({ checked:true, attempted:true, renderComplete:true, frameComplete:true,
  failureKind:null, faqContent:false, breadcrumbUi:false, mainContentObserved:true, mainTextLength:120, serviceTextLength:80, serviceRegionCertain:true, sitemapLinkDiscoveryComplete:true }, extra || {});
const partial = kind => complete({ renderComplete:false, frameComplete:false, failureKind:kind || 'render_incomplete' });
const cases = [];
const check = (name, actual, expected) => { assert.deepStrictEqual(actual, expected, name); cases.push(name); };

// FAQ: true on entry/candidate; false only after every scope is complete.
check('faq-entry-present', hooks.buildFaqObservationV2_(complete({ faqContent:true }), [], true).value, true);
check('faq-candidate-present', hooks.buildFaqObservationV2_(complete(), [complete({ faqContent:true })], true).value, true);
check('faq-complete-absence', hooks.buildFaqObservationV2_(complete(), [complete()], true).value, false);
['timeout', 'access_denied', 'render_incomplete'].forEach(kind =>
  check(`faq-${kind}-unknown`, hooks.buildFaqObservationV2_(complete(), [partial(kind)], true).value, null));
check('faq-incomplete-positive-is-unknown', hooks.buildFaqObservationV2_(partial('render_incomplete'), [], true).value, null);
check('faq-discovery-incomplete', hooks.buildFaqObservationV2_(complete(), [], false).value, null);

// Service: values may exist for diagnostics, but any incomplete/uncertain
// region keeps completeness partial rather than establishing a thin result.
check('service-entry-sufficient', hooks.buildServiceContentObservationV2_(complete({ serviceTextLength:500 }), [], true).completeness, 'complete');
check('service-detail-sufficient', hooks.buildServiceContentObservationV2_(complete(), [complete({ serviceTextLength:420 })], true).serviceTextLength, 500);
check('service-all-complete-thin', hooks.buildServiceContentObservationV2_(complete({ serviceTextLength:10 }), [complete({ serviceTextLength:8 })], true).completeness, 'complete');
check('service-complete-zero-is-finite', hooks.buildServiceContentObservationV2_(complete({ serviceTextLength:0 }), [], true).serviceTextLength, 0);
check('service-null-length-is-partial', hooks.buildServiceContentObservationV2_(complete({ serviceTextLength:null }), [], true).completeness, 'partial');
check('service-partial', hooks.buildServiceContentObservationV2_(complete(), [complete({ serviceRegionCertain:false })], true).completeness, 'partial');
check('service-limited', hooks.buildServiceContentObservationV2_(partial('render_incomplete'), [], false).limited, true);
check('service-fetch-failure', hooks.buildServiceContentObservationV2_(complete(), [partial('fetch_error')], true).completeness, 'partial');
check('service-no-detail', hooks.buildServiceContentObservationV2_(complete(), [], true).explicitCandidateCount, 0);
check('service-body-fallback-partial', hooks.buildServiceContentObservationV2_(complete({ mainContentObserved:false }), [], true).completeness, 'partial');

// Breadcrumb requires a fully observed hierarchical subpage; entry-only is
// unknown, never an explicit missing UI result.
const breadcrumbPresent = hooks.buildBreadcrumbObservationV2_(complete(), [complete({ breadcrumbUi:true })], true);
check('breadcrumb-hierarchical-present', breadcrumbPresent.hasAnyUi, true);
check('breadcrumb-hierarchical-present-scope', breadcrumbPresent.observedScope, 'entry_and_hierarchical_subpage');
check('breadcrumb-hierarchical-present-subpage-ui', breadcrumbPresent.subpageHasUi, true);
check('breadcrumb-complete-absence', hooks.buildBreadcrumbObservationV2_(complete(), [complete()], true).hasAnyUi, false);
const entryOnlyBreadcrumb = hooks.buildBreadcrumbObservationV2_(complete(), [], true);
check('breadcrumb-entry-only', entryOnlyBreadcrumb.hasAnyUi, null);
check('breadcrumb-entry-only-scope', entryOnlyBreadcrumb.observedScope, 'entry_only');
check('breadcrumb-entry-only-formal-count', entryOnlyBreadcrumb.observedSubpageCount, 0);
check('breadcrumb-frame-incomplete', hooks.buildBreadcrumbObservationV2_(complete(), [partial('frame_incomplete')], true).subpageHasUi, null);
check('breadcrumb-render-incomplete', hooks.buildBreadcrumbObservationV2_(partial('render_incomplete'), [complete()], true).hasAnyUi, null);
const mixedBreadcrumb = hooks.buildBreadcrumbObservationV2_(complete(), [complete(), partial('timeout')], true);
check('breadcrumb-mixed-candidates-entry-only', mixedBreadcrumb.observedScope, 'entry_only');
check('breadcrumb-mixed-candidates-formal-count-is-zero', mixedBreadcrumb.observedSubpageCount, 0);
check('breadcrumb-mixed-candidates-debug-completed-count', mixedBreadcrumb.completedCandidateCount, 1);
check('breadcrumb-jsonld-only-is-not-ui-positive', hooks.buildBreadcrumbObservationV2_(complete({ breadcrumbUi:false, hasBreadcrumbJsonLd:true }), [complete({ breadcrumbUi:false, hasBreadcrumbJsonLd:true })], true).hasAnyUi, false);

// Rendered sitemap discovery is transport-only and emits at most five URLs.
check('sitemap-rendered-link-found', hooks.buildHtmlSitemapCandidateDiscoveryV1_(complete(), [
  'https://fixture.invalid/site-map/', 'https://fixture.invalid/sitemap.html'
]).discoveredCount, 2);
check('sitemap-none-complete', hooks.buildHtmlSitemapCandidateDiscoveryV1_(complete(), []).completeness, 'complete');
check('sitemap-discovery-incomplete', hooks.buildHtmlSitemapCandidateDiscoveryV1_(partial('render_incomplete'), ['https://fixture.invalid/site-map/']).candidates, []);

// Candidate selection: same-origin, normalized URL, and bounded cap only.
const selectedFaq = hooks.selectCoverageObservationV2Candidates_('https://fixture.invalid', [
  { href:'https://fixture.invalid/faq#top', text:'FAQ' }, { href:'/faq?from=nav', text:'よくある質問' },
  { href:'https://other.invalid/faq', text:'FAQ' }
], 'faq', 3);
check('faq-candidate-normalized-and-same-origin', selectedFaq, ['https://fixture.invalid/faq']);
const selectedService = hooks.selectCoverageObservationV2Candidates_('https://fixture.invalid', [
  { href:'/service/a', text:'Service A' }, { href:'/service/b', text:'Service B' },
  { href:'/service/c', text:'Service C' }, { href:'/service/d', text:'Service D' }, { href:'/contact', text:'Contact' }
], 'service', 3);
check('service-candidate-cap', selectedService.length, 3);
const selectedBreadcrumb = hooks.selectCoverageObservationV2Candidates_('https://fixture.invalid/', [
  { href:'/company/', text:'Company' }, { href:'/product/detail', text:'Product detail' },
  { href:'/news/example', text:'News article' }, { href:'/faq', text:'FAQ' }
], 'breadcrumb', 3);
check('breadcrumb-candidate-priority-and-cap', selectedBreadcrumb, [
  'https://fixture.invalid/product/detail', 'https://fixture.invalid/news/example', 'https://fixture.invalid/company/'
]);
check('breadcrumb-excludes-faq', selectedBreadcrumb.includes('https://fixture.invalid/faq'), false);
check('breadcrumb-company-about-is-generic-hierarchical-candidate', selectedBreadcrumb.includes('https://fixture.invalid/company/'), true);
const privacyOnlyBreadcrumb = hooks.selectCoverageObservationV2Candidates_('https://fixture.invalid/', [
  { href:'/privacy/', text:'Privacy' }, { href:'/legal/', text:'Legal' }, { href:'/contact/', text:'Contact' }
], 'breadcrumb', 3);
check('breadcrumb-excludes-privacy-legal-contact', privacyOnlyBreadcrumb, []);

// Cross-boundary synthetic contract.  This models the formal object only: the
// GAS-side merge/readback implementation has its own fixture.  No network,
// Sheet, Cloud Run, or target site is involved here.
const formalBreadcrumb = hooks.buildBreadcrumbObservationV2_(complete({ breadcrumbUi:false }), [complete({ breadcrumbUi:true })], true);
const cloudRunPayload = { geoSignalsV1:{ coverage:{ breadcrumbObservationV2:formalBreadcrumb } } };
const gasBridgeAuditSig = { coverageObservationV2:{ breadcrumb:cloudRunPayload.geoSignalsV1.coverage.breadcrumbObservationV2 } };
const observationRow = { itemKey:'breadcrumb_ui', ruleEvidenceV1:{
  hasAnyUi:gasBridgeAuditSig.coverageObservationV2.breadcrumb.hasAnyUi,
  topHasUi:gasBridgeAuditSig.coverageObservationV2.breadcrumb.topHasUi,
  subpageHasUi:gasBridgeAuditSig.coverageObservationV2.breadcrumb.subpageHasUi,
  observedScope:gasBridgeAuditSig.coverageObservationV2.breadcrumb.observedScope,
  observedSubpageCount:gasBridgeAuditSig.coverageObservationV2.breadcrumb.observedSubpageCount
} };
const snapshotReadback = JSON.parse(JSON.stringify({ auditSig:gasBridgeAuditSig }));
check('breadcrumb-e2e-cloud-run-to-gas-snapshot', snapshotReadback.auditSig.coverageObservationV2.breadcrumb, formalBreadcrumb);
check('breadcrumb-e2e-row-uses-same-formal-values', observationRow.ruleEvidenceV1, {
  hasAnyUi:true, topHasUi:false, subpageHasUi:true,
  observedScope:'entry_and_hierarchical_subpage', observedSubpageCount:1
});
const selectedSitemap = hooks.selectCoverageObservationV2Candidates_('https://fixture.invalid', [
  { href:'/site-map/', text:'Site map' }, { href:'/sitemap.html', text:'Sitemap' }
], 'sitemap', 5);
check('sitemap-candidate-discovery', selectedSitemap.length, 2);

const observation = hooks.buildFaqObservationV2_(complete(), [complete()], true);
['checked', 'completeness', 'limited', 'scope', 'authority', 'fallbackApplied', 'value', 'entry', 'candidates'].forEach(key =>
  assert.ok(Object.prototype.hasOwnProperty.call(observation, key), `faq schema ${key}`));
assert.strictEqual(observation.authority, 'cloud_run_geoSignalsV1_coverageObservationV2');
console.log(JSON.stringify({ pass:true, caseCount:cases.length, cases }));
