const assert = require('assert');
const { chromium } = require('playwright');
const hooks = require('../index.js').__lightBudgetTestHooks;

const renderedPage = (url, value = 'Example Corporation', overrides = {}) => Object.assign({
  url,
  finalUrl: url,
  ok: true,
  observationMethod: 'playwright_scoped_light',
  operatorIdentityEvidence: value ? [{ label: 'Company', value, sourceScope: 'footer' }] : []
}, overrides);

function build(overrides = {}) {
  return hooks.buildOperatorIdentityObservationV1_(Object.assign({
    siteMode: 'corp',
    pages: [renderedPage('https://example.test/company')],
    completedRoles: ['about', 'legal'],
    baseScopeComplete: true,
    discoveryComplete: true,
    inputObserved: true,
    observationLimited: false,
    candidateCapped: false,
    limitations: [],
    failures: [],
    additionalFetchCount: 0
  }, overrides));
}

// Strong, visible, rendered evidence establishes true and never exposes values.
let result = build();
assert.equal(result.signalState, 'true');
assert.equal(result.strongEvidenceCount, 1);
assert.equal(result.evidence[0].sourcePath, '/company');
assert.equal(JSON.stringify(result).includes('Example Corporation'), false);
assert.equal(JSON.stringify(result).includes('operatorIdentityEvidence'), false);

// False is allowed only after every explicit completion gate succeeds.
result = build({ pages: [renderedPage('https://example.test/company', '')] });
assert.equal(result.signalState, 'false');
assert.deepEqual(result.reasonCodes, ['all_required_rendered_scopes_completed_without_identity_evidence']);

[
  { discoveryComplete: false, expected: 'discovery_incomplete' },
  { baseScopeComplete: false, expected: 'base_scope_incomplete' },
  { completedRoles: ['about'], expected: 'required_scope_incomplete' },
  { candidateCapped: true, expected: 'candidate_cap_reached' },
  { limitations: ['timeout'], expected: 'observation_limited' },
  { failures: ['required_legal_fetch_failed'], expected: 'required_fetch_failed' }
].forEach(({ expected, ...overrides }) => {
  const unknown = build(Object.assign({ pages: [renderedPage('https://example.test/company', '')] }, overrides));
  assert.equal(unknown.signalState, 'unknown');
  assert.equal(unknown.reasonCodes[0], expected);
});

// All uncertain runtime conditions must remain unknown, never collapse to false.
['timeout', 'blocked', 'consent_wall', 'render_failed', 'external_scope_unavailable'].forEach(failure => {
  const unknown = build({ pages: [renderedPage('https://example.test/company', '')], failures: [failure] });
  assert.equal(unknown.signalState, 'unknown');
});
['Organization JSON-LD', '123 Example Street', 'Company link', 'Generic contact form'].forEach(value => {
  const insufficient = build({
    pages: [Object.assign(renderedPage('https://example.test/company', ''), { supportingOnly: value })]
  });
  assert.equal(insufficient.signalState, 'false');
  assert.equal(insufficient.strongEvidenceCount, 0);
});

// Conflicting visible identities are not a positive observation.
result = build({ pages: [
  renderedPage('https://example.test/company', 'Example Corporation'),
  renderedPage('https://example.test/about', 'Another Corporation')
] });
assert.equal(result.signalState, 'unknown');
assert.equal(result.reasonCodes[0], 'operator_identity_conflict');

// Site applicability and fixed fetch caps are part of the producer contract.
result = build({ siteMode: 'shop', pages: [], completedRoles: [] });
assert.equal(result.signalState, 'unknown');
assert.equal(result.applicability, 'not_applicable');
assert.equal(hooks.getOperatorIdentityAdditionalFetchCap_('corp'), 2);
assert.equal(hooks.getOperatorIdentityAdditionalFetchCap_('saas'), 2);
assert.equal(hooks.getOperatorIdentityAdditionalFetchCap_('ec'), 3);
assert.equal(hooks.getOperatorIdentityAdditionalFetchCap_('media'), 2);
assert.equal(hooks.getOperatorIdentityAdditionalFetchCap_('shop_facility'), 0);
assert.equal(hooks.operatorIdentityRoleForCandidate_({ path: '/guide/legal/', label: '特定商取引法に基づく表記' }), 'commercial_law');
assert.equal(hooks.operatorIdentityRoleForCandidate_({ path: '/info/', label: '運営元' }), 'publisher');
assert.equal(hooks.operatorIdentityRoleForCandidate_({ path: '/jp/terms', label: '利用規約' }), 'legal');
assert.equal(hooks.operatorIdentityRoleForCandidate_({ path: '/privacy', label: '個人情報保護方針' }), 'legal');
assert.equal(hooks.normalizeOperatorIdentitySiteMode_('shop_facility'), 'shop_facility');

