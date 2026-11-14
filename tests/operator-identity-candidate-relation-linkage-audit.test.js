const assert = require('assert');
const hooks = require('../index.js').__lightBudgetTestHooks;

const sameOrigin = {
  url: 'https://brand.fixture.invalid/company/',
  label: '運営会社',
  sources: ['explicit_body_company_profile_relation'],
  score: 95,
  officialSameOriginOperatorProfile: true,
  operatorRelationLabel: '運営会社',
  operatorRelationSource: 'explicit_body_company_profile_relation',
  operatorRelationSourceOrigin: 'https://brand.fixture.invalid'
};
const fallback = {
  url: 'https://brand.fixture.invalid/outline/',
  label: '会社概要',
  sources: ['nav', 'sitemap'],
  score: 90
};
const ineligible = {
  url: 'https://brand.fixture.invalid/news/',
  label: 'お知らせ',
  sources: ['nav'],
  score: 20
};
const selectedBefore = hooks.selectOperatorIdentityProbeCandidates_([sameOrigin, fallback, ineligible], 'shop_facility', 2)
  .map(item => item.url);

const rawCompany = {
  observed: true,
  conflict: false,
  companyName: 'Fixture Operator Co.',
  hasCompanyName: true,
  hasAddress: false,
  hasTelephone: false
};
const primaryContext = hooks.buildOperatorIdentityProbeAuditContextV1_(
  sameOrigin, 'company_profile', { ok: true }, rawCompany,
  hooks.normalizeOperatorIdentityInfo_(rawCompany, 'company_profile', {
    relationEvidence: hooks.buildExplicitOperatorIdentityRelationEvidenceV1_(sameOrigin)
  })
);
const fallbackContext = hooks.buildOperatorIdentityProbeAuditContextV1_(
  fallback, 'company_profile', { ok: true }, rawCompany, null
);
const audit = hooks.buildOperatorIdentityCandidateAuditV1_([sameOrigin, fallback, ineligible], 'shop_facility', sameOrigin, {
  fallbackCandidate: fallback,
  selectionPriorityLaneCandidateUrls: [sameOrigin.url],
  candidateAuditSecret: Buffer.from('fixture-only-audit-secret'),
  primaryProbeContext: primaryContext,
  fallbackProbeContext: fallbackContext
});

assert.deepStrictEqual(
  hooks.selectOperatorIdentityProbeCandidates_([sameOrigin, fallback, ineligible], 'shop_facility', 2).map(item => item.url),
  selectedBefore,
  'audit must not change selection'
);
assert.strictEqual(audit.probeLinkage.primary.formalRecordGenerated, true);
assert.strictEqual(audit.probeLinkage.primary.relationEvidenceEligible, true);
assert.strictEqual(audit.probeLinkage.primary.provenanceCandidateUrlMatch, true);
assert.strictEqual(audit.probeLinkage.fallback.formalRecordGenerated, false);
assert.strictEqual(audit.probeLinkage.fallback.relationEvidenceReason, 'relation_not_explicit_candidate');
assert.strictEqual(audit.probeLinkage.fallback.formalizationReason, 'relation_not_explicit_candidate');
assert.strictEqual(audit.relationCandidates.length, 1);
assert.strictEqual(audit.relationCandidates[0].candidateKey, audit.probeLinkage.primary.candidateKey);
assert.strictEqual(audit.companyProfileCandidates.some(item => item.candidateKey === audit.probeLinkage.primary.candidateKey), true);
assert.strictEqual(audit.companyProfileCandidateAuditTruncated, false);
assert.match(audit.probeLinkage.primary.candidateKey, /^opidc_[A-Za-z0-9_-]{22}$/);
assert.strictEqual(audit.probeLinkage.primary.candidateKey.includes('brand'), false);
assert.strictEqual(JSON.stringify(audit.relationCandidates).includes('fixture.invalid'), false);
assert.strictEqual(JSON.stringify(audit).includes('fixture.invalid'), false, 'audit must not transport candidate URLs');
assert.strictEqual(audit.candidates.find(item => item.selectedForFallback).selectionDisposition, 'selected_fallback');
assert.strictEqual(audit.candidates.find(item => item.anchorLabel === ineligible.label).selectionDisposition, 'ineligible');

const downgradeContext = hooks.buildOperatorIdentityProbeAuditContextV1_(
  fallback, 'company_profile', {
    ok: false, error: 'redirect_https_downgrade', errorStage: 'redirect',
    redirectAuditV1: { downgrade: true, hop: 1, fromScheme: 'https', toScheme: 'http' }
  }, null, null
);
assert.strictEqual(downgradeContext.errorCode, 'redirect_https_downgrade');
assert.strictEqual(downgradeContext.formalizationReason, 'redirect_https_downgrade');
assert.deepStrictEqual(downgradeContext.redirect, { downgrade: true, hop: 1, fromScheme: 'https', toScheme: 'http' });

console.log(JSON.stringify({
  pass: true,
  fixture: 'operator_identity_candidate_relation_linkage_audit_v1',
  keysNonReversibleWithoutSecret: true,
  selectionUnchanged: true,
  fallbackReasonClassified: true,
  downgradeClassified: true
}));

(async () => {
  const page = await hooks.fetchSubpageHtmlLightOnce_('https://brand.fixture.invalid/company/', {
    fetchImpl: async () => ({ status: 302, ok: false, headers: { get: key => key === 'location' ? 'http://brand.fixture.invalid/company/' : '' } })
  });
  assert.strictEqual(page.ok, false);
  assert.strictEqual(page.error, 'redirect_https_downgrade');
  assert.deepStrictEqual(page.redirectAuditV1, { downgrade: true, hop: 1, fromScheme: 'https', toScheme: 'http' });
  console.log('redirect audit fixture: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
