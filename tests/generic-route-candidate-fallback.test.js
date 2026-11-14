const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const origin = 'https://fixture.example.test';
const genericCorporateLinks = [
  { href: `${origin}/company/`, text: '会社概要' },
  { href: `${origin}/contact/`, text: 'お問い合わせ' },
  { href: `${origin}/service/`, text: 'サービス' },
  { href: `${origin}/#menu`, text: 'メニュー' },
  { href: 'mailto:test@example.test', text: 'メール' },
  { href: 'tel:0312345678', text: '電話' },
  { href: 'javascript:void(0)', text: '開く' },
  { href: `${origin}/guide.pdf`, text: '資料PDF' },
  { href: `${origin}/hero.png`, text: '画像' },
  { href: 'https://external.example.test/company/', text: '外部会社' }
];

const emptyMap = new Map();
const summary = { genericRoute: 0 };
const added = hooks.addGenericRepresentativeRouteCandidatesFromLinks_(
  genericCorporateLinks, origin, emptyMap, summary
);
assert.deepStrictEqual(added.map(item => item.href), [
  `${origin}/company/`, `${origin}/contact/`, `${origin}/service/`
]);
assert.strictEqual(emptyMap.size, 3);
assert.strictEqual(summary.genericRoute, 3);
assert.strictEqual(hooks.isGenericRepresentativeRouteCandidate_({ href: `${origin}/#menu`, text: 'メニュー' }, origin), false);
assert.strictEqual(hooks.isGenericRepresentativeRouteCandidate_({ href: 'https://external.example.test/company/', text: '外部会社' }, origin), false);
assert.strictEqual(hooks.isGenericRepresentativeRouteCandidate_({ href: `${origin}/guide.pdf`, text: '資料PDF' }, origin), false);

// Existing semantic candidates retain priority because the fallback is only
// admitted when the ordinary candidate map is empty.
const semanticMap = new Map();
hooks.addDiscoverSubpageCandidate(semanticMap, { href: `${origin}/about/`, text: '会社案内' }, 'nav', origin, 'semantic nav', {});
if (semanticMap.size === 0) hooks.addGenericRepresentativeRouteCandidatesFromLinks_(genericCorporateLinks, origin, semanticMap, {}, 6);
assert.strictEqual(semanticMap.size, 1);
assert.strictEqual(Array.from(semanticMap.values())[0].source, 'nav');

// A route candidate is only a bounded fetch input.  It does not become a
// formal operator record before the existing field extractor succeeds.
const routeOnly = Array.from(emptyMap.values()).find(item => /\/company\//.test(item.url));
assert.strictEqual(hooks.isHighConfidenceCompanyProfileCandidate_(routeOnly), false);
assert.strictEqual(hooks.selectOperatorIdentityProbeCandidate_([routeOnly], 'corporate'), null);

// The operator probe has an intentionally separate, one-page planning lane.
// A direct or explicit profile route may be fetched even when generic links
// lack anchor text, but CSR/IR/safety paths are never promoted by URL alone.
const operatorRoutes = [
  { url: `${origin}/company/contribution/index.html`, source: 'genericRoute', sources: ['genericRoute'], score: 45 },
  { url: `${origin}/company/ir/index.html`, source: 'genericRoute', sources: ['genericRoute'], score: 45 },
  { url: `${origin}/company/safety/index.html`, source: 'genericRoute', sources: ['genericRoute'], score: 45 },
  { url: `${origin}/company/index.html`, source: 'genericRoute', sources: ['genericRoute'], score: 63 },
  { url: `${origin}/company/acme/index.html`, source: 'genericRoute', sources: ['genericRoute'], score: 45 },
  { url: `${origin}/company/profile/index.html`, source: 'genericRoute', sources: ['genericRoute'], score: 45 }
];
assert.strictEqual(hooks.evaluateBoundedOperatorIdentityProbeCandidate_(operatorRoutes[0]).probeEligible, false);
assert.strictEqual(hooks.evaluateBoundedOperatorIdentityProbeCandidate_(operatorRoutes[1]).probeEligible, false);
assert.strictEqual(hooks.evaluateBoundedOperatorIdentityProbeCandidate_(operatorRoutes[2]).probeEligible, false);
assert.strictEqual(hooks.evaluateBoundedOperatorIdentityProbeCandidate_(operatorRoutes[3]).probeEligible, true);
assert.strictEqual(hooks.evaluateBoundedOperatorIdentityProbeCandidate_(operatorRoutes[4]).probeEligible, true);
const selectedGenericOperator = hooks.selectOperatorIdentityProbeCandidate_(operatorRoutes, 'corporate');
assert.strictEqual(selectedGenericOperator.url, `${origin}/company/profile/index.html`);
assert.strictEqual(selectedGenericOperator.operatorIdentityProbeTier, 'generic_route_company_profile');
const selectedPathOnlyCompanyProfile = hooks.selectOperatorIdentityProbeCandidate_([
  operatorRoutes[3], operatorRoutes[4], operatorRoutes[0], operatorRoutes[1], operatorRoutes[2]
], 'corporate');
assert.strictEqual(selectedPathOnlyCompanyProfile.url, `${origin}/company/acme/index.html`);
assert.strictEqual(hooks.isFormalOperatorIdentityRecord_({ observed:true, hasOperatorInfo:false }), false);
assert.strictEqual(hooks.isFormalOperatorIdentityRecord_({ observed:true, hasOperatorInfo:true }), true);

const emptyAudit = hooks.buildOperatorIdentityCandidateAuditV1_([], 'corporate', null, {
  producerReached: true,
  candidateCount: 0,
  completeCandidateCount: 0,
  failureStage: 'candidate_selection_empty',
  noCandidateReason: 'candidate_selection_empty'
});
assert.strictEqual(emptyAudit.producerReached, true);
assert.strictEqual(emptyAudit.candidateCount, 0);
assert.strictEqual(emptyAudit.completeCandidateCount, 0);
assert.strictEqual(emptyAudit.failureStage, 'candidate_selection_empty');
assert.strictEqual(emptyAudit.selection.noCandidateReason, 'candidate_selection_empty');

console.log('generic route candidate fallback fixtures: PASS');