function candidate(path, label = '', source = 'sitemap', score = 0) {
  return { url: `https://example.test${path}`, label, source, sources: [source], score };
}

function assertReservedPlan(siteMode, candidates, expectedPaths) {
  const plan = hooks.buildOperatorIdentityCandidatePlan_(candidates, {
    siteMode,
    generalCandidates: candidates.slice(0, 20)
  });
  assert.deepEqual(plan.reservedCandidates.map(item => new URL(item.url).pathname).sort(), expectedPaths.slice().sort());
  assert.ok(plan.reservedCandidates.length <= hooks.getOperatorIdentityAdditionalFetchCap_(siteMode));
  return plan;
}

// Reservation happens before the unchanged general cap. These role candidates
// are intentionally outside the first 20 score-sorted items.
const corporateCapCandidates = Array.from({ length: 42 }, (_, i) => candidate(`/company/news-${i}`, '会社情報', 'nav', 100));
corporateCapCandidates.unshift(candidate('/company', '会社情報', 'nav', 100));
corporateCapCandidates.push(candidate('/legal-notice', '法務情報', 'footer', 73));
assertReservedPlan('corp', corporateCapCandidates, ['/company', '/legal-notice']);

const saasCapCandidates = Array.from({ length: 23 }, (_, i) => candidate(`/product/${i}`, '製品', 'nav', 100));
saasCapCandidates[3] = candidate('/company', '会社概要', 'footer', 70);
saasCapCandidates[10] = candidate('/jp/terms', '利用規約', 'footer', 63);
assertReservedPlan('saas', saasCapCandidates, ['/company', '/jp/terms']);

const ecCapCandidates = Array.from({ length: 31 }, (_, i) => candidate(`/products/${i}`, '商品', 'nav', 100));
ecCapCandidates.push(candidate('/help/about', '会社概要', 'ecGeneralLink', 88));
ecCapCandidates.push(candidate('/help/privacy', 'プライバシーポリシー', 'ecGeneralLink', 88));
ecCapCandidates.push(candidate('/help/tradelaw', '特定商取引法に基づく表記', 'ecGeneralLink', 53));
assertReservedPlan('ec', ecCapCandidates, ['/help/about', '/help/privacy', '/help/tradelaw']);

const mediaCapCandidates = Array.from({ length: 30 }, (_, i) => candidate(`/post/${i}`, '記事', 'nav', 100));
mediaCapCandidates.push(candidate('/company', '運営会社', 'footer', 73));
mediaCapCandidates.push(candidate('/terms', '利用規約', 'footer', 73));
assertReservedPlan('media', mediaCapCandidates, ['/company', '/terms']);

// Reservation never relaxes false safety: capped evidence-free input remains
// unknown even when all nominal scopes are complete.
result = build({
  candidateCapped: true,
  pages: [renderedPage('https://example.test/company', '')],
  completedRoles: ['about', 'legal']
});
assert.equal(result.signalState, 'unknown');

// Positive evidence remains positive even when an unrelated scope is incomplete.
result = build({ candidateCapped: true, completedRoles: ['about'], pages: [renderedPage('https://example.test/about', 'Example Corporation')] });
assert.equal(result.signalState, 'true');

