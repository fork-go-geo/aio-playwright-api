const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

function candidate(path, label, score, extras = {}) {
  return Object.assign({
    url: `https://fixture.invalid${path}`,
    label,
    sources: ['nav', 'sitemap'],
    score
  }, extras);
}

const primary = candidate('/company/primary/', '会社概要', 100);
const fallback = candidate('/company/alternate/', '法人概要', 90);
const candidates = [primary, fallback];

const ranked = hooks.selectOperatorIdentityProbeCandidates_(candidates, 'shop_facility', 2);
assert.deepStrictEqual(ranked.map(item => item.url), [primary.url, fallback.url]);
assert.strictEqual(hooks.selectOperatorIdentityProbeCandidate_(candidates, 'shop_facility').url, primary.url);

const downgrade = { ok: false, errorStage: 'fetch', error: 'redirect_https_downgrade' };
const forbidden403 = { ok: false, errorStage: 'fetch', error: 'http status=403' };
const timedOut = { ok: false, errorStage: 'timeout', error: 'timeout' };
const budgetExhausted = { ok: false, errorStage: 'budget', error: 'overall_budget_exhausted' };
assert.strictEqual(hooks.canAttemptOperatorIdentityFallbackV1_(downgrade, fallback), true);
assert.strictEqual(hooks.canAttemptOperatorIdentityFallbackV1_(forbidden403, fallback), true);
assert.strictEqual(hooks.canAttemptOperatorIdentityFallbackV1_(timedOut, fallback), true);
assert.strictEqual(hooks.canAttemptOperatorIdentityFallbackV1_(budgetExhausted, fallback), false);
assert.strictEqual(hooks.canAttemptOperatorIdentityFallbackV1_({ ok: true }, fallback), false);

const duplicate = Object.assign({}, primary, { url: 'https://fixture.invalid/company/primary/?source=nav#ignored', score: 99 });
assert.deepStrictEqual(
  hooks.selectOperatorIdentityProbeCandidates_([primary, duplicate, fallback], 'shop_facility', 2).map(item => item.url),
  [primary.url, fallback.url]
);
assert.deepStrictEqual(hooks.selectOperatorIdentityProbeCandidates_([primary], 'shop_facility', 2).map(item => item.url), [primary.url]);

const external = candidate('/company/', '運営会社', 80, {
  url: 'https://operator-fixture.invalid/company/',
  sources: ['footer'],
  officialExternalOperatorProfile: true,
  operatorRelationSourceOrigin: 'https://service-fixture.invalid',
  operatorRelationLabel: '運営会社'
});
assert.strictEqual(hooks.selectOperatorIdentityProbeCandidates_([primary, external], 'shop_facility', 2)[1].url, external.url);

const tooMany = Array.from({ length: 1289 }, (_, index) => candidate(`/company/${index}/`, '会社概要', 10));
tooMany[81] = candidate('/company/ignored-after-80/', '法人概要', 9999);
assert.strictEqual(hooks.selectOperatorIdentityProbeCandidates_(tooMany, 'shop_facility', 2).length, 2);
assert.strictEqual(hooks.selectOperatorIdentityProbeCandidates_(tooMany, 'shop_facility', 2)[0].url, tooMany[81].url,
  'a stronger already-discovered candidate beyond the legacy first 80 must be considered before bounded eligibility evaluation');

['corporate', 'generic', 'saas'].forEach(mode => {
  assert.strictEqual(hooks.selectOperatorIdentityProbeCandidates_(candidates, mode, 2).length, 2);
});
const fallbackIdentity = hooks.normalizeOperatorIdentityInfo_(
  hooks.extractOperatorIdentityInfoFromHtml_('<table><tr><th>会社名</th><td>架空運営株式会社</td></tr><tr><th>所在地</th><td>架空都架空区1-1</td></tr></table>', fallback.url, { highConfidenceCompanyProfile: true }),
  'company_profile', { relationEvidence: hooks.buildExplicitOperatorIdentityRelationEvidenceV1_(Object.assign({}, fallback, {
    officialSameOriginOperatorProfile: true, operatorRelationLabel: '運営会社',
    operatorRelationSource: 'explicit_body_company_profile_relation', operatorRelationSourceOrigin: 'https://fixture.invalid'
  })) }
);
assert.strictEqual(fallbackIdentity.hasOperatorInfo, true);
assert.strictEqual(hooks.operatorIdentityFieldsConflict_(
  { companyName: '架空運営株式会社', address: '架空都架空区1-1' },
  { companyName: '別会社株式会社', address: '架空都架空区1-1' }
), true);

const audit = hooks.buildOperatorIdentityCandidateAuditV1_(candidates, 'shop_facility', primary, {
  fallbackCandidate: fallback,
  landingProbeResult: 'fetch_failed',
  landingProbeErrorCode: 'redirect_https_downgrade',
  fallbackProbeAttempted: true,
  fallbackProbeResult: 'fetched',
  fallbackProbeErrorCode: null,
  fallbackSelectionReason: 'safe_alternate_candidate_after_landing_fetch_failed',
  totalOperatorProbeCount: 2
});
assert.strictEqual(audit.selection.landingProbeResult, 'fetch_failed');
assert.strictEqual(audit.selection.landingProbeErrorCode, 'redirect_https_downgrade');
assert.strictEqual(audit.selection.fallbackProbeAttempted, true);
assert.strictEqual(audit.selection.fallbackProbeResult, 'fetched');
assert.strictEqual(audit.selection.totalOperatorProbeCount, 2);
assert.strictEqual(audit.candidates.find(item => item.selectedForFallback).anchorLabel, fallback.label);
assert.ok(!String(audit.selection.landingProbeErrorCode).includes('fixture.invalid'));
assert.ok(!String(audit.selection.fallbackProbeErrorCode || '').includes('fixture.invalid'));
const shortPayload = hooks.buildBalancedShortResponsePayload({
  geoSignalsV1: { operatorIdentityCandidateAuditV1: audit }
});
assert.strictEqual(
  shortPayload.geoSignalsV1.operatorIdentityCandidateAuditV1.selection.fallbackProbeResult,
  'fetched'
);

console.log(JSON.stringify({
  pass: true,
  fixture: 'operator_identity_safe_fallback_v1',
  cases: {
    primarySuccessPriority: true,
    downgradeSafeFallback: true,
    http403SafeFallback: true,
    timeoutSafeFallback: true,
    normalizedDuplicateUrlSkipped: true,
    noFallbackWhenAbsent: true,
    externalOperatorRelationEligible: true,
    formalRecordStillRequired: true,
    conflictingRecordsStillRejected: true,
    budgetExhaustedStopsFallback: true,
    largeCandidateSetPrioritizedBeforeBoundedEligibility: true,
    primaryFailurePreservedInAudit: true,
    shortPayloadRetainsFallbackAudit: true,
    corporateGenericSaasRegression: true
  }
}));
