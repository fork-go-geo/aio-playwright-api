const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const renderedPage = (url, value = 'Example Corporation') => ({
  url,
  finalUrl: url,
  ok: true,
  observationMethod: 'playwright_scoped_light',
  operatorIdentityEvidence: value ? [{ label: 'Company', value, sourceScope: 'footer' }] : []
});

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
assert.equal(hooks.normalizeOperatorIdentitySiteMode_('shop_facility'), 'shop_facility');

// Positive evidence remains positive even when an unrelated scope is incomplete.
result = build({ candidateCapped: true, completedRoles: ['about'], pages: [renderedPage('https://example.test/about', 'Example Corporation')] });
assert.equal(result.signalState, 'true');

// Compactness and serialization contract.
result = build({
  pages: Array.from({ length: 8 }, (_, i) => renderedPage(`https://example.test/about/${i}`, `Same Corporation`)),
  failures: ['a', 'b', 'c', 'd', 'e', 'f']
});
assert.ok(result.evidence.length <= 3);
assert.ok(result.failureReasons.length <= 5);
assert.deepEqual(Object.keys(result.discovery).sort(), ['candidateCount', 'capped', 'complete', 'selectedCount']);
assert.ok(result.evidence.every(item => item.type && item.role && item.sourcePath && item.extractionMethod && item.label));

console.log('operator identity observation fixtures: PASS');