// Semantic evidence is deduped within its role, while distinct identities in
// that same semantic role remain a genuine conflict.
result = hooks.buildOperatorIdentityObservationV1_({
  siteMode: 'media', inputObserved: true, observationLimited: false,
  discoveryComplete: true, candidateCapped: false, baseScopeComplete: true,
  completedRoles: ['publisher', 'legal'], pages: [renderedPage('https://example.test/company/', 'Example Media', {
    pageRole: 'top', operatorScopeRole: 'publisher',
    operatorIdentityEvidence: [
      { label: '運営会社', value: 'Example Media', sourceScope: 'content' },
      { label: '運営会社', value: ' Example\nMedia ', sourceScope: 'content' }
    ]
  })], limitations: [], failures: []
});
assert.equal(result.signalState, 'true');
assert.equal(result.conflict, false);
assert.equal(result.strongEvidenceCount, 1);
assert.equal(result.evidence[0].role, 'publisher');
assert.equal(result.evidence[0].pageRole, 'top');
assert.equal(result.evidence[0].evidenceRole, 'operator_name');

result = hooks.buildOperatorIdentityObservationV1_({
  siteMode: 'media', inputObserved: true, observationLimited: false,
  discoveryComplete: true, candidateCapped: false, baseScopeComplete: true,
  completedRoles: ['publisher', 'legal'], pages: [renderedPage('https://example.test/company/', 'Example Media A', {
    pageRole: 'top', operatorScopeRole: 'publisher',
    operatorIdentityEvidence: [
      { label: '運営会社', value: 'Example Media A', sourceScope: 'content' },
      { label: '運営会社', value: 'Example Media B', sourceScope: 'content' }
    ]
  })], limitations: [], failures: []
});
assert.equal(result.signalState, 'unknown');
assert.equal(result.conflict, true);
assert.equal(result.reasonCodes[0], 'operator_identity_conflict');

// Compactness and serialization contract.
result = build({
  pages: Array.from({ length: 8 }, (_, i) => renderedPage(`https://example.test/about/${i}`, `Same Corporation`)),
  failures: ['a', 'b', 'c', 'd', 'e', 'f']
});
assert.ok(result.evidence.length <= 3);
assert.ok(result.failureReasons.length <= 5);
assert.deepEqual(Object.keys(result.discovery).sort(), ['candidateCount', 'capped', 'complete', 'selectedCount']);
assert.ok(result.evidence.every(item => item.type && item.role && item.pageRole && item.evidenceRole && item.sourcePath && item.extractionMethod && item.label));

