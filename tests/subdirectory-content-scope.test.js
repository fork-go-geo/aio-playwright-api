'use strict';

// Synthetic-only regression contract: no browser, network, customer URL, or
// service endpoint is used here.
const assert = require('node:assert/strict');
const hooks = require('../index.js').__lightBudgetTestHooks;

const origin = 'https://fixture.invalid';
const rootScope = hooks.buildContentScopeV1_(`${origin}/`);
const schoolScope = hooks.buildContentScopeV1_(`${origin}/school/?ignored=1#ignored`);
const inside = value => hooks.isUrlInContentScopeV1_(`${origin}${value}`, schoolScope);

// 1–3 and 9: root is unchanged; nested prefix is normalized and boundary-safe.
assert.equal(rootScope.isRoot, true);
['/company/', '/faq/', '/product/'].forEach(path => assert.equal(hooks.isUrlInContentScopeV1_(`${origin}${path}`, rootScope), true));
assert.equal(schoolScope.prefix, '/school/');
['/school/', '/school/a', '/school/a/b', '/school'].forEach(path => assert.equal(inside(path), true));
['/school2/', '/schools/', '/school-old/', '/company/'].forEach(path => assert.equal(inside(path), false));
['/school', '/school/', '/school/?x=1', '/school/#x'].forEach(url => {
  assert.equal(hooks.buildContentScopeV1_(`${origin}${url}`).prefix, '/school/');
});

// 4: URL-bearing aggregation rejects positive structured/breadcrumb facts from
// a different directory before the summary is calculated.
const contentScope = hooks.buildContentScopeV1_(`${origin}/school/`);
const scopedPayload = {
  topUrl: `${origin}/school/`, contentScope, siteMode: 'corporate',
  candidates: [
    { url:`${origin}/school/a`, source:'nav', sources:['nav'] },
    { url:`${origin}/company/`, source:'nav', sources:['nav'] }
  ],
  observations: [
    { url:`${origin}/school/a`, finalUrl:`${origin}/school/a`, ok:true, jsonldTypes:[], jsonLdCount:0, hasBreadcrumbJsonLd:false, breadcrumbListCount:0, h1Count:1 },
    { url:`${origin}/company/`, finalUrl:`${origin}/company/`, ok:true, jsonldTypes:['Organization','BreadcrumbList'], jsonLdCount:2, hasBreadcrumbJsonLd:true, breadcrumbListCount:1, h1Count:1 }
  ],
  candidateSummary:{ sourceSummary:{} }, coverageRuntime:{}
};
const subpages = hooks.buildSubpageSignalsV1FromSubpageObservation_(scopedPayload);
assert.equal(subpages.pages.length, 1);
assert.equal(subpages.summary.hasAnyJsonLd, false);
assert.equal(subpages.summary.hasAnyBreadcrumbList, false);
const coverage = hooks.buildCoverageSignalsV1FromSubpageObservation_(scopedPayload);
assert.equal(coverage.representativePages.length, 1);
assert.equal(coverage.hasObservedBreadcrumbList, false);

// 5 and 8: coverage and sitemap candidate expansion use only scoped URLs.
const links = [
  { href:`${origin}/school/faq/`, text:'FAQ' },
  { href:`${origin}/faq/`, text:'FAQ' },
  { href:`${origin}/school/a`, text:'サイトマップ' },
  { href:`${origin}/product/`, text:'サイトマップ' }
];
assert.deepEqual(
  hooks.selectCoverageObservationV2Candidates_(origin, links, 'faq', 5, contentScope),
  [`${origin}/school/faq/`]
);
assert.deepEqual(
  hooks.selectCoverageObservationV2Candidates_(origin, links, 'sitemap', 5, contentScope),
  [`${origin}/school/a`]
);

// 6: evidence-only operator data may exist outside content scope, but its page
// never appears in content aggregation above.  7 is intentionally implicit:
// this helper never filters origin-root resources such as robots or llms.
const evidenceOnlyOperator = `${origin}/company/`;
assert.equal(hooks.isUrlInContentScopeV1_(evidenceOnlyOperator, contentScope), false);

console.log(JSON.stringify({ pass:true, fixture:'subdirectory_content_scope_v1', cases:9 }));
