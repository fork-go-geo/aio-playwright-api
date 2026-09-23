/* eslint-disable no-console */
// Synthetic, network-free contract fixture. All URL/text fixtures are dummy.
const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const complete = extra => Object.assign({ checked:true, attempted:true, renderComplete:true, frameComplete:true,
  failureKind:null, faqContent:false, breadcrumbUi:false, mainContentObserved:true, mainTextLength:120, serviceTextLength:80, serviceRegionCertain:true }, extra || {});
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
check('breadcrumb-hierarchical-present', hooks.buildBreadcrumbObservationV2_(complete(), [complete({ breadcrumbUi:true })], true).hasAnyUi, true);
check('breadcrumb-complete-absence', hooks.buildBreadcrumbObservationV2_(complete(), [complete()], true).hasAnyUi, false);
check('breadcrumb-entry-only', hooks.buildBreadcrumbObservationV2_(complete(), [], true).hasAnyUi, null);
check('breadcrumb-frame-incomplete', hooks.buildBreadcrumbObservationV2_(complete(), [partial('frame_incomplete')], true).subpageHasUi, null);
check('breadcrumb-render-incomplete', hooks.buildBreadcrumbObservationV2_(partial('render_incomplete'), [complete()], true).hasAnyUi, null);

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
  { href:'/product/detail', text:'Product detail' }, { href:'/faq', text:'FAQ' }
], 'breadcrumb', 2);
check('breadcrumb-hierarchical-only', selectedBreadcrumb, ['https://fixture.invalid/product/detail']);
const selectedSitemap = hooks.selectCoverageObservationV2Candidates_('https://fixture.invalid', [
  { href:'/site-map/', text:'Site map' }, { href:'/sitemap.html', text:'Sitemap' }
], 'sitemap', 5);
check('sitemap-candidate-discovery', selectedSitemap.length, 2);

const observation = hooks.buildFaqObservationV2_(complete(), [complete()], true);
['checked', 'completeness', 'limited', 'scope', 'authority', 'fallbackApplied', 'value', 'entry', 'candidates'].forEach(key =>
  assert.ok(Object.prototype.hasOwnProperty.call(observation, key), `faq schema ${key}`));
assert.strictEqual(observation.authority, 'cloud_run_geoSignalsV1_coverageObservationV2');
console.log(JSON.stringify({ pass:true, caseCount:cases.length, cases }));