async function runRolePropagationFixtures() {
  const runtime = input => hooks.buildRuntimeOperatorIdentityObservationV1_(Object.assign({
    inputObserved: true, observationLimited: false, discoveryComplete: true,
    candidateCapped: false, baseScopeComplete: true, limitations: [], failures: [],
    context: null, origin: 'https://example.test'
  }, input));
  const duplicateEvidence = [
    { label: '運営会社', value: 'Example Media', sourceScope: 'content' },
    { label: '運営会社', value: 'Example\nMedia', sourceScope: 'content' }
  ];

  // Production-shaped aggregate: h1's immediate div contains several sections.
  // Only the nested h2 -> p operator field is valid evidence.
  const browser = await chromium.launch({ headless: true });
  let topPage, ecTopPage;
  try {
    const page = await browser.newPage();
    await page.setContent('<header></header><nav></nav><section><h1>運営会社</h1><div class="aggregate"><h2>運営会社</h2><p>Example Media</p><h2>所在地</h2><p>Example Address</p><h2>お問い合わせ</h2><p>Example Contact</p></div></section><footer></footer>');
    topPage = await hooks.collectTopOperatorIdentityRenderedEvidence_(page, 'https://example.test/company/');
    await page.setContent('<header></header><nav></nav><section><h1>特定商取引法に基づく表記</h1><div class="aggregate"><h2>販売業者</h2><p>Example Seller</p><h2>所在地</h2><p>Example Address</p><h2>お問い合わせ</h2><p>Example Contact</p></div></section><footer></footer>');
    ecTopPage = await hooks.collectTopOperatorIdentityRenderedEvidence_(page, 'https://example.test/tokushoho/');
  } finally {
    await browser.close();
  }
  assert.equal(topPage.operatorIdentityRole, 'top');
  assert.equal(topPage.operatorIdentityEvidence.length, 1);
  assert.equal(topPage.operatorIdentityEvidence[0].label, '運営会社');
  assert.equal(ecTopPage.operatorIdentityEvidence.length, 1);
  assert.equal(ecTopPage.operatorIdentityEvidence[0].label, '販売業者');

  // Production-failure regression: direct /company/ is top as a page source,
  // yet publisher remains the selected semantic operator scope.
  let observed = await runtime({
    siteMode: 'media',
    candidates: [{ url: 'https://example.test/company/', label: '運営会社' }],
    pages: [topPage]
  });
  assert.equal(observed.signalState, 'true');
  assert.equal(observed.conflict, false);
  assert.equal(observed.strongEvidenceCount, 1);
  assert.equal(observed.evidence[0].role, 'publisher');
  assert.equal(observed.evidence[0].pageRole, 'top');
  assert.equal(observed.evidence[0].evidenceRole, 'operator_name');

  // Normal root -> reused company page has the same semantic result.
  observed = await runtime({
    siteMode: 'media',
    candidates: [{ url: 'https://example.test/company/', label: '運営会社' }],
    pages: [renderedPage('https://example.test/company/', 'Example Media', {
      operatorIdentityRole: 'about', pageRole: 'about', operatorIdentityEvidence: duplicateEvidence
    })]
  });
  assert.equal(observed.signalState, 'true');
  assert.equal(observed.evidence[0].role, 'publisher');
  assert.equal(observed.evidence[0].pageRole, 'about');

  // EC direct and root reuse preserve commercial_law without a duplicate fetch.
  for (const pageRole of ['top', 'about']) {
    const page = pageRole === 'top'
      ? ecTopPage
      : renderedPage('https://example.test/tokushoho/', 'Example Seller', {
          operatorIdentityRole: pageRole, pageRole,
          operatorIdentityEvidence: [{ label: '販売業者', value: 'Example Seller', sourceScope: 'content' }]
        });
    observed = await runtime({
      siteMode: 'ec',
      candidates: [{ url: 'https://example.test/tokushoho/', label: '販売業者' }],
      pages: [page]
    });
    assert.equal(observed.signalState, 'true');
    assert.equal(observed.evidence[0].role, 'commercial_law');
    assert.equal(observed.evidence[0].pageRole, pageRole);
    assert.equal(observed.evidence[0].evidenceRole, 'seller_name');
  }

  // Corporate and SaaS direct pages likewise keep top as source-only metadata.
  for (const siteMode of ['corp', 'saas']) {
    observed = await runtime({
      siteMode,
      candidates: [{ url: 'https://example.test/company/', label: '会社概要' }],
      pages: [topPage]
    });
    assert.equal(observed.signalState, 'true', `${siteMode}: ${JSON.stringify(observed)}`);
    assert.equal(observed.evidence[0].role, 'about');
    assert.equal(observed.evidence[0].pageRole, 'top');
  }

  // Pre-cap reservations are execution input, not merely audit data.  A
  // scoped page for each reserved URL is reused, so the fixed fetch budget is
  // not consumed again and capped evidence can still establish TRUE.
  const reservationCases = [
    ['corp', corporateCapCandidates, 'Company'],
    ['saas', saasCapCandidates, 'SaaS'],
    ['ec', ecCapCandidates, 'Seller'],
    ['media', mediaCapCandidates, 'Publisher']
  ];
  for (const [siteMode, allCandidates, value] of reservationCases) {
    const plan = hooks.buildOperatorIdentityCandidatePlan_(allCandidates, {
      siteMode,
      generalCandidates: allCandidates.slice(0, 20)
    });
    const pages = plan.reservedCandidates.map(item => renderedPage(item.url, `Example ${value}`));
    observed = await runtime({
      siteMode,
      candidates: allCandidates.slice(0, 20),
      operatorCandidatePlan: plan,
      candidateCapped: true,
      pages
    });
    assert.equal(observed.signalState, 'true', `${siteMode}: ${JSON.stringify(observed)}`);
    assert.equal(observed.additionalFetchCount, 0);

    const evidenceFree = await runtime({
      siteMode,
      candidates: allCandidates.slice(0, 20),
      operatorCandidatePlan: plan,
      candidateCapped: true,
      pages: plan.reservedCandidates.map(item => renderedPage(item.url, ''))
    });
    assert.equal(evidenceFree.signalState, 'unknown');
  }
}

runRolePropagationFixtures()
  .then(() => console.log('operator identity observation fixtures: PASS'))
  .catch(error => { console.error(error); process.exitCode = 1; });
